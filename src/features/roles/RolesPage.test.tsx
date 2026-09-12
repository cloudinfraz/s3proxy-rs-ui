// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Schema } from '../../api/control'
import { invokeOperation } from '../../api/operations'
import RolesPage from './RolesPage'

vi.mock('@tanstack/react-query', async importOriginal => ({ ...(await importOriginal<typeof import('@tanstack/react-query')>()), useQuery: vi.fn() }))
vi.mock('../../api/operations', () => ({ invokeOperation: vi.fn() }))
vi.mock('../../components/control', () => ({
  DialogFlow: ({ children }: { children: ReactNode }) => <>{children}</>,
  Modal: ({ title, children, actions, onClose }: { title: string; children: ReactNode; actions?: ReactNode; onClose: () => void }) => <section role="dialog" aria-label={title}>{actions}{children}<button onClick={onClose}>Close dialog</button></section>,
  Page: ({ title, action, children }: { title: string; action: ReactNode; children: ReactNode }) => <main><h1>{title}</h1>{action}{children}</main>,
  RefreshButton: ({ refresh }: { refresh: () => void }) => <button onClick={refresh}>Refresh</button>,
  ErrorBanner: ({ error, retry }: { error: Error; retry?: () => void }) => <div role="alert">{error.message}{retry && <button onClick={retry}>Retry</button>}</div>,
  DataTable: ({ rows, loading, columns }: { rows: unknown[]; loading: boolean; columns: Array<{ label: string; value: (row: never) => ReactNode }> }) => loading ? <p role="status">Loading...</p> : <div>{rows.length ? rows.map((row, index) => <div key={index}>{columns.map(column => <span key={column.label}>{column.value(row as never)}</span>)}</div>) : 'No records'}</div>,
}))
vi.mock('@radix-ui/themes', () => ({ DropdownMenu: {
  Root: ({ children }: { children: ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: ReactNode }) => <>{children}</>,
  Separator: () => <hr />,
  Item: ({ children, onSelect, disabled }: { children: ReactNode; onSelect: () => void; disabled?: boolean }) => <button disabled={disabled} onClick={onSelect}>{children}</button>,
} }))
vi.mock('./RoleDialog', () => ({ default: ({ operation, close, changed }: { operation: string; close: () => void; changed: (detail: Schema['AdminIamRoleDetail'] | null) => void }) => <section role="dialog" aria-label={operation}><button onClick={close}>Close operation</button><button onClick={() => { changed(null); close() }}>Apply deletion</button></section> }))

const limits: Schema['IamRoleLimits'] = { min_duration_seconds: 3600, max_duration_seconds: 43200, max_retirement_batch: 1000, retained_count_cap: 1000, default_page_size: 100, max_page_size: 200 }
const role: Schema['AdminIamRole'] = { id: 'role-id', role_id: 'stable-role', account_id: '123456789012', role_path: '/', role_name: 'Reader', role_arn: 'arn:aws:iam::123456789012:role/Reader', resource_credential_id: '11111111-1111-4111-8111-111111111111', max_session_duration_seconds: 3600, enabled: true, lifecycle_revision: 1, trust_revision: 2, attachment_revision: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const detail: Schema['AdminIamRoleDetail'] = { role, trust: { statements: [{ effect: 'Allow', principals: ['principal'], conditions: [] }] }, policies: [{ id: 'policy', name: 'ReadOnly', revision: 1 }], retained_sessions: { count: 2, truncated: false, deletion_eligible: false }, impact_token: 'token', limits }
const query = (overrides: Record<string, unknown> = {}) => ({ data: undefined, isError: false, isPending: false, isFetching: false, error: null, refetch: vi.fn(), ...overrides })

function mockQueries(roles: ReturnType<typeof query>, capabilities = query()) {
  vi.mocked(useQuery).mockImplementation(options => ((options as { queryKey?: readonly unknown[] }).queryKey?.includes('capabilities') ? capabilities : roles) as never)
}

afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('RolesPage', () => {
  it('renders loading and list errors', () => {
    mockQueries(query({ isPending: true }))
    const { unmount } = render(<RolesPage />)
    expect(screen.getByRole('status').textContent).toBe('Loading...')
    unmount()
    mockQueries(query({ isError: true, error: new Error('roles unavailable') }))
    render(<RolesPage />)
    expect(screen.getByRole('alert').textContent).toContain('roles unavailable')
    expect((screen.getByRole('button', { name: 'Create role' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('loads role detail and routes major detail actions into dialogs', async () => {
    mockQueries(query({ data: { items: [role], next_after_id: null, limits } }), query({ data: { assume_role_ready: false } }))
    vi.mocked(invokeOperation).mockResolvedValue(detail as never)
    render(<RolesPage />)
    expect(screen.getByText('/Reader')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View Reader' }))
    expect(await screen.findByText(role.role_arn)).toBeTruthy()
    expect(screen.getByText('ReadOnly')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Replace trust/ }))
    expect(screen.getByRole('dialog', { name: 'trust' })).toBeTruthy()
  })

  it('shows detail loading and failure, then retries the same role', async () => {
    let rejectRequest: (reason: Error) => void = () => undefined
    const pending = new Promise<never>((_, reject) => { rejectRequest = reject })
    mockQueries(query({ data: { items: [role], next_after_id: null, limits } }))
    vi.mocked(invokeOperation).mockReturnValueOnce(pending)
    render(<RolesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'View Reader' }))
    expect(screen.getByRole('status').textContent).toBe('Loading role...')
    rejectRequest(new Error('detail denied'))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('detail denied'))
    vi.mocked(invokeOperation).mockResolvedValueOnce(detail as never)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(invokeOperation).toHaveBeenCalledTimes(2))
  })

  it('opens create only after list metadata is ready', () => {
    mockQueries(query({ data: { items: [], next_after_id: null, limits } }))
    render(<RolesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }))
    expect(screen.getByRole('dialog', { name: 'create' })).toBeTruthy()
  })

  it('does not reopen a closed detail popup when a delayed response arrives', async () => {
    let resolveRequest: (value: Schema['AdminIamRoleDetail']) => void = () => undefined
    const response = new Promise<Schema['AdminIamRoleDetail']>(resolve => { resolveRequest = resolve })
    mockQueries(query({ data: { items: [role], next_after_id: null, limits } }))
    vi.mocked(invokeOperation).mockReturnValueOnce(response as never)
    render(<RolesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'View Reader' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Loading role...')
    expect(screen.getByRole('button', { name: 'Change duration' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    resolveRequest(detail)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText(role.role_arn)).toBeNull()
  })

  it('moves between role pages and refreshes the selected detail', async () => {
    const roles = query({ data: { items: [role], next_after_id: 'next role', limits } })
    mockQueries(roles)
    vi.mocked(invokeOperation).mockResolvedValue(detail as never)
    render(<RolesPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Next role page' }))
    expect(screen.getByText('Page 2')).toBeTruthy()
    expect(vi.mocked(useQuery).mock.calls.some(([options]) => (options as { queryKey?: unknown[] }).queryKey?.includes('next role'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Previous role page' }))
    expect(screen.getByText('Page 1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'View Reader' }))
    await screen.findByText(role.role_arn)
    fireEvent.click(screen.getAllByRole('button', { name: 'Refresh' })[0])
    await waitFor(() => expect(invokeOperation).toHaveBeenCalledTimes(2))
    expect(roles.refetch).toHaveBeenCalledOnce()
  })

  it('routes edit and delete actions and clears details after deletion', async () => {
    const deletable = { ...detail, role: { ...role, enabled: false }, retained_sessions: { count: 0, truncated: false, deletion_eligible: true } }
    mockQueries(query({ data: { items: [deletable.role], next_after_id: null, limits } }))
    vi.mocked(invokeOperation).mockResolvedValue(deletable as never)
    render(<RolesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'View Reader' }))
    await screen.findByText(role.role_arn)

    fireEvent.click(screen.getByRole('button', { name: 'Change duration' }))
    expect(screen.getByRole('dialog', { name: 'settings' })).toBeTruthy()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'Role details' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close operation' }))
    expect(screen.getByRole('region', { name: 'Role details' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete role' }))
    expect(screen.getByRole('dialog', { name: 'delete' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apply deletion' }))
    expect(screen.queryByRole('region', { name: 'Role details' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})