import type { Schema } from '../../api/control'

export function BackendDetails({ backend }: { backend: Schema['StorageBackendProjection'] }) {
  const fields = [
    ['Name', backend.name],
    ['Azure account', backend.azure_account],
    ['Authentication', backend.auth_mode === 'managed_identity' ? 'Managed Identity' : backend.auth_mode === 'account_key' ? 'Account key reference' : 'Static SAS reference'],
    ['Identity', backend.auth_mode === 'managed_identity' ? backend.managed_identity_client_id ?? 'System / workload identity' : 'Not applicable'],
    ['User Delegation SAS', backend.user_delegation_sas_enabled ? 'Enabled' : 'Disabled'],
    ['Secret reference present', backend.has_secret_ref ? 'Yes' : 'No'],
    ['Region label', backend.region_label ?? 'Not set'],
    ['Status', backend.enabled ? 'Enabled' : 'Disabled'],
    ['Identity references', String(backend.credential_default_count)],
    ['Mapping references', String(backend.virtual_bucket_count)],
  ]
  return <dl style={{ overflowWrap: 'anywhere' }}>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}