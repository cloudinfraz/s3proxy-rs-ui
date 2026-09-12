// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/client'
import type { Schema } from '../../api/control'
import { IdentitySelectorPagination, useIdentitySelectorPage } from './identity-selector'

vi.mock('../../api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  api: vi.fn(),
}))

const first: Schema['IdentityProjection'] = {
  credential_id: '11111111-1111-4111-8111-111111111111', s3_access_key: 'FIRST', azure_account: 'first',
  access_mode: 'direct', use_managed_identity: true, versioning_enabled: false, default_backend_id: null,
  enabled: true, virtual_bucket_count: 0, policy_attachment_count: 0,
}
const second: Schema['IdentityProjection'] = { ...first, credential_id: '22222222-2222-4222-8222-222222222222', s3_access_key: 'SECOND' }

function Selector() {
  const [selected, setSelected] = useState('')
  const [mode, setMode] = useState<'direct' | 'virtual'>('direct')
  const selector = useIdentitySelectorPage(mode, true, selected)
  return <>
    <select aria-label="Identity" value={selected} onChange={event => setSelected(event.target.value)}>
      <option value="">Select identity</option>
      {selector.items.map(identity => <option key={identity.credential_id} value={identity.credential_id}>{identity.s3_access_key}</option>)}
    </select>
    <IdentitySelectorPagination page={selector.page} pending={selector.query.isFetching || selector.selectedQuery.isFetching} canPrevious={selector.canPrevious} canNext={selector.canNext} previous={selector.previous} next={selector.next} />
    <button onClick={() => setMode(current => current === 'direct' ? 'virtual' : 'direct')}>Change mode</button>
  </>
}

function renderSelector() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><Selector /></QueryClientProvider>)
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('identity selector pagination', () => {
  it('keeps an off-page selection through the bounded detail operation', async () => {
    vi.mocked(api).mockImplementation(async path => {
      if (path === '/admin/ui/identity-pages?limit=100&access_mode=direct') return { items: [first], next_after_id: first.credential_id, default_page_size: 100, max_page_size: 200 }
      if (path === `/admin/ui/identity-pages?limit=100&after_id=${first.credential_id}&access_mode=direct`) return { items: [second], next_after_id: null, default_page_size: 100, max_page_size: 200 }
      if (path === `/admin/ui/identities/${first.credential_id}`) return first
      throw new Error(`Unexpected request: ${path}`)
    })
    renderSelector()
    const select = await screen.findByLabelText('Identity')
    await screen.findByRole('option', { name: 'FIRST' })
    fireEvent.change(select, { target: { value: first.credential_id } })
    fireEvent.click(screen.getByRole('button', { name: 'Next identity page' }))

    await screen.findByRole('option', { name: 'SECOND' })
    await screen.findByRole('option', { name: 'FIRST' })
    expect(select).toHaveProperty('value', first.credential_id)
    expect(api).toHaveBeenCalledWith(`/admin/ui/identities/${first.credential_id}`)
    expect(vi.mocked(api).mock.calls.some(([path]) => path === '/admin/ui/identities')).toBe(false)
  })

  it('resets the server cursor when the access-mode filter changes', async () => {
    vi.mocked(api).mockImplementation(async path => {
      if (path === '/admin/ui/identity-pages?limit=100&access_mode=direct') return { items: [first], next_after_id: first.credential_id, default_page_size: 100, max_page_size: 200 }
      if (path === `/admin/ui/identity-pages?limit=100&after_id=${first.credential_id}&access_mode=direct`) return { items: [second], next_after_id: null, default_page_size: 100, max_page_size: 200 }
      if (path === '/admin/ui/identity-pages?limit=100&access_mode=virtual') return { items: [], next_after_id: null, default_page_size: 100, max_page_size: 200 }
      throw new Error(`Unexpected request: ${path}`)
    })
    renderSelector()
    await screen.findByRole('option', { name: 'FIRST' })
    fireEvent.click(screen.getByRole('button', { name: 'Next identity page' }))
    await screen.findByText('Identity page 2')
    fireEvent.click(screen.getByRole('button', { name: 'Change mode' }))

    await waitFor(() => expect(screen.getByText('Identity page 1')).toBeTruthy())
    expect(api).toHaveBeenCalledWith('/admin/ui/identity-pages?limit=100&access_mode=virtual')
    expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes(`after_id=${first.credential_id}&access_mode=virtual`))).toBe(false)
  })
})