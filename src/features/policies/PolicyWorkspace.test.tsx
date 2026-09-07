// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PolicyWorkspace from './PolicyWorkspace'

vi.mock('./ManagedPolicies', () => ({ default: () => <p>managed content</p> }))
vi.mock('./IdentityPolicies', () => ({ default: () => <p>identity content</p> }))
vi.mock('./BucketPolicies', () => ({ default: () => <p>bucket content</p> }))
vi.mock('./PolicyDiagnostics', () => ({ default: () => <p>diagnostics content</p> }))
vi.mock('../../components/control', () => ({ Page: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main> }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('PolicyWorkspace', () => {
  it('starts on managed policies and switches among stateful views', () => {
    render(<PolicyWorkspace />)
    expect(screen.getByText('managed content').closest('[data-state]')?.getAttribute('data-state')).toBe('active')
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Identity attachments/ }))
    fireEvent.click(screen.getByRole('tab', { name: /Identity attachments/ }))
    expect(screen.getByText('identity content').closest('[data-state]')?.getAttribute('data-state')).toBe('active')
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Diagnostics/ }))
    fireEvent.click(screen.getByRole('tab', { name: /Diagnostics/ }))
    expect(screen.getByText('diagnostics content').closest('[data-state]')?.getAttribute('data-state')).toBe('active')
  })
})