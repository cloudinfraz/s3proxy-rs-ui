import { createContext, useContext } from 'react'

export type RevocationState =
  | { status: 'idle'; error: null }
  | { status: 'failed'; error: Error }
  | { status: 'retrying'; error: null }

export type RevocationContextValue = RevocationState & {
  markFailed: () => void
  retry: () => Promise<void>
}

export const RevocationContext = createContext<RevocationContextValue | null>(null)

export function useSessionRevocation() {
  const value = useContext(RevocationContext)
  if (!value) throw new Error('Session revocation context is unavailable.')
  return value
}