import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CavendishSimulator from './CavendishSimulator.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CavendishSimulator />
  </StrictMode>,
)
