import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EphemeralCredentialBody } from './EphemeralCredentials'

describe('EphemeralCredentials', () => {
  it('renders one-time material without persistence or copy controls', () => {
    const markup = renderToStaticMarkup(<EphemeralCredentialBody material={{ accessKey: 'synthetic-access', secretKey: 'synthetic-secret', endpoint: 'https://synthetic.invalid' }} />)
    expect(markup).toContain('synthetic-access')
    expect(markup).toContain('synthetic-secret')
    expect(markup).toContain('https://synthetic.invalid')
    expect(markup).not.toMatch(/download|localStorage|sessionStorage|clipboard/i)
  })

  it('omits an unavailable endpoint', () => {
    const markup = renderToStaticMarkup(<EphemeralCredentialBody material={{ accessKey: 'synthetic-access', secretKey: 'synthetic-secret' }} />)
    expect(markup).not.toContain('Endpoint')
  })
})