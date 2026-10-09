import { useCallback, useEffect, useState } from 'react'
import { Activity, Bell, CalendarDays, ClipboardList, FileText, Home, LogOut, MapPin, MoreHorizontal, Plus, Type, UserRound, Users, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/useAuth.js'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import LanguageToggle from './LanguageToggle.jsx'
import { getAlerts } from '../api/alerts.js'
import SyncStatus from './SyncStatus.jsx'

const navigationByRole = {
  patient: [
    { to: '/patient', labelKey: 'home', icon: Home, end: true },
    { to: '/patient/readings/new', labelKey: 'addReading', icon: Plus },
    { to: '/patient/alerts', labelKey: 'alerts', icon: Bell },
    { to: '/patient/appointments', labelKey: 'appointmentsTitle', icon: CalendarDays },
    { to: '/patient/history', labelKey: 'history', icon: Activity },
    { to: '/patient/reports', labelKey: 'reports', icon: FileText },
    { to: '/patient/sos', labelKey: 'help', icon: Bell },
    { to: '/patients/me', labelKey: 'profile', icon: UserRound },
  ],
  doctor: [
    { to: '/doctor', labelKey: 'dashboard', icon: Home, end: true },
    { to: '/doctor/patients', labelKey: 'patients', icon: Users },
    { to: '/doctor/alerts', labelKey: 'alerts', icon: Bell },
    { to: '/doctor/appointments', labelKey: 'appointmentsTitle', icon: CalendarDays },
  ],
  chw: [
    { to: '/chw', labelKey: 'village', icon: Home, end: true },
    { to: '/chw/readings/new', labelKey: 'chwAddReading', icon: Plus },
    { to: '/chw/patients', labelKey: 'patients', icon: Users },
    { to: '/chw/visits', labelKey: 'visits', icon: ClipboardList },
    { to: '/chw/landing-points', labelKey: 'chwLandingPointsNav', icon: MapPin },
    { to: '/chw/alerts', labelKey: 'alerts', icon: Bell },
    { to: '/chw/appointments', labelKey: 'appointmentsTitle', icon: CalendarDays },
  ],
  admin: [
    { to: '/admin', labelKey: 'administration', icon: Home, end: true },
    { to: '/admin/users', labelKey: 'users', icon: Users },
    { to: '/admin/patients', labelKey: 'patients', icon: UserRound },
    { to: '/admin/operations', labelKey: 'operations', icon: MapPin },
    { to: '/admin/alerts', labelKey: 'alerts', icon: Bell },
    { to: '/admin/reports', labelKey: 'reports', icon: FileText },
  ],
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()
  const isOnline = useOnlineStatus()
  const navItems = navigationByRole[user?.role] ?? []
  const primaryItems = navItems.slice(0, 4)
  const moreItems = navItems.slice(4)
  const isMoreActive = moreItems.some(({ to }) => location.pathname === to || location.pathname.startsWith(`${to}/`))
  const [openAlertCount, setOpenAlertCount] = useState(0)
  const [alertCountError, setAlertCountError] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [largeText, setLargeText] = useState(() => {
    try {
      return localStorage.getItem('largeTextMode') === 'true'
    } catch (error) {
      console.warn('Could not read the large-text preference.', error)
      return false
    }
  })

  const refreshAlertCount = useCallback(async () => {
    try {
      const result = await getAlerts({ status: 'open', page: 1, limit: 1 })
      setOpenAlertCount(result.total)
      setAlertCountError(false)
    } catch {
      setAlertCountError(true)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.largeText = String(largeText)
    try {
      localStorage.setItem('largeTextMode', String(largeText))
    } catch (error) {
      console.warn('Could not save the large-text preference.', error)
    }
  }, [largeText])

  useEffect(() => {
    // Keep the shared badge synchronized with server-side alert state.
    // eslint-disable-next-line react/set-state-in-effect
    refreshAlertCount()
    const timer = window.setInterval(refreshAlertCount, 30_000)
    return () => window.clearInterval(timer)
  }, [refreshAlertCount])

  async function handleLogout() {
    await logout()
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a className="skip-link" href="#main-content">{t('skipToContent')}</a>
      <header className="sticky top-0 z-20 border-b border-border bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Link to="/" className="flex min-h-touch items-center gap-2 font-bold text-brand">
            <Activity size={22} aria-hidden="true" />
            <span>{t('appName')}</span>
          </Link>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex min-h-touch items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                isOnline ? 'bg-success-bg text-success-ink' : 'bg-warning-bg text-warning-ink'
              }`}
              role="status"
            >
              <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
              <span className="header-status-text">{isOnline ? t('online') : t('offline')}</span>
            </span>
            <LanguageToggle />
            <button
              className="inline-flex min-h-touch items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-ink hover:bg-slate-100"
              type="button"
              aria-pressed={largeText}
              aria-label={t(largeText ? 'largeTextOn' : 'largeTextOff')}
              onClick={() => setLargeText((enabled) => !enabled)}
            >
              <Type size={18} aria-hidden="true" />
              <span className="hidden sm:inline">{t('largeText')}</span>
            </button>
            <button
              className="inline-flex min-h-touch items-center gap-2 rounded-lg px-3 text-sm font-semibold text-ink hover:bg-slate-100"
              type="button"
              aria-label={t('signOut')}
              onClick={handleLogout}
            >
              <LogOut size={18} aria-hidden="true" />
              <span className="hidden sm:inline">{t('signOut')}</span>
            </button>
          </div>
        </div>
      </header>

      <SyncStatus />

      <main id="main-content" tabIndex="-1" className="mx-auto min-h-[calc(100vh-8rem)] max-w-6xl px-4 py-6 pb-28 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <nav
        aria-label={t('primaryNavigation')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setMoreOpen(false)
        }}
        className="bottom-navigation fixed inset-x-0 bottom-0 z-20 border-t border-border bg-white"
      >
        <div className="relative mx-auto flex max-w-2xl items-stretch px-1">
          {primaryItems.map(({ to, labelKey, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={t(labelKey)}
              onClick={() => setMoreOpen(false)}
              className="bottom-navigation-link flex flex-col items-center justify-center gap-1 px-1 text-[11px] font-bold sm:text-xs"
            >
              <Icon size={22} aria-hidden="true" />
              <span className="flex items-center gap-1">
                {t(labelKey)}
                {labelKey === 'alerts' && openAlertCount > 0 && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-700 px-1 text-[10px] leading-5 text-white" aria-label={t('openAlertBadge', { count: openAlertCount })}>
                    {openAlertCount > 99 ? '99+' : openAlertCount}
                  </span>
                )}
                {labelKey === 'alerts' && alertCountError && (
                  <span className="sr-only" role="status">{t('alertBadgeUnavailable')}</span>
                )}
              </span>
            </NavLink>
          ))}
          {moreItems.length > 0 && (
            <>
              <button
                type="button"
                className={`bottom-navigation-link flex flex-col items-center justify-center gap-1 px-1 text-[11px] font-bold sm:text-xs ${isMoreActive || moreOpen ? 'bg-blue-50 text-blue-900' : ''}`}
                aria-expanded={moreOpen}
                aria-controls="more-navigation-links"
                aria-label={t(moreOpen ? 'closeMoreNavigation' : 'moreNavigation')}
                onClick={() => setMoreOpen((open) => !open)}
              >
                {moreOpen ? <X size={22} aria-hidden="true" /> : <MoreHorizontal size={22} aria-hidden="true" />}
                <span>{t('moreNavigation')}</span>
              </button>
              {moreOpen && (
                <div id="more-navigation-links" className="more-navigation" aria-label={t('additionalNavigation')} hidden={!moreOpen}>
                  {moreItems.map(({ to, labelKey, icon: Icon, end }) => (
                    <NavLink key={to} to={to} end={end} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 font-semibold">
                      <Icon size={20} aria-hidden="true" />
                      <span>{t(labelKey)}</span>
                      {labelKey === 'alerts' && openAlertCount > 0 && (
                        <span className="ml-auto rounded-full bg-red-700 px-2 text-xs leading-6 text-white" aria-label={t('openAlertBadge', { count: openAlertCount })}>
                          {openAlertCount > 99 ? '99+' : openAlertCount}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </nav>
    </div>
  )
}
