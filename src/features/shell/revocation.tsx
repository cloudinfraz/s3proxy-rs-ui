import { useRef, useState, type ReactNode } from 'react'
import { ApiError, setCsrfToken } from '../../api/client'
import { getSession, logout } from '../../api/operations'
import { RevocationContext, type RevocationState } from './revocation-context'

const pendingRevocationKey = 's3proxy.pending-session-revocation'
const revocationMessage = 'The server could not confirm session revocation. Protected access remains blocked.'

function hasPendingRevocation() {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(pendingRevocationKey) !== null
  } catch {
    return true
  }
}

function writePendingRevocation(pending: boolean) {
  if (typeof window === 'undefined') return
  try {
    if (pending) window.sessionStorage.setItem(pendingRevocationKey, 'pending')
    else window.sessionStorage.removeItem(pendingRevocationKey)
  } catch {
    // In-memory state still protects the current document when storage is unavailable.
  }
}

function initialState(): RevocationState {
  return hasPendingRevocation()
    ? { status: 'failed', error: new Error(revocationMessage) }
    : { status: 'idle', error: null }
}

export function SessionRevocationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RevocationState>(initialState)
  const retrying = useRef(false)

  function markFailed() {
    writePendingRevocation(true)
    setState({ status: 'failed', error: new Error(revocationMessage) })
  }

  function resolve() {
    writePendingRevocation(false)
    setState({ status: 'idle', error: null })
  }

  async function retry() {
    if (retrying.current) return
    retrying.current = true
    setState({ status: 'retrying', error: null })
    setCsrfToken(null)
    try {
      let session
      try {
        session = await getSession()
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          resolve()
          return
        }
        throw error
      }
      if (!session.authenticated) {
        resolve()
        return
      }
      setCsrfToken(session.csrf_token)
      await logout()
      resolve()
    } catch {
      markFailed()
    } finally {
      setCsrfToken(null)
      retrying.current = false
    }
  }

  return <RevocationContext.Provider value={{ ...state, markFailed, retry }}>{children}</RevocationContext.Provider>
}