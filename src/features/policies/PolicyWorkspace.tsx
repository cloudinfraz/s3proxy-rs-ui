import { useState } from 'react'
import { Tabs } from '@radix-ui/themes'
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
    <Tabs.Root value={view} onValueChange={value => setView(value as View)}><Tabs.List className="policy-tabs" aria-label="Policy workspace views">{views.map(item => <Tabs.Trigger key={item.id} value={item.id}><item.icon size={16} />{item.label}</Tabs.Trigger>)}</Tabs.List>
      <Tabs.Content value="managed"><ManagedPolicies /></Tabs.Content>
      <Tabs.Content value="identity"><IdentityPolicies /></Tabs.Content>
      <Tabs.Content value="bucket"><BucketPolicies /></Tabs.Content>
      <Tabs.Content value="diagnostics"><PolicyDiagnostics /></Tabs.Content>
    </Tabs.Root>
  </Page>
}