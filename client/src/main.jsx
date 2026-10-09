import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import * as Sentry from '@sentry/react'
import './i18n/index.js'
import './index.css'
import './App.css'
import App from './App.jsx'
import AuthProvider from './context/AuthContext.jsx'

function ErrorFallback({ resetError }) {
  const { t } = useTranslation()
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center" role="alert">
      <div>
        <p>{t('unexpectedUiError')}</p>
        <button type="button" className="mt-4 min-h-12 rounded-lg bg-brand px-5 font-bold text-white" onClick={resetError}>
          {t('refreshPage')}
        </button>
      </div>
    </main>
  )
}

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  })
}

const teluguFontStylesheet = document.getElementById('telugu-font-stylesheet')
if (teluguFontStylesheet) {
  window.addEventListener('load', () => {
    window.setTimeout(() => {
      teluguFontStylesheet.media = 'all'
    }, 0)
  }, { once: true })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Sentry.ErrorBoundary
          fallback={ErrorFallback}
        >
          <App />
        </Sentry.ErrorBoundary>
        <Toaster position="top-center" />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
