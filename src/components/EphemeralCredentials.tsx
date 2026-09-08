import { OneTimeSecretDialog } from './control'

export type EphemeralCredentialMaterial = {
  accessKey: string
  secretKey: string
  endpoint?: string
}

export function EphemeralCredentialBody({ material }: { material: EphemeralCredentialMaterial }) {
  return <>
    <div className="one-time-material">
      <label>Access key<code>{material.accessKey}</code></label>
      <label>Secret key<code>{material.secretKey}</code></label>
      {material.endpoint && <label>Endpoint<code>{material.endpoint}</code></label>}
    </div>
  </>
}

export function EphemeralCredentials({ material, dismiss, acknowledgeLabel, pending }: { material: EphemeralCredentialMaterial; dismiss: () => void; acknowledgeLabel?: string; pending?: boolean }) {
  return <OneTimeSecretDialog title="One-time S3 credentials" description="These credentials will not be available after acknowledgement." acknowledge={dismiss} acknowledgeLabel={acknowledgeLabel} pending={pending}>
    <EphemeralCredentialBody material={material} />
  </OneTimeSecretDialog>
}