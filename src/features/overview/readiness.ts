import type { Schema } from '../../api/control'

export type PresentedFinding = { message: string; href: string }

const routes: Record<Schema['ConfigurationResourceKind'], string> = {
  identity: '/credentials',
  virtual_bucket: '/buckets',
  backend: '/azure-backends',
  iam_role: '/iam-roles',
  admin_api_key: '/keys',
}

function named(label: string, name: string | null): string {
  return name ? `${label} ${name}` : `A ${label.toLowerCase()}`
}

export function presentFinding(finding: Schema['ConfigurationFinding']): PresentedFinding {
  const label = finding.display_name
  let message: string
  switch (finding.code) {
    case 'identity_no_enabled_mapping': message = 'A virtual identity has no enabled bucket mappings.'; break
    case 'identity_no_usable_backend': message = 'A direct identity has no usable backend.'; break
    case 'mapping_owner_disabled': message = `${named('Bucket mapping', label)} belongs to a disabled identity.`; break
    case 'mapping_no_usable_backend': message = `${named('Bucket mapping', label)} has no usable backend.`; break
    case 'backend_unsupported_auth_mode': {
      const impact = finding.affected_count === null ? '' : ` ${finding.affected_count} resources are affected.`
      message = `${named('Backend', label)} uses an authentication mode unavailable to this deployment.${impact}`
      break
    }
    case 'role_owner_disabled': message = `${named('Role', label)} belongs to a disabled identity.`; break
    case 'role_no_attached_policy': message = `${named('Role', label)} has no attached policy.`; break
    case 'admin_key_expired': message = `${named('Admin key', label)} has expired.`; break
    case 'admin_key_expiring': message = `${named('Admin key', label)} expires within seven days.`; break
  }
  return { message, href: routes[finding.resource_kind] }
}