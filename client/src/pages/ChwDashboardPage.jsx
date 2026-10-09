import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, CalendarDays, ClipboardCheck, MapPin, Plus, RefreshCw, Siren, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { getChwDashboard, getChwPerformance } from '../api/chw.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../context/useAuth.js'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import { listCachedPatients, cachePatient } from '../offline/patientCache.js'
import { formatDateTime } from '../utils/formatDate.js'

export default function ChwDashboardPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const online = useOnlineStatus()
  const [dashboard, setDashboard] = useState({ villages: [], patients: [], summary: {} })
  const [performance, setPerformance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true)
    else setLoading(true)
    try {
      const [result, week] = await Promise.all([getChwDashboard(), getChwPerformance()])
      setDashboard(result)
      setPerformance(week)
      setError('')
      await Promise.all(result.patients.map((patient) => cachePatient(user.id, patient)))
    } catch (requestError) {
      if (!online || !requestError.response || requestError.response.status >= 500) {
        try {
          const cached = await listCachedPatients(user.id)
          if (cached.length) {
            setDashboard((previous) => ({
              ...previous,
              patients: cached.map((patient) => ({ ...patient, pendingReadingToday: true })),
            }))
            setError('')
          } else setError(getApiErrorMessage(requestError, t('chwDashboardLoadFailed')))
        } catch (cacheError) {
          setError(getApiErrorMessage(cacheError, t('chwDashboardLoadFailed')))
        }
      } else {
        setError(getApiErrorMessage(requestError, t('chwDashboardLoadFailed')))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [online, t, user.id])

  useEffect(() => {
    load().catch((requestError) => setError(getApiErrorMessage(requestError, t('chwDashboardLoadFailed'))))
  }, [load, t])

  async function triggerSos(patient) {
    if (!window.confirm(t('chwConfirmSos', { name: patient.name }))) return
    try {
      const { createSos } = await import('../api/sos.js')
      const { queueSos } = await import('../offline/sosQueue.js')
      const { requestBackgroundSync } = await import('../offline/syncManager.js')
      const input = {
        clientId: crypto.randomUUID(),
        patientId: patient._id,
        ...(patient.location ? { location: patient.location } : {}),
      }
      if (!online) {
        await queueSos(user.id, input)
        await requestBackgroundSync()
        toast.success(t('chwSosQueued'))
      } else {
        const result = await createSos(input)
        toast.success(result.duplicate ? t('chwSosAlreadySent') : t('chwSosSent'))
      }
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('chwSosFailed')))
    }
  }

  const filteredPatients = dashboard.patients.filter((patient) => {
    const query = search.trim().toLocaleLowerCase(i18n.resolvedLanguage === 'te' ? 'te-IN' : 'en-IN')
    return !query || [patient.name, patient.phone, patient.village, patient.mandal]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(query))
  })

  return (
    <section className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">{t('chwHomeEyebrow')}</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">{t('helloName', { name: user?.name })}</h1>
          <p className="mt-2 text-muted">{t('chwVillageDescription')}</p>
        </div>
        <button type="button" onClick={() => load(true)} disabled={refreshing} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-white px-4 font-bold">
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" /> {t('refreshDashboard')}
        </button>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [Users, t('chwAssignedPatients'), dashboard.summary.totalPatients ?? dashboard.patients.length, 'bg-blue-50 text-blue-900'],
          [Activity, t('chwPendingReadings'), dashboard.summary.pendingReadingsToday ?? 0, 'bg-amber-50 text-amber-950'],
          [AlertTriangle, t('openAlerts'), dashboard.summary.openAlerts ?? 0, 'bg-red-50 text-red-900'],
          [ClipboardCheck, t('chwVisitsDoneToday'), dashboard.summary.visitsCompletedToday ?? 0, 'bg-green-50 text-green-900'],
        ].map(([Icon, label, value, style]) => (
          <article key={label} className={`rounded-2xl border border-border p-4 ${style}`}>
            <div className="flex items-center justify-between"><span className="text-sm font-bold">{label}</span><Icon size={21} aria-hidden="true" /></div>
            <p className="mt-2 text-3xl font-extrabold">{value}</p>
          </article>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-extrabold">{t('chwWeeklyPerformance')}</h2><p className="mt-1 text-sm text-muted">{performance ? `${formatDateTime(performance.from, i18n.resolvedLanguage)} – ${formatDateTime(performance.to, i18n.resolvedLanguage)}` : t('loading')}</p></div>
          <div className="flex gap-2">
            <Link to="/chw/readings/new" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand px-4 font-bold text-white"><Plus size={18} />{t('chwAddReading')}</Link>
            <Link to="/patients/new" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-brand px-4 font-bold text-brand"><Users size={18} />{t('registerPatient')}</Link>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-extrabold">{performance?.patientsCovered ?? 0}</p><p className="text-xs font-semibold text-muted">{t('chwPatientsCovered')}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-extrabold">{performance?.readingsEntered ?? 0}</p><p className="text-xs font-semibold text-muted">{t('chwReadingsEntered')}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-extrabold">{performance?.alertsHandled ?? 0}</p><p className="text-xs font-semibold text-muted">{t('chwAlertsHandled')}</p></div>
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[0.8fr,1.2fr]">
        <section className="rounded-2xl border border-border bg-white p-5">
          <header className="flex items-center justify-between"><h2 className="text-xl font-extrabold">{t('chwAssignedVillages')}</h2><MapPin className="text-brand" /></header>
          {dashboard.villages.length ? (
            <ul className="mt-4 grid gap-3">
              {dashboard.villages.map((village) => (
                <li key={`${village.village}-${village.mandal}-${village.district}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                  <div><p className="font-bold">{village.village}</p><p className="text-sm text-muted">{[village.mandal, village.district].filter(Boolean).join(', ')}</p></div>
                  <div className="text-right text-sm"><p className="font-bold">{t('chwPatientCount', { count: village.patientCount })}</p><p className="text-amber-900">{t('chwPendingCount', { count: village.pendingReadings })}</p></div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-muted">{t('chwNoAssignedVillages')}</p>}
          <Link to="/chw/visits" className="mt-4 inline-flex min-h-12 items-center gap-2 font-bold text-brand"><CalendarDays size={18} />{t('chwOpenVisitPlanner')}</Link>
        </section>

        <section className="rounded-2xl border border-border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-extrabold">{t('chwVillagePatients')}</h2>
            <Link to="/chw/alerts" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 font-bold"><AlertTriangle size={17} />{t('alerts')}</Link>
          </div>
          <label className="mt-4 flex min-h-12 items-center gap-2 rounded-xl border border-border px-3"><Users size={18} className="text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full outline-none" placeholder={t('chwSearchPatients')} aria-label={t('chwSearchPatients')} /></label>
          {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-800">{error}<button type="button" onClick={() => load()} className="ml-2 underline">{t('tryAgain')}</button></div>}
          {loading ? <p className="mt-4 text-muted">{t('loading')}</p> : filteredPatients.length ? (
            <ul className="mt-3 divide-y divide-border">
              {filteredPatients.map((patient) => (
                <li key={patient._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-[12rem] flex-1">
                    <Link to={`/patients/${patient._id}`} className="font-bold text-brand underline-offset-2 hover:underline">{patient.name}</Link>
                    <p className="text-sm text-muted">{patient.phone} · {patient.village}{patient.mandal ? `, ${patient.mandal}` : ''}</p>
                    <span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-bold ${patient.pendingReadingToday ? 'bg-amber-100 text-amber-950' : 'bg-green-100 text-green-900'}`}>
                      {patient.pendingReadingToday ? t('chwReadingPending') : t('chwReadingDone')}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/chw/readings/new?patientId=${patient._id}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand px-3 text-sm font-bold text-white"><Plus size={16} />{t('chwAddReadingShort')}</Link>
                    <button type="button" onClick={() => triggerSos(patient)} aria-label={t('chwTriggerSos', { name: patient.name })} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-red-700 px-3 text-sm font-bold text-white"><Siren size={17} />SOS</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <div className="mt-5 rounded-xl bg-slate-50 p-5 text-center text-muted">{t('chwNoPatients')}</div>}
        </section>
      </div>
    </section>
  )
}
