// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppErrorLayer from './AppErrorLayer'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AppErrorLayer', () => {
  it('renders descendants without adding a competing global alert', () => {
    render(<AppErrorLayer><div>Application</div></AppErrorLayer>)

    expect(screen.getByText('Application')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
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