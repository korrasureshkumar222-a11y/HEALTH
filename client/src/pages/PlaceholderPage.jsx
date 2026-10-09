import { useTranslation } from 'react-i18next'

export default function PlaceholderPage({ titleKey, descriptionKey }) {
  const { t } = useTranslation()
  return (
    <section className="mx-auto max-w-3xl">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">
        {t('appSubtitle')}
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-ink">{t(titleKey)}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted">{t(descriptionKey)}</p>
      <div className="mt-8 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-lg font-bold text-ink">{t('placeholderHeading')}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          {t('placeholderScaffold')}
        </p>
      </div>
    </section>
  )
}
