// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Schema } from '../../api/control'
import { BackendDetails } from './BackendDetails'

const backend: Schema['StorageBackendProjection'] = {
  id: 'backend-id',
  name: 'archive',
  azure_account: 'archiveaccount',
  auth_mode: 'managed_identity',
  managed_identity_client_id: null,
  user_delegation_sas_enabled: true,
  has_secret_ref: false,
  region_label: null,
  enabled: true,
  credential_default_count: 2,
  virtual_bucket_count: 3,
  impact_token: 'impact-token',
}

afterEach(cleanup)

describe('BackendDetails', () => {
  it('renders backend metadata and managed identity fallbacks', () => {
    render(<BackendDetails backend={backend} />)

    expect(screen.getByText('archiveaccount')).toBeTruthy()
    expect(screen.getByText('Managed Identity')).toBeTruthy()
    expect(screen.getByText('System / workload identity')).toBeTruthy()
    expect(screen.getByText('Not set')).toBeTruthy()
    expect(within(screen.getByText('Mapping references').parentElement!).getByText('3')).toBeTruthy()
  })

  it('describes secret-backed disabled backends without exposing a secret', () => {
    render(<BackendDetails backend={{ ...backend, auth_mode: 'account_key', has_secret_ref: true, enabled: false }} />)

    expect(screen.getByText('Account key reference')).toBeTruthy()
    expect(screen.getByText('Not applicable')).toBeTruthy()
    expect(within(screen.getByText('Secret reference present').parentElement!).getByText('Yes')).toBeTruthy()
    expect(within(screen.getByText('Status').parentElement!).getByText('Disabled')).toBeTruthy()
  })
})