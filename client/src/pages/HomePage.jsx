import { Navigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  ArrowRight,
  BellRing,
  HeartPulse,
  Languages,
  ShieldCheck,
  Smartphone,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../context/useAuth.js'
import LanguageToggle from '../components/LanguageToggle.jsx'

const roleHomes = {
  patient: '/patient',
  doctor: '/doctor',
  chw: '/chw',
  admin: '/admin',
}

const featureCards = [
  { icon: Activity, title: 'homeFeatureReadingsTitle', description: 'homeFeatureReadingsDescription' },
  { icon: BellRing, title: 'homeFeatureCareTitle', description: 'homeFeatureCareDescription' },
  { icon: Smartphone, title: 'homeFeatureOfflineTitle', description: 'homeFeatureOfflineDescription' },
  { icon: Languages, title: 'homeFeatureLanguageTitle', description: 'homeFeatureLanguageDescription' },
]

export default function HomePage() {
  const { t } = useTranslation()
  const { user, isInitializing } = useAuth()

  if (isInitializing) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas p-6" aria-live="polite">
        <p className="font-semibold text-muted">{t('restoreSession')}</p>
      </main>
    )
  }

  if (user) return <Navigate to={roleHomes[user.role] ?? '/login'} replace />

  return (
    <main className="min-h-screen overflow-hidden bg-canvas text-ink">
      <header className="border-b border-border bg-white/90">
        <nav className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8" aria-label={t('homeMainNavigation')}>
          <Link to="/" className="flex min-h-12 items-center gap-3 rounded-lg font-extrabold text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-50">
              <HeartPulse size={24} aria-hidden="true" />
            </span>
            <span>{t('appName')}</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageToggle />
            <Link to="/login" className="hidden min-h-11 items-center rounded-xl px-3 font-bold text-ink hover:bg-slate-100 sm:inline-flex">
              {t('signIn')}
            </Link>
            <Link to="/register" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-bold text-white hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              <span className="hidden sm:inline">{t('homeGetStarted')}</span>
              <span className="sm:hidden">{t('createAccount')}</span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </nav>
      </header>

      <section className="home-hero relative isolate overflow-hidden">
        <div className="pointer-events-none absolute -right-32 -top-36 -z-10 size-[30rem] rounded-full bg-blue-100/70 blur-3xl" aria-hidden="true" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:px-8 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-brand shadow-sm">
              <span className="size-2 rounded-full bg-green-700" aria-hidden="true" />
              {t('homeEyebrow')}
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight text-ink sm:text-5xl lg:text-6xl">
              {t('homeHeroTitle')}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted sm:text-xl">
              {t('homeHeroDescription')}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-brand px-6 text-base font-extrabold text-white shadow-sm hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                {t('homeCreatePatientAccount')}
                <ArrowRight size={19} aria-hidden="true" />
              </Link>
              <Link to="/login" className="inline-flex min-h-14 items-center justify-center rounded-xl border border-border bg-white px-6 text-base font-extrabold text-ink hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                {t('signIn')}
              </Link>
            </div>
            <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-muted">
              <ShieldCheck className="mt-0.5 shrink-0 text-success" size={18} aria-hidden="true" />
              {t('homePrivacyNote')}
            </p>
          </div>

          <div className="mx-auto w-full max-w-lg">
            <div className="rounded-[2rem] border border-blue-100 bg-white p-4 shadow-xl shadow-blue-950/10 sm:p-6">
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-950 p-5 text-white">
                <div>
                  <p className="text-sm font-semibold text-blue-100">{t('homeCareCardLabel')}</p>
                  <p className="mt-1 text-xl font-extrabold">{t('homeCareCardTitle')}</p>
                </div>
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-blue-100">
                  <HeartPulse size={27} aria-hidden="true" />
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-canvas p-4">
                  <span className="grid size-10 place-items-center rounded-xl bg-blue-100 text-brand">
                    <Activity size={21} aria-hidden="true" />
                  </span>
                  <p className="mt-4 font-extrabold">{t('homeCardReadings')}</p>
                  <p className="mt-1 text-sm leading-5 text-muted">{t('homeCardReadingsDetail')}</p>
                </div>
                <div className="rounded-2xl border border-border bg-canvas p-4">
                  <span className="grid size-10 place-items-center rounded-xl bg-green-100 text-success">
                    <UsersRound size={21} aria-hidden="true" />
                  </span>
                  <p className="mt-4 font-extrabold">{t('homeCardCareTeam')}</p>
                  <p className="mt-1 text-sm leading-5 text-muted">{t('homeCardCareTeamDetail')}</p>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                <ShieldCheck className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
                <p className="text-sm font-semibold leading-6">{t('homeClinicalDisclaimer')}</p>
              </div>
            </div>
            <p className="mt-3 text-center text-xs font-medium text-muted">{t('homeIllustrationCaption')}</p>
          </div>
        </div>
      </section>

      <section id="features" className="border-y border-border bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-extrabold uppercase tracking-wider text-brand">{t('homeFeaturesEyebrow')}</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{t('homeFeaturesTitle')}</h2>
            <p className="mt-3 text-base leading-7 text-muted">{t('homeFeaturesDescription')}</p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-2xl border border-border bg-white p-5 transition-shadow hover:shadow-md">
                <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-brand">
                  <Icon size={23} aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-extrabold">{t(title)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{t(description)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-4 py-12 sm:px-6 md:flex-row md:items-center lg:px-8">
        <div>
          <h2 className="text-2xl font-black tracking-tight">{t('homeCtaTitle')}</h2>
          <p className="mt-2 max-w-2xl leading-6 text-muted">{t('homeCtaDescription')}</p>
        </div>
        <Link to="/register" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-extrabold text-white hover:bg-brand-dark">
          {t('homeGetStarted')}
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p className="font-bold text-ink">{t('appName')}</p>
          <p>{t('homeFooterDisclaimer')}</p>
          <Link to="/login" className="min-h-11 font-bold text-brand underline-offset-4 hover:underline">{t('signIn')}</Link>
        </div>
      </footer>
    </main>
  )
}
