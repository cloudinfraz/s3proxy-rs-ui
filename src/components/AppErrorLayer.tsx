import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

type ErrorBoundaryProps = { children: ReactNode }
type ErrorBoundaryState = { failed: boolean }

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch() {
    console.error('Application render failed')
  }

  render() {
    if (this.state.failed) {
      return <main className="fatal-error" role="alert"><AlertTriangle size={24} /><h1>The control interface could not be displayed</h1><p>Reload the page to restore the current session.</p><button className="primary" onClick={() => window.location.reload()}>Reload</button></main>
    }
    return this.props.children
  }
}

export default function AppErrorLayer({ children }: ErrorBoundaryProps) {
  return <AppErrorBoundary>{children}</AppErrorBoundary>
}