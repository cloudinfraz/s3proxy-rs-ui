import { Modal } from './control'

export type EphemeralCredentialMaterial = {
  accessKey: string
  secretKey: string
  endpoint?: string
}

export function EphemeralCredentialBody({ material, dismiss }: { material: EphemeralCredentialMaterial; dismiss: () => void }) {
  return <>
    <div className="one-time-material">
      <label>Access key<code>{material.accessKey}</code></label>
      <label>Secret key<code>{material.secretKey}</code></label>
      {material.endpoint && <label>Endpoint<code>{material.endpoint}</code></label>}
    </div>
    <div className="dialog-actions"><button className="primary" onClick={dismiss}>Dismiss</button></div>
  </>
}

export function EphemeralCredentials({ material, dismiss }: { material: EphemeralCredentialMaterial; dismiss: () => void }) {
  return <Modal title="One-time S3 credentials" description="These credentials will not be available after dismissal." onClose={dismiss}>
    <EphemeralCredentialBody material={material} dismiss={dismiss} />
  </Modal>
}