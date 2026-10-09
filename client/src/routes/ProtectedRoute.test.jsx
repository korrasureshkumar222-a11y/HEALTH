import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Route, Routes, useLocation } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute.jsx'
import { createTestI18n, renderWithProviders } from '../test/renderWithProviders.jsx'

function LoginLocation() {
  const location = useLocation()
  return <p>login-from:{location.state?.from?.pathname}</p>
}

describe('ProtectedRoute', () => {
  it('redirects guests to login and preserves the requested location', async () => {
    const i18n = await createTestI18n({ en: { restoreSession: 'Restoring session' } })
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginLocation />} />
        <Route path="/private" element={<ProtectedRoute><p>private content</p></ProtectedRoute>} />
      </Routes>,
      { i18n, initialEntries: ['/private?tab=history'] },
    )

    expect(await screen.findByText('login-from:/private')).toBeInTheDocument()
    expect(screen.queryByText('private content')).not.toBeInTheDocument()
  })

  it('renders protected content for an authenticated user', async () => {
    const i18n = await createTestI18n({ en: { restoreSession: 'Restoring session' } })
    renderWithProviders(
      <ProtectedRoute><p>private content</p></ProtectedRoute>,
      { i18n, authValue: { isAuthenticated: true } },
    )

    expect(screen.getByText('private content')).toBeInTheDocument()
  })
})
