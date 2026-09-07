import type { Schema } from '../../api/control'

export type StsReadinessCode = 'disabled' | 'partial' | 'account-missing' | 'dependency-unavailable' | 'ready'

export type StsReadiness = {
  code: StsReadinessCode
  title: string
  detail: string
  ready: boolean
}

const readiness: Record<StsReadinessCode, Omit<StsReadiness, 'code'>> = {
  disabled: {
    title: 'AssumeRole disabled',
    detail: 'STS issuance and IAM AssumeRole are disabled for this deployment.',
    ready: false,
  },
  partial: {
    title: 'AssumeRole partially configured',
    detail: 'STS issuance and IAM AssumeRole must both be enabled.',
    ready: false,
  },
  'account-missing': {
    title: 'IAM account configuration required',
    detail: 'Configure a valid IAM account before AssumeRole can issue credentials.',
    ready: false,
  },
  'dependency-unavailable': {
    title: 'AssumeRole dependency unavailable',
    detail: 'The gates and IAM account are configured, but the database-backed issuer is not ready.',
    ready: false,
  },
  ready: {
    title: 'AssumeRole ready',
    detail: 'The configured control endpoint can issue temporary credentials for eligible roles.',
    ready: true,
  },
}

export function deriveStsReadiness(capabilities: Schema['ControlCapabilities']): StsReadiness {
  const gatesReady = capabilities.sts_enabled && capabilities.iam_assume_role_enabled
  const prerequisitesReady = gatesReady && capabilities.iam_account_configured
  let code: StsReadinessCode
  if (capabilities.assume_role_ready && !prerequisitesReady) code = 'dependency-unavailable'
  else if (capabilities.assume_role_ready) code = 'ready'
  else if (!capabilities.sts_enabled && !capabilities.iam_assume_role_enabled) code = 'disabled'
  else if (!gatesReady) code = 'partial'
  else if (!capabilities.iam_account_configured) code = 'account-missing'
  else code = 'dependency-unavailable'
  return { code, ...readiness[code] }
}

export type StsGuidanceExamples = {
  cliAssumeRole: string
  cliS3: string
  javascript: string
  stsEndpoint: string
  s3Endpoint: string
}

const STS_ENDPOINT_PLACEHOLDER = '<CLIENT_REACHABLE_STS_ENDPOINT>'
const S3_ENDPOINT_PLACEHOLDER = '<PUBLIC_S3_DATA_ENDPOINT>'

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function guidanceExamples(capabilities: Schema['ControlCapabilities']): StsGuidanceExamples {
  const stsEndpoint = capabilities.public_sts_endpoint ?? STS_ENDPOINT_PLACEHOLDER
  const s3Endpoint = capabilities.public_s3_endpoint ?? S3_ENDPOINT_PLACEHOLDER
  const shellStsEndpoint = shellSingleQuote(stsEndpoint)
  const shellS3Endpoint = shellSingleQuote(s3Endpoint)
  const javascriptStsEndpoint = JSON.stringify(stsEndpoint)
  const javascriptS3Endpoint = JSON.stringify(s3Endpoint)
  return {
    stsEndpoint,
    s3Endpoint,
    cliAssumeRole: `AWS_ACCESS_KEY_ID='<LONG_TERM_S3_ACCESS_KEY>' \\
AWS_SECRET_ACCESS_KEY='<LONG_TERM_S3_SECRET_KEY>' \\
aws sts assume-role \\
  --endpoint-url ${shellStsEndpoint} \\
  --region '<SIGNING_REGION>' \\
  --role-arn '<ROLE_ARN>' \\
  --role-session-name '<SESSION_NAME>'`,
    cliS3: `AWS_ACCESS_KEY_ID='<TEMPORARY_ACCESS_KEY>' \\
AWS_SECRET_ACCESS_KEY='<TEMPORARY_SECRET_KEY>' \\
AWS_SESSION_TOKEN='<SESSION_TOKEN>' \\
aws s3api list-buckets \\
  --endpoint-url ${shellS3Endpoint} \\
  --region '<SIGNING_REGION>'`,
    javascript: `import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { S3Client } from '@aws-sdk/client-s3';

const sts = new STSClient({
  endpoint: ${javascriptStsEndpoint},
  region: '<SIGNING_REGION>',
  credentials: {
    accessKeyId: process.env.S3PROXY_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3PROXY_SECRET_ACCESS_KEY,
  },
});
const assumed = await sts.send(new AssumeRoleCommand({
  RoleArn: '<ROLE_ARN>',
  RoleSessionName: '<SESSION_NAME>',
}));
const credentials = assumed.Credentials;
if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
  throw new Error('AssumeRole response did not include complete credentials');
}
const s3 = new S3Client({
  endpoint: ${javascriptS3Endpoint},
  region: '<SIGNING_REGION>',
  forcePathStyle: true,
  credentials: {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken,
  },
});`,
  }
}
