// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../../api/client'
import type { Schema } from '../../api/control'
import RoleDialog from './RoleDialog'

vi.mock('@tanstack/react-query', async importOriginal => ({ ...(await importOriginal<typeof import('@tanstack/react-query')>()), useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('../../api/client', () => ({ api: vi.fn(), ApiError: class extends Error { status = 409 } }))
vi.mock('../../api/query-keys', async importOriginal => ({ ...(await importOriginal<typeof import('../../api/query-keys')>()), invalidateControl: vi.fn(), controlKeys: { list: (value: string) => ['control', value] } }))
vi.mock('../../components/control', () => ({
  ErrorBanner: ({ error }: { error: Error }) => <div role="alert">{error.message}</div>,
  Modal: ({ title, children }: { title: string; children: ReactNode }) => <section role="dialog" aria-label={title}>{children}</section>,
  DestructiveDialog: ({ title, confirmLabel, children, onConfirm }: { title: string; confirmLabel: string; children: ReactNode; onConfirm: () => void }) => <section role="alertdialog" aria-label={title}>{children}<button onClick={onConfirm}>{confirmLabel}</button></section>,
}))

const limits: Schema['IamRoleLimits'] = { min_duration_seconds: 3600, max_duration_seconds: 43200, max_retirement_batch: 1000, retained_count_cap: 1000, default_page_size: 100, max_page_size: 200 }
const credentialId = '11111111-1111-4111-8111-111111111111'
const identity = { credential_id: credentialId, s3_access_key: 'OWNER_KEY', enabled: true }
const role: Schema['AdminIamRole'] = { id: 'role-id', role_id: 'stable-role', account_id: '123456789012', role_path: '/', role_name: 'Reader', role_arn: 'arn:aws:iam::123456789012:role/Reader', resource_credential_id: credentialId, max_session_duration_seconds: 3600, enabled: true, lifecycle_revision: 1, trust_revision: 1, attachment_revision: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const detail: Schema['AdminIamRoleDetail'] = { role, trust: { statements: [] }, policies: [], retained_sessions: { count: 0, truncated: false, deletion_eligible: false }, impact_token: 'impact', limits }
const policy: Schema['AdminIamRolePolicy'] = { id: 'policy-id', name: 'ReadOnly', revision: 2 }
const identityQuery = { data: [identity], isError: false, isFetching: false, refetch: vi.fn().mockResolvedValue({ data: [identity], isError: false }) }
const policyQuery = { data: { items: [], next_after_id: null }, isError: false, isFetching: false, refetch: vi.fn() }
beforeEachMock()
function beforeEachMock() {
  identityQuery.refetch.mockResolvedValue({ data: [identity], isError: false })
  policyQuery.refetch.mockResolvedValue(undefined)
  vi.mocked(useQuery).mockImplementation(options => ((options as { enabled?: boolean }).enabled === false ? policyQuery : identityQuery) as never)
}
afterEach(() => { cleanup(); vi.resetAllMocks(); beforeEachMock() })

describe('RoleDialog', () => {
  it('validates required create fields before calling the API', () => {
    render(<RoleDialog operation="create" limits={limits} close={vi.fn()} changed={vi.fn()} />)
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    expect(screen.getByRole('alert').textContent).toContain('Role name must contain')
    expect(api).not.toHaveBeenCalled()
  })

  it('reviews and creates a role from controlled form state', async () => {
    const close = vi.fn()
    const changed = vi.fn()
    vi.mocked(api).mockResolvedValue(detail)
    render(<RoleDialog operation="create" limits={limits} close={close} changed={changed} />)
    fireEvent.change(screen.getByLabelText('Account ID'), { target: { value: '123456789012' } })
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Reader' } })
    fireEvent.change(screen.getByLabelText('Resource owner'), { target: { value: credentialId } })
    const principal = screen.getByLabelText('Statement 1 principals').querySelector('option') as HTMLOptionElement
    principal.selected = true
    fireEvent.change(screen.getByLabelText('Statement 1 principals'))
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    expect(await screen.findByRole('dialog', { name: 'Confirm: Create IAM role' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/ui/roles', expect.objectContaining({ method: 'POST' })))
    expect(changed).toHaveBeenCalledWith(detail)
    expect(close).toHaveBeenCalledOnce()
  })

  it('reviews a duration change and keeps the dialog open after mutation failure', async () => {
    vi.mocked(api).mockResolvedValueOnce(detail).mockRejectedValueOnce(new Error('update rejected'))
    render(<RoleDialog operation="settings" initial={detail} limits={limits} close={vi.fn()} changed={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Maximum duration (seconds)'), { target: { value: '7200' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    expect(await screen.findByText('3600 to 7200 seconds')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('update rejected'))
    expect(screen.getByRole('dialog', { name: 'Change duration' })).toBeTruthy()
  })

  it('refreshes locally owned role details after a mutation conflict', async () => {
    const latest = { ...detail, role: { ...role, max_session_duration_seconds: 7200, lifecycle_revision: 2 } }
    vi.mocked(api).mockResolvedValueOnce(detail).mockRejectedValueOnce(new ApiError(409, 'The resource changed.')).mockResolvedValueOnce(latest)
    const changed = vi.fn()
    render(<RoleDialog operation="settings" initial={detail} limits={limits} close={vi.fn()} changed={changed} />)
    fireEvent.change(screen.getByLabelText('Maximum duration (seconds)'), { target: { value: '7200' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    expect(await screen.findByText('3600 to 7200 seconds')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))

    await waitFor(() => expect(changed).toHaveBeenCalledWith(latest))
    expect(api).toHaveBeenLastCalledWith('/admin/ui/roles/role-id')
  })

  it('rejects create review when the selected owner becomes unavailable', async () => {
    identityQuery.refetch.mockResolvedValueOnce({ data: [{ ...identity, enabled: false }], isError: false })
    render(<RoleDialog operation="create" limits={limits} close={vi.fn()} changed={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Account ID'), { target: { value: '123456789012' } })
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Reader' } })
    fireEvent.change(screen.getByLabelText('Resource owner'), { target: { value: credentialId } })
    const principal = screen.getByLabelText('Statement 1 principals').querySelector('option') as HTMLOptionElement
    principal.selected = true
    fireEvent.change(screen.getByLabelText('Statement 1 principals'))

    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('owner is unavailable'))
    expect(api).not.toHaveBeenCalled()
  })

  it('pages policy options and persists a reviewed attachment', async () => {
    const firstPage = { items: [policy], next_after_id: 'next policy' }
    const attachQuery = { data: firstPage, isError: false, isFetching: false, refetch: vi.fn().mockResolvedValue({ data: firstPage, isError: false }) }
    vi.mocked(useQuery).mockImplementation(options => ((options as { queryKey?: unknown[] }).queryKey?.includes('role-options') ? attachQuery : identityQuery) as never)
    vi.mocked(api).mockResolvedValueOnce(detail).mockResolvedValueOnce({ detail: { ...detail, policies: [policy] }, retired_sessions: null })
    const close = vi.fn()
    const changed = vi.fn()
    render(<RoleDialog operation="attach" initial={detail} limits={limits} close={close} changed={changed} />)

    fireEvent.click(screen.getByRole('button', { name: 'Next policy page' }))
    expect(screen.getByText('Policy page 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Previous policy page' }))
    fireEvent.change(screen.getByLabelText('Policy'), { target: { value: policy.id } })
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    expect(await screen.findByText('ReadOnly')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))

    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/admin/ui/roles/role-id/policies', expect.objectContaining({ method: 'POST' })))
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ policies: [policy] }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('shows a retirement outcome and allows reviewing another batch', async () => {
    const disabled = { ...detail, role: { ...role, enabled: false }, retained_sessions: { count: 3, truncated: false, deletion_eligible: false } }
    const remaining = { ...disabled, retained_sessions: { count: 1, truncated: false, deletion_eligible: false } }
    vi.mocked(api).mockResolvedValueOnce(disabled).mockResolvedValueOnce({ detail: remaining, retired_sessions: 2 })
    const changed = vi.fn()
    render(<RoleDialog operation="retire" initial={disabled} limits={limits} close={vi.fn()} changed={changed} />)

    fireEvent.change(screen.getByLabelText('Maximum rows this batch'), { target: { value: '2' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Review change' }).closest('form')!)
    expect(await screen.findByRole('alertdialog', { name: 'Retire sessions' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retire this batch' }))

    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Retired 2 session rows. Remaining: 1'))
    expect(changed).toHaveBeenCalledWith(remaining)
    fireEvent.click(screen.getByRole('button', { name: 'Review next batch' }))
    expect(screen.getByRole('button', { name: 'Review change' })).toBeTruthy()
  })
})