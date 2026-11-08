import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { ensureDefaultRoutines } from './db'
import { startCloudSync } from './sync'
import './index.css'
import App from './App.tsx'

registerSW({ immediate: true })
void ensureDefaultRoutines()
  .then(() => {
    const stopCloudSync = startCloudSync()
    import.meta.hot?.dispose(stopCloudSync)
  })
  .catch((error: unknown) => console.error('Unable to initialize workout data', error))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
