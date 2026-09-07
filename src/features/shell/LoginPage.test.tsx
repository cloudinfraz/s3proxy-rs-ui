import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import LoginPage from './LoginPage'

it('renders the local CloudInfraz logo with a labelled, unchanged sign-in form', () => {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><LoginPage /></MemoryRouter>
    </QueryClientProvider>,
  )

  expect(html).toContain('alt="CloudInfraz"')
  expect(html).toContain('width="64" height="64"')
  expect(html).toMatch(/src="[^"]*cloudinfraz-logo\.png"/)
  expect(html).not.toContain('avatars.githubusercontent.com')
  expect(html).toContain('<h1>Sign in</h1>')
  expect(html).toContain('type="password"')
  expect(html).toContain('autoComplete="current-password"')
  expect(html).toContain('Admin API key')
  expect(html).toContain('Continue')
})