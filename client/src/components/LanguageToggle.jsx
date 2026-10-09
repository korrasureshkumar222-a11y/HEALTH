import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { useAuth } from '../context/useAuth.js'

export default function LanguageToggle() {
  const { i18n, t } = useTranslation()
  const { isAuthenticated, updateLanguagePreference } = useAuth()

  async function changeLanguage(event) {
    const language = event.target.value
    await i18n.changeLanguage(language)
    if (!isAuthenticated) return
    try {
      await updateLanguagePreference(language)
    } catch (error) {
      toast.error(t('languageSaveFailed'))
      console.error('Could not save language preference to the user profile.', {
        message: error.message,
      })
    }
  }

  return (
    <label className="inline-flex min-h-touch items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink">
      <Languages size={18} aria-hidden="true" />
      <span className="sr-only">{t('language')}</span>
      <select
        aria-label={t('language')}
        className="min-h-touch bg-transparent outline-none"
        value={i18n.resolvedLanguage === 'te' ? 'te' : 'en'}
        onChange={changeLanguage}
      >
        <option value="en">English</option>
        <option value="te">తెలుగు</option>
      </select>
    </label>
  )
}
