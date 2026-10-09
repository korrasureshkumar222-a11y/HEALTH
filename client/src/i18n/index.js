import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const languageKey = 'language'

function getSavedLanguage() {
  try {
    const savedLanguage = localStorage.getItem(languageKey)
    return savedLanguage === 'te' ? 'te' : 'en'
  } catch (error) {
    console.warn('Could not read the saved language preference.', error)
    return 'en'
  }
}

async function loadTranslation(language) {
  const response = await fetch(`/locales/${language}.json`)
  if (!response.ok) {
    throw new Error(`Could not load the ${language} translation file (${response.status}).`)
  }
  return response.json()
}

const [english, telugu] = await Promise.all([
  loadTranslation('en'),
  loadTranslation('te'),
])

await i18n.use(initReactI18next).init({
  resources: {
    en: { translation: english },
    te: { translation: telugu },
  },
  lng: getSavedLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
    format(value, format, language) {
      if (typeof value !== 'number') return value
      const locale = language === 'te' ? 'te-IN' : 'en-IN'
      return new Intl.NumberFormat(locale, format ? { maximumFractionDigits: 2 } : {}).format(value)
    },
  },
  returnNull: false,
})

i18n.on('languageChanged', (language) => {
  try {
    localStorage.setItem(languageKey, language)
  } catch (error) {
    console.warn('Could not persist selected language.', error)
  }
  document.documentElement.lang = language
})

document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language

export default i18n
