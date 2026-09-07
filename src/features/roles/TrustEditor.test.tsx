// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Schema } from '../../api/control'
import TrustEditor from './TrustEditor'

const identities: Schema['IdentityProjection'][] = [{
  credential_id: '11111111-1111-4111-8111-111111111111', s3_access_key: 'OWNER_KEY', azure_account: 'account',
  access_mode: 'direct', use_managed_identity: true, versioning_enabled: false, default_backend_id: null,
  enabled: true, virtual_bucket_count: 0, policy_attachment_count: 0,
}]

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('TrustEditor', () => {
  it('updates principals, effect, and condition values without mutating its input', () => {
    const statements = [{ effect: 'Allow' as const, principals: [], conditions: [] }]
    const change = vi.fn()
    const { rerender } = render(<TrustEditor account="123456789012" statements={statements} identities={identities} change={change} />)
    const principal = screen.getByRole('option', { name: 'OWNER_KEY' }) as HTMLOptionElement
    principal.selected = true
    fireEvent.change(screen.getByLabelText('Statement 1 principals'))
    expect(change).toHaveBeenLastCalledWith([{ ...statements[0], principals: ['arn:aws:iam::123456789012:user/s3proxy/11111111-1111-4111-8111-111111111111'] }])

    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }))
    const withCondition = [{ ...statements[0], conditions: [{ operator: 'StringEquals', key: 'sts:ExternalId', value: '' }] }]
    expect(change).toHaveBeenLastCalledWith(withCondition)
    rerender(<TrustEditor account="123456789012" statements={withCondition} identities={identities} change={change} />)
    fireEvent.change(screen.getByLabelText('New value'), { target: { value: 'tenant-secret' } })
    expect(change).toHaveBeenLastCalledWith([{ ...withCondition[0], conditions: [{ ...withCondition[0].conditions[0], value: 'tenant-secret' }] }])
    expect(statements[0].conditions).toEqual([])
  })

  it('adds and removes statements while preserving the one-statement minimum', () => {
    const first = { effect: 'Allow' as const, principals: [], conditions: [] }
    const change = vi.fn()
    const { rerender } = render(<TrustEditor account="123456789012" statements={[first]} identities={identities} change={change} />)
    expect((screen.getByRole('button', { name: 'Remove statement 1' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Add statement' }))
    expect(change).toHaveBeenCalledWith([first, { effect: 'Allow', principals: [], conditions: [] }])
    rerender(<TrustEditor account="123456789012" statements={[first, first]} identities={identities} change={change} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove statement 2' }))
    expect(change).toHaveBeenLastCalledWith([first])
  })

  it('edits effects and condition types, then removes the selected condition', () => {
    const statements = [{
      effect: 'Allow' as const,
      principals: [],
      conditions: [{ operator: 'StringLike', key: 'sts:ExternalId', value: 'secret' }],
    }]
    const change = vi.fn()
    const { rerender } = render(<TrustEditor account="123456789012" statements={statements} identities={identities} change={change} />)

    fireEvent.change(screen.getByLabelText('Effect'), { target: { value: 'Deny' } })
    expect(change).toHaveBeenLastCalledWith([{ ...statements[0], effect: 'Deny' }])

    fireEvent.change(screen.getByLabelText('Condition key'), { target: { value: 'aws:SecureTransport' } })
    const secureTransport = [{ ...statements[0], conditions: [{ operator: 'Bool', key: 'aws:SecureTransport', value: '' }] }]
    expect(change).toHaveBeenLastCalledWith(secureTransport)
    rerender(<TrustEditor account="123456789012" statements={secureTransport} identities={identities} change={change} />)

    fireEvent.change(screen.getByLabelText('New value'), { target: { value: 'true' } })
    expect(change).toHaveBeenLastCalledWith([{ ...secureTransport[0], conditions: [{ ...secureTransport[0].conditions[0], value: 'true' }] }])

    fireEvent.click(screen.getByRole('button', { name: 'Remove condition 1 from statement 1' }))
    expect(change).toHaveBeenLastCalledWith([{ ...secureTransport[0], conditions: [] }])
    expect(statements[0].conditions).toEqual([{ operator: 'StringLike', key: 'sts:ExternalId', value: 'secret' }])
  })

  it('changes an operator and identifies disabled principal options', () => {
    const statements = [{
      effect: 'Allow' as const,
      principals: [],
      conditions: [{ operator: 'StringEquals', key: 'sts:SourceIdentity', value: '' }],
    }]
    const change = vi.fn()
    render(<TrustEditor account="123456789012" statements={statements} identities={[{ ...identities[0], enabled: false }]} change={change} />)

    expect(screen.getByRole('option', { name: 'OWNER_KEY (disabled)' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'StringLike' } })
    expect(change).toHaveBeenLastCalledWith([{ ...statements[0], conditions: [{ ...statements[0].conditions[0], operator: 'StringLike' }] }])
  })
})