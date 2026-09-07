import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { addApiErrorInterceptor, type ApiError } from '../api/client'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { failed: boolean }

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failed', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return <main className="fatal-error" role="alert"><AlertTriangle size={24} /><h1>The control interface could not be displayed</h1><p>Reload the page to restore the current session.</p><button className="primary" onClick={() => window.location.reload()}>Reload</button></main>
    }
    return this.props.children
  }
}

function shouldPresentGlobally(error: ApiError) {
  return error.status === 0 || error.status >= 500
}

function ApiFailureNotice() {
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => addApiErrorInterceptor(nextError => {
    if (shouldPresentGlobally(nextError)) setError(nextError)
  }), [])

  if (!error) return null
  return <div className="global-error-notice" role="alert"><AlertTriangle size={18} /><span>{error.message}</span><button className="icon-button" aria-label="Dismiss service error" title="Dismiss" onClick={() => setError(null)}><X size={17} /></button></div>
}

export default function AppErrorLayer({ children }: ErrorBoundaryProps) {
  return <AppErrorBoundary><ApiFailureNotice />{children}</AppErrorBoundary>
}