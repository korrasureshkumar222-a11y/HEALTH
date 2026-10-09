import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth.js'
import { useTranslation } from 'react-i18next'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isInitializing } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()

  if (isInitializing) {
    return (
      <main className="grid min-h-screen place-items-center p-6" aria-live="polite">
        <p className="text-base font-medium text-muted">{t('restoreSession')}</p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}
