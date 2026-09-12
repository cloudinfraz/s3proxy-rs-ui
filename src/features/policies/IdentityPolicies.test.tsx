// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import IdentityPolicies from './IdentityPolicies'

vi.mock('../../api/client', () => ({ api: vi.fn(), ApiError: class extends Error { status = 409 } }))
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
const relationship = { credential_id: credentialId, credential_revision: 2, impact_token: 'impact', items: [], next_after_id: null, max_page_size: 100, default_page_size: 100 }
const query = (data?: unknown, overrides: Record<string, unknown> = {}) => ({ data, isError: false, isPending: false, isFetching: false, error: null, refetch: vi.fn().mockResolvedValue({ data, isError: false }), ...overrides })
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
    vi.mocked(api).mockResolvedValueOnce(relationship).mockResolvedValueOnce({ changed: true, detail: relationship })
    renderView()
    fireEvent.change(await screen.findByLabelText('Identity'), { target: { value: credentialId } })
    fireEvent.change(await screen.findByLabelText('Managed policy'), { target: { value: 'policy-id' } })
    fireEvent.click(screen.getByRole('button', { name: /Review attachment/ }))
    expect(await screen.findByRole('dialog', { name: 'Confirm: attach policy' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Attach policy' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith(`/admin/ui/identities/${credentialId}/policies`, expect.objectContaining({ method: 'POST' })))
  })

  it('does not reopen a delayed review after selecting another identity', async () => {
    const secondCredentialId = '22222222-2222-4222-8222-222222222222'
    mockQueries(query({ ...identityResponse, items: [...identityResponse.items, { credential_id: secondCredentialId, s3_access_key: 'IDENTITY_TWO', enabled: true }] }))
    let release: (value: typeof relationship) => void = () => {}
    vi.mocked(api).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    renderView()
    const selector = await screen.findByLabelText('Identity')
    fireEvent.change(selector, { target: { value: credentialId } })
    fireEvent.change(await screen.findByLabelText('Managed policy'), { target: { value: policy.id } })
    fireEvent.click(screen.getByRole('button', { name: /Review attachment/ }))

    fireEvent.change(selector, { target: { value: secondCredentialId } })
    release(relationship)

    await waitFor(() => expect(api).toHaveBeenCalledOnce())
    expect(selector).toHaveProperty('value', secondCredentialId)
    expect(screen.queryByRole('dialog', { name: 'Confirm: attach policy' })).toBeNull()
  })

  it('excludes attached policies and completes a reviewed detach', async () => {
    const attachment = { policy_id: policy.id, policy_name: policy.name, policy_revision: policy.revision, attached_at: '2026-01-01T00:00:00Z' }
    const attachedRelationship = { ...relationship, items: [attachment] }
    mockQueries(query(identityResponse), query({ items: [policy], next_after_id: null }), query(attachedRelationship))
    vi.mocked(api).mockResolvedValueOnce(attachedRelationship).mockResolvedValueOnce({ changed: true, detail: relationship })
    renderView()
    fireEvent.change(screen.getByLabelText('Identity'), { target: { value: credentialId } })

    expect(screen.queryByRole('option', { name: 'ReadOnly' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Detach ReadOnly' }))
    const confirmation = await screen.findByRole('alertdialog', { name: 'Detach identity policy' })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Detach ReadOnly' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith(`/admin/ui/identities/${credentialId}/policies`, expect.objectContaining({ method: 'DELETE' })))
  })
})