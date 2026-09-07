import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import cloudinfrazLogo from '../../assets/cloudinfraz-logo.png'
import { login, setCsrfToken } from '../../api/client'
import { controlKeys } from '../../api/query-keys'
import { ErrorBanner } from '../../components/control'
import { completionGuard } from '../operations/state'

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const client = useQueryClient()
  const navigate = useNavigate()
  const guard = useRef(completionGuard())
  useEffect(() => { const owner = guard.current; return () => owner.cancel() }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const request = guard.current.begin()
    const submittedApiKey = apiKey
    setApiKey('')
    setPending(true)
    setError(null)
    try {
      const response = await login(submittedApiKey)
      if (!guard.current.current(request)) return
      setCsrfToken(response.csrf_token)
      client.clear()
      client.setQueryData(controlKeys.session, { authenticated: true, expires_at: response.expires_at })
      navigate('/', { replace: true })
    } catch { if (guard.current.current(request)) setError(new Error('Sign in failed. Check the key and try again.')) }
    finally { if (guard.current.current(request)) setPending(false) }
  }
  return <main className="login-page">
    <div className="login-mark">
      <img src={cloudinfrazLogo} alt="CloudInfraz" width={64} height={64} />
      <strong>s3proxy control</strong>
    </div>
    <form className="login-panel" onSubmit={submit}>
      <h1>Sign in</h1>
      <label>Admin API key<input autoFocus type="password" autoComplete="current-password" value={apiKey} onChange={event => setApiKey(event.target.value)} required /></label>
      {error && <ErrorBanner error={error} />}
      <button className="primary" disabled={pending}>{pending ? 'Signing in...' : 'Continue'}<ChevronRight size={17} /></button>
    </form>
  </main>
}