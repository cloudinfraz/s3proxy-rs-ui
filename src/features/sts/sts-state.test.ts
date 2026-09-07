import { describe, expect, it } from 'vitest'
import type { Schema } from '../../api/control'
import { deriveStsReadiness, guidanceExamples } from './sts-state'

const base: Schema['ControlCapabilities'] = {
  plane: 'control', authz_mode: 'enforce', sts_enabled: false,
  iam_assume_role_enabled: false, assume_role_ready: false,
  iam_account_configured: false, backend_routing_enabled: true,
  usable_registry_auth_modes: ['managed_identity'], legacy_routing_available: true,
  public_sts_endpoint: null, public_s3_endpoint: null,
}

describe('temporary credential readiness', () => {
  it.each([
    [false, false, false, false, 'disabled'],
    [false, false, true, false, 'disabled'],
    [false, true, false, false, 'partial'],
    [false, true, true, false, 'partial'],
    [true, false, false, false, 'partial'],
    [true, false, true, false, 'partial'],
    [true, true, false, false, 'account-missing'],
    [true, true, true, false, 'dependency-unavailable'],
    [false, false, false, true, 'dependency-unavailable'],
    [false, false, true, true, 'dependency-unavailable'],
    [false, true, false, true, 'dependency-unavailable'],
    [false, true, true, true, 'dependency-unavailable'],
    [true, false, false, true, 'dependency-unavailable'],
    [true, false, true, true, 'dependency-unavailable'],
    [true, true, false, true, 'dependency-unavailable'],
    [true, true, true, true, 'ready'],
  ] as const)('derives sts=%s iam=%s account=%s effective=%s as %s', (sts, iam, account, effective, expected) => {
    const result = deriveStsReadiness({ ...base, sts_enabled: sts, iam_assume_role_enabled: iam, iam_account_configured: account, assume_role_ready: effective })
    expect(result).toMatchObject({ code: expected, ready: expected === 'ready' })
  })
})

describe('temporary credential guidance', () => {
  it('keeps absent endpoints explicit and separates STS from S3', () => {
    const examples = guidanceExamples(base)
    expect(examples.stsEndpoint).toBe('<CLIENT_REACHABLE_STS_ENDPOINT>')
    expect(examples.s3Endpoint).toBe('<PUBLIC_S3_DATA_ENDPOINT>')
    expect(examples.cliAssumeRole).toContain("aws sts assume-role")
    expect(examples.cliAssumeRole).toContain("--endpoint-url '<CLIENT_REACHABLE_STS_ENDPOINT>'")
    expect(examples.cliS3).toContain('AWS_SESSION_TOKEN')
    expect(examples.cliS3).toContain("--endpoint-url '<PUBLIC_S3_DATA_ENDPOINT>'")
    expect(examples.javascript).toContain('endpoint: "<CLIENT_REACHABLE_STS_ENDPOINT>"')
    expect(examples.javascript).toContain('endpoint: "<PUBLIC_S3_DATA_ENDPOINT>"')
  })

  it('uses only configured endpoints and semantic placeholders', () => {
    const marker = 'synthetic-secret-must-not-appear'
    const examples = guidanceExamples({
      ...base,
      public_sts_endpoint: 'https://sts.example.test',
      public_s3_endpoint: 'https://s3.example.test',
    })
    const serialized = JSON.stringify(examples)
    expect(serialized).toContain('https://sts.example.test')
    expect(serialized).toContain('https://s3.example.test')
    expect(serialized).not.toContain(marker)
    expect(serialized).not.toContain('SessionPolicy')
    expect(serialized).not.toContain('ExternalId')
    expect(examples.javascript).toContain("from '@aws-sdk/client-sts'")
    expect(examples.javascript).toContain("from '@aws-sdk/client-s3'")
    expect(examples.javascript).toContain('if (!credentials?.AccessKeyId')
  })

  it.each([
    ['https://sts.example.test', null, 'https://sts.example.test', '<PUBLIC_S3_DATA_ENDPOINT>'],
    [null, 'https://s3.example.test', '<CLIENT_REACHABLE_STS_ENDPOINT>', 'https://s3.example.test'],
  ] as const)('preserves independent endpoint configuration', (sts, s3, expectedSts, expectedS3) => {
    expect(guidanceExamples({ ...base, public_sts_endpoint: sts, public_s3_endpoint: s3 })).toMatchObject({
      stsEndpoint: expectedSts,
      s3Endpoint: expectedS3,
    })
  })

  it('quotes configured endpoints for shell and JavaScript contexts', () => {
    const unsafe = "https://sts.example.test/'$(printf unsafe)"
    const examples = guidanceExamples({ ...base, public_sts_endpoint: unsafe })
    expect(examples.cliAssumeRole).toContain("--endpoint-url 'https://sts.example.test/'\\''$(printf unsafe)'")
    expect(examples.cliAssumeRole).not.toContain("--endpoint-url 'https://sts.example.test/'$(printf unsafe)'")
    expect(examples.javascript).toContain(`endpoint: ${JSON.stringify(unsafe)}`)
  })
})
