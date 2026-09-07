// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Outlet } from 'react-router'
import ControlApp from './ControlApp'

vi.mock('./features/shell/Shell', () => ({ default: () => <main><Outlet /></main> }))
vi.mock('./features/shell/LoginPage', () => ({ default: () => <h1>Login route</h1> }))
vi.mock('./features/overview/OverviewPage', () => ({ default: () => <h1>Overview route</h1> }))
vi.mock('./features/operations/AdminKeysPage', () => ({ default: () => <h1>Keys route</h1> }))
vi.mock('./features/operations/AuditPage', () => ({ default: () => <h1>Audit route</h1> }))
vi.mock('./features/operations/HealthPage', () => ({ default: () => <h1>Health route</h1> }))
vi.mock('./features/identities/IdentitiesPage', () => ({ default: () => <h1>Identities route</h1> }))
vi.mock('./features/backends/BackendsPage', () => ({ default: () => <h1>Backends route</h1> }))
vi.mock('./features/buckets/VirtualMappingsPage', () => ({ default: () => <h1>Buckets route</h1> }))
vi.mock('./features/roles/RolesPage', () => ({ default: () => <h1>Roles route</h1> }))
vi.mock('./features/sts/TemporaryCredentialsPage', () => ({ default: () => <h1>Temporary credentials route</h1> }))
vi.mock('./features/policies/PolicyWorkspace', () => ({ default: () => <h1>Policies route</h1> }))

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('ControlApp routing', () => {
  it.each([
    ['/login', 'Login route'],
    ['/health', 'Health route'],
    ['/temporary-credentials', 'Temporary credentials route'],
  ])('renders %s through the configured base path', async (path, heading) => {
    window.history.replaceState(null, '', path)
    render(<ControlApp />)

    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy()
  })

  it('replaces an unknown route with the overview', async () => {
    window.history.replaceState(null, '', '/not-a-route')
    render(<ControlApp />)

    expect(await screen.findByRole('heading', { name: 'Overview route' })).toBeTruthy()
    expect(window.location.pathname).toBe('/')
  })
})