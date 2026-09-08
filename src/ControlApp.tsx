import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Theme } from '@radix-ui/themes'
import Shell from './features/shell/Shell'
import LoginPage from './features/shell/LoginPage'
import OverviewPage from './features/overview/OverviewPage'
import AdminKeysPage from './features/operations/AdminKeysPage'
import AuditPage from './features/operations/AuditPage'
import HealthPage from './features/operations/HealthPage'
import IdentitiesPage from './features/identities/IdentitiesPage'
import BackendsPage from './features/backends/BackendsPage'
import VirtualMappingsPage from './features/buckets/VirtualMappingsPage'
import RolesPage from './features/roles/RolesPage'
import TemporaryCredentialsPage from './features/sts/TemporaryCredentialsPage'
import PolicyWorkspace from './features/policies/PolicyWorkspace'
import AppErrorLayer from './components/AppErrorLayer'
import { SessionRevocationProvider } from './features/shell/revocation'
import { useSessionRevocation } from './features/shell/revocation-context'
import '@radix-ui/themes/styles.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './control.css'
import './features/shell/shell.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: 'always' } } })

function ProtectedShell() {
  const revocation = useSessionRevocation()
  return revocation.status === 'idle' ? <Shell /> : <Navigate to="/login" replace />
}

export default function ControlApp() {
  return <Theme accentColor="jade" grayColor="sand" radius="small"><AppErrorLayer><QueryClientProvider client={queryClient}><SessionRevocationProvider><BrowserRouter basename={import.meta.env.BASE_URL}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedShell />}>
      <Route index element={<OverviewPage />} />
      <Route path="credentials" element={<IdentitiesPage />} />
      <Route path="azure-backends" element={<BackendsPage />} />
      <Route path="buckets" element={<VirtualMappingsPage />} />
      <Route path="policies" element={<PolicyWorkspace />} />
      <Route path="iam-roles" element={<RolesPage />} />
      <Route path="temporary-credentials" element={<TemporaryCredentialsPage />} />
      <Route path="keys" element={<AdminKeysPage />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="health" element={<HealthPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></BrowserRouter></SessionRevocationProvider></QueryClientProvider></AppErrorLayer></Theme>
}