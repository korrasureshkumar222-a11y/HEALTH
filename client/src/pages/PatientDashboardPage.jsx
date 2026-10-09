import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  HeartPulse,
  MapPin,
  Phone,
  Pill,
  RefreshCw,
  Siren,
  Volume2,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getPatientDashboard } from '../api/dashboard.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../context/useAuth.js'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import { getPendingReadingCount } from '../offline/readingQueue.js'
import { formatNumber, getLocale } from '../utils/formatDate.js'
import { DashboardSkeleton } from '../components/LoadingSkeleton.jsx'

const vitalLabels = {
  bp: 'bloodPressure',
  sugar: 'bloodSugar',
  heartRate: 'heartRate',
  weight: 'weight',
  spo2: 'oxygenLevel',
  temperature: 'temperature',
}

const vitalIcons = {
  bp: Activity,
  sugar: TrendingUp,
  heartRate: HeartPulse,
  weight: Activity,
  spo2: Activity,
  temperature: Activity,
}

const statusStyles = {
  normal: 'border-green-200 bg-green-50 text-green-950',
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  critical: 'border-red-300 bg-red-50 text-red-950',
  unclassified: 'border-slate-200 bg-slate-50 text-slate-800',
}

function vitalValue(vital, language) {
  const reading = vital.latest
  if (!reading) return null
  if (reading.type === 'bp') {
    return `${formatNumber(reading.values.systolic, language)}/${formatNumber(reading.values.diastolic, language)} ${reading.values.unit ?? 'mmHg'}`
  }
  return `${formatNumber(reading.values.value, language)} ${reading.values.unit ?? ''}`
}

function formatDate(date, language) {
  return new Intl.DateTimeFormat(getLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

function Trend({ direction, t }) {
  const Icon = direction === 'up'
    ? ArrowUpRight
    : direction === 'down'
      ? ArrowDownRight
      : direction === 'same'
        ? ArrowRight
        : null
  if (!Icon) return <span className="text-xs font-semibold text-muted">{t('noPreviousReading')}</span>
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
      <Icon size={16} aria-hidden="true" />
      {t(`trend${direction[0].toUpperCase()}${direction.slice(1)}`)}
    </span>
  )
}

function greetingKey() {
  const hour = new Date().getHours()
  if (hour < 12) return 'goodMorning'
  if (hour < 17) return 'goodAfternoon'
  return 'goodEvening'
}

export default function PatientDashboardPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [dashboard, setDashboard] = useState(null)
  const [pendingReadings, setPendingReadings] = useState(null)
  const [syncStatusError, setSyncStatusError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    getPatientDashboard()
      .then((result) => {
        if (!active) return
        setDashboard(result)
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(getApiErrorMessage(requestError, t('dashboardLoadFailed')))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reload, t, user.id])

  useEffect(() => {
    let active = true
    getPendingReadingCount(user.id)
      .then((pendingCount) => {
        if (!active) return
        setPendingReadings(pendingCount)
        setSyncStatusError(false)
      })
      .catch(() => {
        if (active) {
          setPendingReadings(null)
          setSyncStatusError(true)
        }
      })
    return () => {
      active = false
    }
  }, [isOnline, user.id])

  function retryDashboard() {
    setError('')
    setLoading(true)
    setReload((current) => current + 1)
  }

  const todayMedications = dashboard?.todayMedications
  const nextAppointment = dashboard?.nextAppointment
  const healthCentre = dashboard?.nearestHealthCentre
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

  function speakVital(vital) {
    if (!canSpeak || !vital.latest) return
    window.speechSynthesis.cancel()
    const status = t(`server${vital.latest.status[0].toUpperCase()}${vital.latest.status.slice(1)}`)
    const utterance = new SpeechSynthesisUtterance(
      t('vitalStatusAnnouncement', {
        vital: t(vitalLabels[vital.type]),
        status,
        value: vitalValue(vital, i18n.language),
      }),
    )
    utterance.lang = i18n.language === 'te' ? 'te-IN' : 'en-IN'
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
  }

  return (
    <section className="mx-auto max-w-5xl pb-32">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">{t('patientHome')}</p>
          <h1 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight text-ink">
            {t(greetingKey())}, {dashboard?.patientName ?? user.name}
          </h1>
          <p className="mt-1 text-base text-muted">{t('dashboardSubtitle')}</p>
        </div>
        <div
          className="relative grid min-h-12 min-w-12 place-items-center rounded-xl border border-border bg-white text-ink"
          role="status"
          aria-label={t('openAlertsCount', { count: dashboard?.openAlertsCount ?? 0 })}
        >
          <Bell size={22} aria-hidden="true" />
          {(dashboard?.openAlertsCount ?? 0) > 0 && (
            <span className="absolute -right-1 -top-1 grid min-h-6 min-w-6 place-items-center rounded-full bg-red-700 px-1 text-xs font-bold text-white">
              {dashboard.openAlertsCount > 99 ? `${formatNumber(99, i18n.language)}+` : formatNumber(dashboard.openAlertsCount, i18n.language)}
            </span>
          )}
        </div>
      </header>

      <div
        className={`mb-5 flex items-center gap-3 rounded-2xl border p-4 ${
          isOnline ? 'border-green-200 bg-green-50 text-green-950' : 'border-amber-300 bg-amber-50 text-amber-950'
        }`}
        role="status"
      >
        {isOnline ? <CheckCircle2 size={23} aria-hidden="true" /> : <RefreshCw size={23} aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="font-bold">{isOnline ? t('online') : t('offline')}</p>
          <p className="text-sm">
            {syncStatusError
              ? t('syncStatusUnavailable')
              : pendingReadings === null
                ? t('checkingSyncStatus')
                : pendingReadings > 0
                  ? t('pendingReadingSync', { count: pendingReadings })
                  : isOnline ? t('allReadingsSynced') : t('offlineDashboardNotice')}
          </p>
        </div>
        {pendingReadings > 0 && <span className="rounded-full bg-white px-3 py-1 text-sm font-bold">{formatNumber(pendingReadings, i18n.language)}</span>}
      </div>

      {loading && (
        <DashboardSkeleton label={t('loadingDashboard')} />
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">
          <p className="font-bold">{t('dashboardLoadFailed')}</p>
          <p className="mt-1 text-sm">{error}</p>
          <button type="button" onClick={retryDashboard} className="mt-3 min-h-11 rounded-xl border border-red-300 px-4 font-bold">
            {t('tryAgain')}
          </button>
        </div>
      )}

      {!loading && !error && dashboard && (
        <>
          <section aria-labelledby="vitals-heading">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="vitals-heading" className="text-xl font-extrabold text-ink">{t('latestVitals')}</h2>
              <Link to="/patient/history" className="inline-flex min-h-11 items-center gap-1 font-bold text-brand">
                {t('viewAll')} <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {dashboard.latestVitals.map((vital) => {
                const Icon = vitalIcons[vital.type] ?? Activity
                const style = statusStyles[vital.latest?.status] ?? statusStyles.unclassified
                return (
                  <article key={vital.type} className={`min-h-36 rounded-2xl border p-3 sm:p-4 ${style}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/80">
                        <Icon size={22} aria-hidden="true" />
                      </span>
                      <div className="flex items-center gap-2">
                        {vital.latest && <span className="ui-badge bg-white/80">{t(`server${vital.latest.status[0].toUpperCase()}${vital.latest.status.slice(1)}`)}</span>}
                        {canSpeak && vital.latest && (
                          <button
                            type="button"
                            className="grid size-10 min-h-10 place-items-center rounded-full bg-white/80 hover:bg-white"
                            aria-label={t('speakVitalStatus', { vital: t(vitalLabels[vital.type]) })}
                            onClick={() => speakVital(vital)}
                          >
                            <Volume2 size={19} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                    <h3 className="mt-3 text-sm font-bold leading-tight">{t(vitalLabels[vital.type])}</h3>
                    <p className="mt-1 text-xl font-extrabold leading-tight">
                      {vital.latest ? vitalValue(vital, i18n.language) : <span className="text-base font-semibold">{t('noRecentReading')}</span>}
                    </p>
                    {vital.latest && (
                      <>
                        <div className="mt-2"><Trend direction={vital.trend} t={t} /></div>
                        <p className="mt-1 text-[11px] opacity-80">{formatDate(vital.latest.recordedAt, i18n.language)}</p>
                      </>
                    )}
                  </article>
                )
              })}
            </div>
          </section>

          <section className="mt-5 grid gap-3 sm:grid-cols-2" aria-label={t('careOverview')}>
            <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-900"><Pill size={23} aria-hidden="true" /></span>
                <h2 className="text-lg font-extrabold text-ink">{t('todaysMedications')}</h2>
              </div>
              {todayMedications?.available && todayMedications.items.length > 0 ? (
                <ul className="mt-3 divide-y divide-border">
                  {todayMedications.items.map((medication) => (
                    <li key={medication.id} className="flex min-h-14 items-center gap-3 py-2">
                      <input type="checkbox" checked={Boolean(medication.taken)} readOnly className="size-5 accent-green-700" aria-label={t('medicationTaken', { name: medication.name })} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{medication.name} · {medication.dose}</span>
                        {(medication.instructions?.[i18n.language] || medication.instructions?.en) && (
                          <span className="block text-sm text-muted">{medication.instructions[i18n.language] || medication.instructions.en}</span>
                        )}
                      </span>
                      <span className="text-sm text-muted">{medication.time}</span>
                    </li>
                  ))}
                </ul>
              ) : todayMedications?.available ? (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-muted">{t('noMedicationsToday')}</p>
              ) : (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-muted">{t('medicationScheduleUnavailable')}</p>
              )}
            </article>

            <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-purple-50 text-purple-900"><CalendarDays size={23} aria-hidden="true" /></span>
                <h2 className="text-lg font-extrabold text-ink">{t('nextAppointment')}</h2>
              </div>
              {nextAppointment?.appointment ? (
                <div className="mt-3">
                  <p className="font-bold">{nextAppointment.appointment.reason || t('appointment')}</p>
                  <p className="mt-1 text-sm text-muted">{formatDate(nextAppointment.appointment.scheduledAt, i18n.language)}</p>
                </div>
              ) : nextAppointment?.available ? (
                <p className="mt-3 text-sm leading-6 text-muted">{t('noAppointmentScheduled')}</p>
              ) : (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-muted">{t('appointmentScheduleUnavailable')}</p>
              )}
              <Link to="/patient/appointments" className="mt-2 inline-flex min-h-11 items-center gap-1 font-bold text-brand">
                {t('appointments')} <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </article>
          </section>

          <section className="mt-3 grid gap-3 sm:grid-cols-2">
            <Link to="/patient/alerts" className="flex min-h-20 items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <span className="grid size-11 place-items-center rounded-xl bg-white"><AlertTriangle size={23} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">{t('careAlerts')}</span>
                <span className="block text-sm">{t('openAlertsCount', { count: dashboard.openAlertsCount })}</span>
              </span>
              <ArrowRight size={19} aria-hidden="true" />
            </Link>

            <article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-green-50 text-green-900"><MapPin size={23} aria-hidden="true" /></span>
                <h2 className="text-lg font-extrabold text-ink">{t('nearestHealthCentre')}</h2>
              </div>
              {healthCentre ? (
                <>
                  <p className="mt-3 font-bold">{healthCentre.name}</p>
                  <p className="mt-1 text-sm leading-5 text-muted">{healthCentre.address}</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-green-900">
                    <MapPin size={16} aria-hidden="true" />
                    {healthCentre.distanceKm == null ? t('distanceUnavailable') : t('distanceKm', { distance: healthCentre.distanceKm })}
                  </p>
                  {healthCentre.phone && (
                    <a href={`tel:${healthCentre.phone}`} className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-800 px-4 font-extrabold text-white">
                      <Phone size={19} aria-hidden="true" /> {t('callHealthCentre')}
                    </a>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted">{t('healthCentreUnavailable')}</p>
              )}
              <Link to="/patient/centres" className="mt-2 inline-flex min-h-11 items-center gap-1 font-bold text-brand">
                {t('nearbyHealthCentresTitle')} <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </article>
          </section>

          <Link
            to="/patient/sos"
            className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 mx-auto flex min-h-16 max-w-xl items-center justify-center gap-3 rounded-2xl border-2 border-white bg-red-700 px-5 text-xl font-extrabold text-white shadow-[0_8px_24px_rgba(127,29,29,0.35)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-800"
            aria-label={t('openEmergencyHelp')}
          >
            <Siren size={28} aria-hidden="true" />
            {t('emergencyHelp')}
          </Link>
        </>
      )}
    </section>
  )
}
