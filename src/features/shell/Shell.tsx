import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { Dialog } from '@radix-ui/themes'
import { Activity, Box, CircleGauge, Database, FileKey, KeyRound, LogOut, Menu, ScrollText, ServerCog, ShieldCheck, X } from 'lucide-react'
import { api, ApiError, logout, setCsrfToken } from '../../api/client'
import { controlQueries, type Schema } from '../../api/control'
import { controlKeys } from '../../api/query-keys'
import { ErrorBanner } from '../../components/control'

const groups = [
  { label: 'Overview', links: [{ to: '/', label: 'Overview', icon: CircleGauge }] },
  { label: 'Access', links: [{ to: '/credentials', label: 'S3 identities', icon: KeyRound }] },
  { label: 'Storage', links: [{ to: '/backends', label: 'Azure backends', icon: Database }, { to: '/buckets', label: 'Bucket routing', icon: Box }] },
  { label: 'Authorization', links: [{ to: '/policies', label: 'Policies', icon: ShieldCheck }, { to: '/iam-roles', label: 'IAM roles', icon: ShieldCheck }] },
  { label: 'Operations', links: [{ to: '/keys', label: 'Admin keys', icon: FileKey }, { to: '/audit', label: 'Audit', icon: ScrollText }, { to: '/health', label: 'Health', icon: Activity }] },
]

function Navigation({ close }: { close?: () => void }) {
  return <nav aria-label="Control navigation">{groups.map(group => <div className="nav-group" key={group.label}><div className="nav-group-label">{group.label}</div>{group.links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={close}><Icon size={17} /><span>{label}</span></NavLink>)}</div>)}</nav>
}

export default function Shell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [logoutError, setLogoutError] = useState<Error | null>(null)
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const session = useQuery({ queryKey: controlKeys.session, queryFn: async () => { const value = await api<Schema['SessionResponse']>('/admin/session'); setCsrfToken(value.csrf_token); return { authenticated: value.authenticated, expires_at: value.expires_at } }, retry: false })
  const capabilities = useQuery({ ...controlQueries.capabilities, enabled: !!session.data })
  if (session.isError && session.error instanceof ApiError && session.error.status === 403) { setCsrfToken(null); return <Navigate to="/login" replace /> }
  if (session.isError) return <div className="page"><ErrorBanner error={new Error('Session verification failed')} retry={() => { void session.refetch() }} /></div>
  if (session.isPending) return <div className="loading-screen" role="status"><ServerCog size={24} /> Loading control plane...</div>

  async function signOut() {
    setSigningOut(true)
    setMenuOpen(false)
    setLogoutError(null)
    try { await logout(); client.clear(); navigate('/login', { replace: true }) }
    catch { setLogoutError(new Error('Sign out failed. Retry to revoke the session.')) }
    finally { setSigningOut(false) }
  }
  const exit = <button className="sign-out" disabled={signingOut} onClick={() => { void signOut() }}><LogOut size={16} /> {signingOut ? 'Signing out...' : 'Sign out'}</button>
  return <div className="shell"><a className="skip-link" href="#main-content">Skip to content</a><aside className="sidebar desktop-sidebar"><div className="brand"><ServerCog size={22} /><span>s3proxy</span></div><Navigation />{exit}</aside><main id="main-content" tabIndex={-1}><header className="topbar"><Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}><Dialog.Trigger><button className="icon-button menu-button" aria-label="Open navigation"><Menu size={20} /></button></Dialog.Trigger><Dialog.Content className="mobile-navigation" maxWidth="300px"><div className="dialog-heading"><Dialog.Title>s3proxy</Dialog.Title><Dialog.Close><button className="icon-button" aria-label="Close navigation"><X size={18} /></button></Dialog.Close></div><Dialog.Description className="visually-hidden">Control navigation</Dialog.Description><Navigation close={() => setMenuOpen(false)} />{exit}</Dialog.Content></Dialog.Root><div><span className="environment-dot" />{capabilities.data ? `${capabilities.data.plane} plane` : 'Plane unavailable'}</div><span className="session-status">Session protected</span></header>{logoutError && <ErrorBanner error={logoutError} retry={() => { void signOut() }} />}{!signingOut && <Outlet key={location.pathname} />}</main></div>
}