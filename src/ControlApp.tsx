import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Theme } from '@radix-ui/themes'
import Shell from './features/shell/Shell'
import LoginPage from './features/shell/LoginPage'
import OverviewPage from './features/overview/OverviewPage'
import AdminKeysPage from './features/operations/AdminKeysPage'
import AuditPage from './features/operations/AuditPage'
import HealthPage from './features/operations/HealthPage'
import ResourcePage from './features/resources/ResourcePage'
import '@radix-ui/themes/styles.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './control.css'
import './features/shell/shell.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } })

export default function ControlApp() {
  return <Theme accentColor="jade" grayColor="sand" radius="small"><QueryClientProvider client={queryClient}><BrowserRouter basename={import.meta.env.BASE_URL}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<Shell />}>
      <Route index element={<OverviewPage />} />
      {['credentials', 'buckets', 'backends', 'policies'].map(path => <Route key={path} path={path} element={<ResourcePage key={path} resourceName={path} />} />)}
      <Route path="keys" element={<AdminKeysPage />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="health" element={<HealthPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></BrowserRouter></QueryClientProvider></Theme>
}