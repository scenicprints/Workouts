import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { seedIfEmpty, topUpLibrary } from './db'

registerSW({ immediate: true })

void seedIfEmpty()
  .then(() => topUpLibrary())
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
