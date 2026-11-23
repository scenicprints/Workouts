import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { seedIfEmpty, topUpLibrary } from './db'
import { ensureUnitDefault } from './hooks/useSettings'
import { markWebUpdate } from './lib/update'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    markWebUpdate(() => void updateSW(true))
  },
})

void seedIfEmpty()
  .then(() => topUpLibrary())
  .then(() => ensureUnitDefault())
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
