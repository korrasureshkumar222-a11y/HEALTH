import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import AuthContext from '../context/authContext.js'

export async function createTestI18n(translations = {}) {
  const instance = i18next.createInstance()
  await instance.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: translations.en ?? {} },
      te: { translation: translations.te ?? {} },
    },
    interpolation: { escapeValue: false },
  })
  return instance
}

export function renderWithProviders(
  ui,
  { authValue = {}, i18n, initialEntries = ['/'], ...options } = {},
) {
  if (!i18n) throw new Error('renderWithProviders requires a test i18n instance.')
  return render(
    <I18nextProvider i18n={i18n}>
      <AuthContext.Provider value={{
        user: null,
        isAuthenticated: false,
        isInitializing: false,
        updateLanguagePreference: async () => {},
        ...authValue,
      }}>
        <MemoryRouter
          initialEntries={initialEntries}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          {ui}
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nextProvider>,
    options,
  )
}
