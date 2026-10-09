import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import HomePage from './HomePage.jsx'
import { createTestI18n, renderWithProviders } from '../test/renderWithProviders.jsx'

const translations = {
  appName: 'Care Connect',
  restoreSession: 'Restoring session',
  homeMainNavigation: 'Main navigation',
  homeHeroTitle: 'Your health journey, supported every step',
  homeCreatePatientAccount: 'Create a patient account',
  signIn: 'Sign in',
  createAccount: 'Create account',
  language: 'Language',
  homePrivacyNote: 'Your information is protected.',
  homeCareCardLabel: 'Chronic Care',
  homeCareCardTitle: 'Care, in one place',
  homeCardReadings: 'Health readings',
  homeCardReadingsDetail: 'Record and review measurements over time.',
  homeCardCareTeam: 'Your care team',
  homeCardCareTeamDetail: 'Stay connected with your care team.',
  homeClinicalDisclaimer: 'This app does not replace medical advice.',
  homeIllustrationCaption: 'Illustrative preview',
  homeFeaturesEyebrow: 'Designed for everyday care',
  homeFeaturesTitle: 'Helpful tools for patients and care teams',
  homeFeaturesDescription: 'Simple ways to share updates.',
  homeFeatureReadingsTitle: 'Track readings',
  homeFeatureReadingsDescription: 'Record health measurements.',
  homeFeatureCareTitle: 'Keep care in view',
  homeFeatureCareDescription: 'Review alerts and appointments.',
  homeFeatureOfflineTitle: 'Works with interruptions',
  homeFeatureOfflineDescription: 'Sync updates when connected.',
  homeFeatureLanguageTitle: 'English and Telugu',
  homeFeatureLanguageDescription: 'Switch languages.',
  homeCtaTitle: 'A clearer view of your ongoing care',
  homeCtaDescription: 'Create an account or sign in.',
  homeGetStarted: 'Get started',
  homeFooterDisclaimer: 'For monitoring support only.',
}

describe('HomePage', () => {
  it('shows the public landing page for guests', async () => {
    const i18n = await createTestI18n({ en: translations })
    renderWithProviders(<HomePage />, { i18n })

    expect(screen.getByRole('heading', { name: translations.homeHeroTitle })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: translations.homeCreatePatientAccount })).toHaveAttribute('href', '/register')
    expect(screen.getAllByRole('link', { name: translations.signIn })).toHaveLength(3)
  })

  it('redirects signed-in users to their role dashboard', async () => {
    const i18n = await createTestI18n({ en: translations })
    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/patient" element={<p>Patient dashboard</p>} />
      </Routes>,
      { i18n, authValue: { user: { role: 'patient' }, isAuthenticated: true } },
    )

    expect(await screen.findByText('Patient dashboard')).toBeInTheDocument()
  })
})
