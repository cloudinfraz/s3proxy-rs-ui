import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ControlApp from './ControlApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ControlApp />
  </StrictMode>,
)
