// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { invokeOperation } from '../../api/operations'
import IdentityPolicies from './IdentityPolicies'

vi.mock('../../api/client', () => ({ ApiError: class extends Error { status = 409 } }))
vi.mock('../../api/operations', () => ({ invokeOperation: vi.fn() }))
vi.mock('@tanstack/react-query', async importOriginal => ({ ...(await importOriginal<typeof import('@tanstack/react-query')>()), useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('../../api/query-keys', async importOriginal => ({ ...(await importOriginal<typeof import('../../api/query-keys')>()), invalidateControl: vi.fn() }))
vi.mock('../../components/control', () => ({
  RefreshButton: ({ refresh }: { refresh: () => void }) => <button onClick={refresh}>Refresh</button>,
  ErrorBanner: ({ error }: { error: Error }) => <div role="alert">{error.message}</div>,
  Modal: ({ title, children }: { title: string; children: ReactNode }) => <section role="dialog" aria-label={title}>{children}</section>,
  DestructiveDialog: ({ title, confirmLabel, onConfirm }: { title: string; confirmLabel: string; onConfirm: () => void }) => <section role="alertdialog" aria-label={title}><button onClick={onConfirm}>{confirmLabel}</button></section>,
  DataTable: ({ rows, loading, columns }: { rows: unknown[]; loading: boolean; columns: Array<{ label: string; value: (row: never) => ReactNode }> }) => loading ? <p role="status">Loading...</p> : <div>{rows.map((row, index) => <div key={index}>{columns.map(column => <span key={column.label}>{column.value(row as never)}</span>)}</div>)}</div>,
}))

const credentialId = '11111111-1111-4111-8111-111111111111'
const identityResponse = { items: [{ credential_id: credentialId, s3_access_key: 'IDENTITY_ONE', enabled: true }], next_after_id: null }
const policy = { id: 'policy-id', name: 'ReadOnly', revision: 3, description: null, built_in: false, deletable: true, credential_attachment_count: 0, role_attachment_count: 0, updated_at: '2026-01-01T00:00:00Z' }
const secondPolicy = { ...policy, id: 'second-policy-id', name: 'WriteOnly', revision: 4 }
const relationship = { credential_id: credentialId, credential_revision: 2, impact_token: 'impact', items: [], next_after_id: null, max_page_size: 100, default_page_size: 100 }
const query = (data?: unknown, overrides: Record<string, unknown> = {}) => ({ data, isError: false, isPending: false, isFetching: false, error: null, refetch: vi.fn().mockResolvedValue({ data, isError: false }), ...overrides })
function deferred<Value>() {
  let resolve: (value: Value) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}
function mockQueries(identityQuery: ReturnType<typeof query>, policyQuery = query({ items: [policy], next_after_id: null }), relationshipQuery = query(relationship)) {
  vi.mocked(useQuery).mockImplementation(options => {
    const key = (options as { queryKey?: readonly unknown[] }).queryKey ?? []
    if (key.includes('identities')) return identityQuery as never
    if (key.includes('managed')) return policyQuery as never
    return relationshipQuery as never
  })
}
function renderView() { return render(<MemoryRouter><IdentityPolicies /></MemoryRouter>) }
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('IdentityPolicies', () => {
  it('reports identity loading errors and renders available metadata', async () => {
    mockQueries(query(undefined, { isError: true }))
    renderView()
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Identity metadata unavailable'))
    expect(screen.getByText('Manage role attachments')).toBeTruthy()
  })

  it('reviews and persists an attachment for the selected identity', async () => {
    mockQueries(query(identityResponse))
    vi.mocked(invokeOperation).mockResolvedValueOnce(relationship as never).mockResolvedValueOnce({ changed: true, detail: relationship } as never)
    renderView()
    fireEvent.change(await screen.findByLabelText('Identity'), { target: { value: credentialId } })
    fireEvent.change(await screen.findByLabelText('Managed policy'), { target: { value: 'policy-id' } })
    fireEvent.click(screen.getByRole('button', { name: /Review attachment/ }))
    expect(await screen.findByRole('dialog', { name: 'Confirm: attach policy' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Attach policy' }))
    await waitFor(() => expect(invokeOperation).toHaveBeenCalledWith('attachReviewedAdminIdentityPolicy', expect.objectContaining({ parameters: { path: { credential_id: credentialId } } })))
  })

  it('does not reopen a delayed review after an identity A to B to A change', async () => {
    const secondCredentialId = '22222222-2222-4222-8222-222222222222'
    mockQueries(query({ ...identityResponse, items: [...identityResponse.items, { credential_id: secondCredentialId, s3_access_key: 'IDENTITY_TWO', enabled: true }] }))
    const request = deferred<typeof relationship>()
    vi.mocked(invokeOperation).mockImplementationOnce(() => request.promise as never)
    renderView()
    const selector = await screen.findByLabelText('Identity')
    fireEvent.change(selector, { target: { value: credentialId } })
    fireEvent.change(await screen.findByLabelText('Managed policy'), { target: { value: policy.id } })
    fireEvent.click(screen.getByRole('button', { name: /Review attachment/ }))

    fireEvent.change(selector, { target: { value: secondCredentialId } })
    fireEvent.change(selector, { target: { value: credentialId } })
    request.resolve(relationship)

    await waitFor(() => expect(invokeOperation).toHaveBeenCalledOnce())
    expect(selector).toHaveProperty('value', credentialId)
    expect(screen.queryByRole('dialog', { name: 'Confirm: attach policy' })).toBeNull()
  })

  it('does not reopen a delayed review after selecting another policy', async () => {
    mockQueries(query(identityResponse), query({ items: [policy, secondPolicy], next_after_id: null }))
    const request = deferred<typeof relationship>()
    vi.mocked(invokeOperation).mockImplementationOnce(() => request.promise as never)
    renderView()
    fireEvent.change(await screen.findByLabelText('Identity'), { target: { value: credentialId } })
    const selector = await screen.findByLabelText('Managed policy')
    fireEvent.change(selector, { target: { value: policy.id } })
    fireEvent.click(screen.getByRole('button', { name: /Review attachment/ }))

    fireEvent.change(selector, { target: { value: secondPolicy.id } })
    request.resolve(relationship)

    await waitFor(() => expect(invokeOperation).toHaveBeenCalledOnce())
    expect(selector).toHaveProperty('value', secondPolicy.id)
    expect(screen.queryByRole('dialog', { name: 'Confirm: attach policy' })).toBeNull()
  })

  it('does not let an obsolete rejection or finalizer affect a newer review', async () => {
    const secondCredentialId = '22222222-2222-4222-8222-222222222222'
    mockQueries(query({ ...identityResponse, items: [...identityResponse.items, { credential_id: secondCredentialId, s3_access_key: 'IDENTITY_TWO', enabled: true }] }))
    const obsoleteRequest = deferred<typeof relationship>()
    const currentRequest = deferred<typeof relationship>()
    vi.mocked(invokeOperation).mockImplementationOnce(() => obsoleteRequest.promise as never).mockImplementationOnce(() => currentRequest.promise as never)
    renderView()
    const identitySelector = await screen.findByLabelText('Identity')
    fireEvent.change(identitySelector, { target: { value: credentialId } })
    fireEvent.change(await screen.findByLabelText('Managed policy'), { target: { value: policy.id } })
    fireEvent.click(screen.getByRole('button', { name: /Review attachment/ }))

    fireEvent.change(identitySelector, { target: { value: secondCredentialId } })
    fireEvent.change(await screen.findByLabelText('Managed policy'), { target: { value: policy.id } })
    const reviewButton = screen.getByRole('button', { name: /Review attachment/ })
    fireEvent.click(reviewButton)
    obsoleteRequest.reject(new Error('obsolete failure'))

    await waitFor(() => expect(invokeOperation).toHaveBeenCalledTimes(2))
    expect(reviewButton).toHaveProperty('disabled', true)
    expect(screen.queryByText('obsolete failure')).toBeNull()

    currentRequest.resolve({ ...relationship, credential_id: secondCredentialId })
    expect(await screen.findByRole('dialog', { name: 'Confirm: attach policy' })).toHaveProperty('textContent', expect.stringContaining(secondCredentialId))
  })

  it('excludes attached policies and completes a reviewed detach', async () => {
    const attachment = { policy_id: policy.id, policy_name: policy.name, policy_revision: policy.revision, attached_at: '2026-01-01T00:00:00Z' }
    const attachedRelationship = { ...relationship, items: [attachment] }
    mockQueries(query(identityResponse), query({ items: [policy], next_after_id: null }), query(attachedRelationship))
    vi.mocked(invokeOperation).mockResolvedValueOnce(attachedRelationship as never).mockResolvedValueOnce({ changed: true, detail: relationship } as never)
    renderView()
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: credentialId } })

    expect(screen.queryByRole('option', { name: 'ReadOnly' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Detach ReadOnly' }))
    const confirmation = await screen.findByRole('alertdialog', { name: 'Detach identity policy' })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Detach ReadOnly' }))
    await waitFor(() => expect(invokeOperation).toHaveBeenCalledWith('detachReviewedAdminIdentityPolicy', expect.objectContaining({ parameters: { path: { credential_id: credentialId } } })))
  })
})