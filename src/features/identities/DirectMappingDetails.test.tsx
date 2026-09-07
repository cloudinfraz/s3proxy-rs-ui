// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Schema } from '../../api/control'
import DirectMappingDetails from './DirectMappingDetails'

vi.mock('../../components/control', () => ({
  Modal: ({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) => <section role="dialog" aria-label={title}>{children}<button onClick={onClose}>Dismiss</button></section>,
}))

const identity: Schema['IdentityProjection'] = {
  credential_id: '11111111-1111-4111-8111-111111111111', s3_access_key: 'AKIA_TEST', azure_account: 'legacyaccount',
  access_mode: 'direct', use_managed_identity: true, versioning_enabled: true, default_backend_id: null,
  enabled: true, virtual_bucket_count: 0, policy_attachment_count: 0,
}
const capabilities: Schema['ControlCapabilities'] = {
  plane: 'control', authz_mode: 'off', sts_enabled: false, iam_assume_role_enabled: false,
  assume_role_ready: false, iam_account_configured: false, backend_routing_enabled: false,
  usable_registry_auth_modes: [], legacy_routing_available: true,
  public_s3_endpoint: 'https://s3.example.test', public_sts_endpoint: null,
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('DirectMappingDetails', () => {
  it('renders effective routing metadata and safe request examples', () => {
    render(<DirectMappingDetails identity={identity} capabilities={capabilities} onClose={vi.fn()} />)
    expect(screen.getByText('legacyaccount')).toBeTruthy()
    expect(screen.getByText('Legacy account')).toBeTruthy()
    expect(screen.getByText('https://s3.example.test')).toBeTruthy()
    fireEvent.click(screen.getByText('List request examples'))
    expect(screen.getByText(/s3api list-buckets/)).toBeTruthy()
  })

  it('announces unavailable metadata and closes from either control', () => {
    const close = vi.fn()
    render(<DirectMappingDetails onClose={close} />)
    expect(screen.getByRole('status').textContent).toContain('Direct identity metadata unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(close).toHaveBeenCalledTimes(2)
  })
})