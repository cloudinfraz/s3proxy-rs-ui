// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataTable, DialogFlow, ErrorBanner, Modal, Page, RefreshButton } from './control'
import { EphemeralCredentials } from './EphemeralCredentials'

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('shared control interactions', () => {
  it('keeps a single dialog active and returns focus to the row after a flow closes', async () => {
    function Flow() {
      const [view, setView] = useState<'detail' | 'edit' | null>(null)
      const fallback = useRef<HTMLButtonElement>(null)
      return <><button ref={fallback}>Create</button><button onClick={() => setView('detail')}>View record</button>{view && <DialogFlow fallbackFocus={fallback}>
        <Modal key={view} wide title={view} description="Record" onClose={() => setView(null)}><button onClick={() => setView(view === 'detail' ? 'edit' : 'detail')}>{view === 'detail' ? 'Edit' : 'Cancel'}</button></Modal>
      </DialogFlow>}</>
    }
    render(<StrictMode><Flow /></StrictMode>)
    const opener = screen.getByRole('button', { name: 'View record' })
    opener.focus()
    fireEvent.click(opener)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'detail' })))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'edit' })))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'detail' })))
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('restores fallback focus when deletion removes the originating row', async () => {
    function Flow() {
      const [open, setOpen] = useState(false)
      const [deleted, setDeleted] = useState(false)
      const fallback = useRef<HTMLButtonElement>(null)
      return <><button ref={fallback}>Create</button>{!deleted && <button onClick={() => setOpen(true)}>View record</button>}{open && <DialogFlow fallbackFocus={fallback}><Modal title="Record" description="Details" onClose={() => setOpen(false)}><button onClick={() => { setDeleted(true); setOpen(false) }}>Delete</button></Modal></DialogFlow>}</>
    }
    render(<Flow />)
    const opener = screen.getByRole('button', { name: 'View record' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create' })))
  })

  it('requires explicit discard when closing a dirty editor and blocks dismissal while pending', () => {
    const close = vi.fn()
    const view = render(<Modal wide dirty title="Edit" description="Draft" onClose={close}><input aria-label="Document" defaultValue="draft" /></Modal>)
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Discard unsaved changes?')
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Document')).toHaveProperty('value', 'draft')
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    view.rerender(<Modal wide dirty pending title="Edit" description="Draft" onClose={close}><input aria-label="Document" defaultValue="draft" /></Modal>)
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(close).not.toHaveBeenCalled()
    view.rerender(<Modal wide dirty title="Edit" description="Draft" onClose={close}><input aria-label="Document" defaultValue="draft" /></Modal>)
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('focuses page headings and emits retry and refresh callbacks', async () => {
    const retry = vi.fn()
    const refresh = vi.fn()
    render(<Page title="Operations"><ErrorBanner error={new Error('request failed')} retry={retry} /><RefreshButton pending={false} refresh={refresh} /></Page>)

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Operations' })))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not invoke a pending refresh and renders row actions as interactive controls', () => {
    const refresh = vi.fn()
    const select = vi.fn()
    render(<><RefreshButton pending refresh={refresh} /><DataTable rows={[{ id: 'row-1', name: 'Primary' }]} rowKey={row => row.id} columns={[
      { label: 'Name', value: row => row.name },
      { label: 'Actions', value: row => <button onClick={() => select(row.id)}>Select {row.name}</button> },
    ]} /></>)

    const refreshButton = screen.getByRole('button', { name: 'Refresh' })
    if (!(refreshButton instanceof HTMLButtonElement)) throw new Error('Expected refresh button')
    expect(refreshButton.disabled).toBe(true)
    fireEvent.click(refreshButton)
    fireEvent.click(screen.getByRole('button', { name: 'Select Primary' }))
    expect(refresh).not.toHaveBeenCalled()
    expect(select).toHaveBeenCalledWith('row-1')
  })

  it('reveals ephemeral credentials until the user acknowledges them', async () => {
    const dismiss = vi.fn()
    render(<EphemeralCredentials material={{ accessKey: 'temporary-access', secretKey: 'temporary-secret', endpoint: 'https://s3.example.test' }} dismiss={dismiss} />)

    expect(screen.getByText('temporary-access')).toBeTruthy()
    const acknowledge = screen.getByRole('button', { name: 'I have stored this securely' })
    await waitFor(() => expect(document.activeElement).toBe(acknowledge))
    fireEvent.click(acknowledge)
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('keeps focus inside pending credential dialogs then focuses acknowledgement', async () => {
    const dismiss = vi.fn()
    const view = render(<EphemeralCredentials material={{ accessKey: 'temporary-access', secretKey: 'temporary-secret' }} dismiss={dismiss} pending />)

    const dialog = screen.getByRole('dialog')
    const pending = screen.getByRole('button', { name: 'Refreshing identities...' })
    await waitFor(() => expect(document.activeElement).toBe(dialog))
    expect(pending).toHaveProperty('disabled', true)

    view.rerender(<EphemeralCredentials material={{ accessKey: 'temporary-access', secretKey: 'temporary-secret' }} dismiss={dismiss} />)
    const acknowledge = screen.getByRole('button', { name: 'I have stored this securely' })
    await waitFor(() => expect(document.activeElement).toBe(acknowledge))
  })
})