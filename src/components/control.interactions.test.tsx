// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataTable, ErrorBanner, Page, RefreshButton } from './control'
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
})