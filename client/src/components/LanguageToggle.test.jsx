import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LanguageToggle from './LanguageToggle.jsx'
import { createTestI18n, renderWithProviders } from '../test/renderWithProviders.jsx'

describe('LanguageToggle', () => {
  it('changes the active language and persists it to the signed-in profile', async () => {
    const updateLanguagePreference = vi.fn().mockResolvedValue(undefined)
    const i18n = await createTestI18n({
      en: { language: 'Language', languageSaveFailed: 'Language could not be saved.' },
      te: { language: 'భాష' },
    })

    renderWithProviders(<LanguageToggle />, {
      i18n,
      authValue: { isAuthenticated: true, updateLanguagePreference },
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'te' },
    })

    await waitFor(() => expect(i18n.resolvedLanguage).toBe('te'))
    expect(updateLanguagePreference).toHaveBeenCalledWith('te')
  })

  it('does not update the profile when a guest changes language', async () => {
    const updateLanguagePreference = vi.fn()
    const i18n = await createTestI18n({
      en: { language: 'Language' },
      te: { language: 'భాష' },
    })
    renderWithProviders(<LanguageToggle />, {
      i18n,
      authValue: { updateLanguagePreference },
    })

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'te' },
    })

    await waitFor(() => expect(i18n.resolvedLanguage).toBe('te'))
    expect(updateLanguagePreference).not.toHaveBeenCalled()
  })
})
