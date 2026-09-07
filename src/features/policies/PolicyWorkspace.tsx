import { useState } from 'react'
import { Activity, DatabaseZap, Link, ShieldCheck } from 'lucide-react'
import { Page } from '../../components/control'
import BucketPolicies from './BucketPolicies'
import IdentityPolicies from './IdentityPolicies'
import ManagedPolicies from './ManagedPolicies'
import PolicyDiagnostics from './PolicyDiagnostics'
import './policies.css'

type View = 'managed' | 'identity' | 'bucket' | 'diagnostics'

const views: Array<{ id: View; label: string; icon: typeof ShieldCheck }> = [
  { id: 'managed', label: 'Managed policies', icon: ShieldCheck },
  { id: 'identity', label: 'Identity attachments', icon: Link },
  { id: 'bucket', label: 'Bucket policies', icon: DatabaseZap },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
]

export default function PolicyWorkspace() {
  const [view, setView] = useState<View>('managed')
  return <Page title="Authorization policies" subtitle="Review effective S3 authorization metadata without changing Azure storage or routing">
    <div className="policy-tabs" role="tablist" aria-label="Policy workspace views">{views.map(item => <button key={item.id} role="tab" aria-selected={view === item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><item.icon size={16} />{item.label}</button>)}</div>
    {view === 'managed' && <ManagedPolicies />}
    {view === 'identity' && <IdentityPolicies />}
    {view === 'bucket' && <BucketPolicies />}
    {view === 'diagnostics' && <PolicyDiagnostics />}
  </Page>
}