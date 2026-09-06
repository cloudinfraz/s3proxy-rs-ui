import type { Schema } from '../../api/control'
import { Modal } from '../../components/control'
import { directListExamples, directTarget } from './direct-details'
import './direct-details.css'

export default function DirectMappingDetails({ identity, backends, capabilities, onClose }: {
  identity?: Schema['IdentityProjection']
  backends?: readonly Schema['StorageBackendProjection'][]
  capabilities?: Schema['ControlCapabilities']
  onClose: () => void
}) {
  const target = identity ? directTarget({ identity, backends, capabilities }) : undefined
  const examples = directListExamples(capabilities?.public_s3_endpoint)
  return <Modal title="Direct mapping details" description="Routing metadata only; Azure access is not verified." onClose={onClose}>
    <div className="direct-mapping-details">
      {!identity || identity.access_mode !== 'direct' ? <p role="status">Direct identity metadata unavailable</p> : <>
        <dl>
          <dt>Identity ID</dt><dd>{identity.credential_id ?? 'Unavailable'}</dd>
          <dt>Access key</dt><dd>{identity.s3_access_key}</dd>
          <dt>Status</dt><dd>{identity.enabled === null ? 'Unavailable' : identity.enabled ? 'Enabled' : 'Disabled'}</dd>
          <dt>Routing source</dt><dd>{target?.source}</dd>
          <dt>Effective Azure account</dt><dd>{target?.account ?? 'Unavailable'}</dd>
          <dt>Effective backend</dt><dd>{target?.backend ?? 'None'}</dd>
          <dt>Configured default backend ID</dt><dd>{identity.default_backend_id ?? 'None'}</dd>
          <dt>Bucket naming</dt><dd>S3 bucket name equals Azure container name</dd>
          <dt>Versioning</dt><dd>{identity.versioning_enabled ? 'Enabled' : 'Disabled'}</dd>
          <dt>Routing state</dt><dd>{target?.blocked ?? 'Configured'}</dd>
          <dt>Public S3 endpoint</dt><dd>{examples?.endpoint ?? 'Unavailable'}</dd>
        </dl>
        {examples && <details><summary>List request examples</summary>
          <h3>AWS Profile</h3><pre>{examples.profile}</pre>
          <h3>AWS CLI</h3><pre>{examples.cli}</pre>
          <h3>JavaScript</h3><pre>{examples.javascript}</pre>
        </details>}
      </>}
      <div className="dialog-actions"><button onClick={onClose}>Close</button></div>
    </div>
  </Modal>
}