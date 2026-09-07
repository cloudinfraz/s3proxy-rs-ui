// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import AppErrorLayer from './AppErrorLayer'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AppErrorLayer', () => {
  it('presents sanitized infrastructure failures and allows dismissal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private detail', { status: 503 })))
    render(<AppErrorLayer><div>Application</div></AppErrorLayer>)

    await api('/admin/health').catch(() => undefined)

    expect((await screen.findByRole('alert')).textContent).toContain('The control service is temporarily unavailable. Retry the request.')
    expect(screen.queryByText('private detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss service error' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('leaves contextual client errors to the requesting component', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 409 })))
    render(<AppErrorLayer><div>Application</div></AppErrorLayer>)

    await api('/admin/health').catch(() => undefined)

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('renders a recovery screen when a descendant fails to render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function BrokenView(): never { throw new Error('private render detail') }

    render(<AppErrorLayer><BrokenView /></AppErrorLayer>)

    expect(screen.getByRole('alert').textContent).toContain('The control interface could not be displayed')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.queryByText('private render detail')).toBeNull()
  })
})