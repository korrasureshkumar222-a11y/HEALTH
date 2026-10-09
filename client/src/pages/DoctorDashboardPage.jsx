import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Phone,
  RefreshCw,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getDoctorDashboard } from '../api/dashboard.js'
import { formatNumber, getLocale } from '../utils/formatDate.js'
import { getApiErrorMessage } from '../api/client.js'
import { ListSkeleton } from '../components/LoadingSkeleton.jsx'

const riskStyles = {
  critical: 'bg-red-100 text-red-900',
  warning: 'bg-amber-100 text-amber-950',
  missed: 'bg-orange-100 text-orange-950',
  normal: 'bg-green-100 text-green-900',
  unclassified: 'bg-slate-100 text-slate-800',
}

function PatientRisk({ status, t }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${riskStyles[status] ?? riskStyles.unclassified}`}>
      {t(`risk${status[0].toUpperCase()}${status.slice(1)}`)}
    </span>
  )
}

export default function DoctorDashboardPage() {
  const { t, i18n } = useTranslation()
  const [filters, setFilters] = useState({ village: '', condition: '', status: '' })
  const [formFilters, setFormFilters] = useState(filters)
  const [page, setPage] = useState(1)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setDashboard(await getDoctorDashboard({ page, limit: 20, ...filters }))
      setError('')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('doctorDashboardFailed')))
    } finally {
      setLoading(false)
    }
  }, [filters, page, t])

  useEffect(() => {
    // Refresh the remote dashboard when its query changes and on the live-feed interval.
    // eslint-disable-next-line react/set-state-in-effect
    setLoading(true)
    load()
    const timer = window.setInterval(load, 60_000)
    return () => window.clearInterval(timer)
  }, [load])

  function submitFilters(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const nextFilters = {
      village: String(data.get('village') ?? '').trim(),
      condition: String(data.get('condition') ?? ''),
      status: String(data.get('status') ?? ''),
    }
    setFormFilters(nextFilters)
    setFilters(nextFilters)
    setPage(1)
    setLoading(true)
  }

  function refreshNow() {
    setLoading(true)
    load()
  }

  const summary = dashboard?.summary
  const alerts = dashboard?.alerts ?? []
  const patients = dashboard?.patients ?? []
  const statusLabel = (status) => t(`server${status[0].toUpperCase()}${status.slice(1)}`)
  const formatDate = (date) => new Intl.DateTimeFormat(getLocale(i18n.language), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date))

  return (
    <section className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">{t('careTeam')}</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">{t('doctorDashboard')}</h1>
          <p className="mt-2 text-base text-muted">{t('doctorDashboardDescription')}</p>
        </div>
        <button type="button" onClick={refreshNow} disabled={loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 font-bold disabled:opacity-60">
          <RefreshCw size={18} aria-hidden="true" className={loading ? 'animate-spin' : ''} /> {t('refreshDashboard')}
        </button>
      </header>

      {summary && (
        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t('doctorSummary')}>
          <SummaryTile icon={Users} label={t('totalPatients')} value={formatNumber(summary.totalPatients, i18n.language)} style="border-blue-200 bg-blue-50 text-blue-950" />
          <SummaryTile icon={AlertTriangle} label={t('criticalNow')} value={formatNumber(summary.criticalNow, i18n.language)} style="border-red-200 bg-red-50 text-red-950" />
          <SummaryTile icon={Clock3} label={t('missedReadingsToday')} value={formatNumber(summary.missedReadingsToday, i18n.language)} style="border-amber-200 bg-amber-50 text-amber-950" />
          <SummaryTile icon={CalendarDays} label={t('appointmentsToday')} value={summary.appointmentsAvailable ? formatNumber(summary.appointmentsToday, i18n.language) : '—'} style="border-purple-200 bg-purple-50 text-purple-950" hint={!summary.appointmentsAvailable ? t('appointmentsNotConnected') : undefined} />
        </section>
      )}

      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div>
            <h2 className="text-xl font-extrabold text-ink">{t('riskSortedPatients')}</h2>
            <p className="mt-1 text-sm text-muted">{t('riskOrderHint')}</p>
          </div>
          <form onSubmit={submitFilters} className="mt-4 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm font-semibold">{t('village')}
              <input name="village" defaultValue={formFilters.village} className="min-h-11 rounded-xl border border-border px-3" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">{t('condition')}
              <select name="condition" defaultValue={formFilters.condition} className="min-h-11 rounded-xl border border-border px-3">
                <option value="">{t('allConditions')}</option>
                <option value="diabetes">{t('conditionDiabetes')}</option>
                <option value="hypertension">{t('conditionHypertension')}</option>
                <option value="cardiac">{t('conditionCardiac')}</option>
                <option value="other">{t('conditionOther')}</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">{t('patientRisk')}
              <select name="status" defaultValue={formFilters.status} className="min-h-11 rounded-xl border border-border px-3">
                <option value="">{t('allRiskLevels')}</option>
                {['critical', 'warning', 'missed', 'normal', 'unclassified'].map((status) => (
                  <option key={status} value={status}>{t(`risk${status[0].toUpperCase()}${status.slice(1)}`)}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="min-h-11 self-end rounded-xl bg-slate-900 px-4 font-bold text-white">{t('applyFilters')}</button>
          </form>

          <div className="mt-4" aria-live="polite">
            {loading && <ListSkeleton label={t('loadingPatients')} rows={5} />}
            {!loading && error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">
                <p>{error}</p>
                <button type="button" onClick={refreshNow} className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold">{t('tryAgain')}</button>
              </div>
            )}
            {!loading && !error && patients.length === 0 && (
              <div className="rounded-2xl border border-border bg-white p-8 text-center">
                <h3 className="font-bold">{t('noAssignedPatients')}</h3>
                <p className="mt-2 text-sm text-muted">{t('changeFiltersOrWait')}</p>
              </div>
            )}
            {!loading && !error && patients.length > 0 && (
              <>
                <div className="hidden overflow-x-auto rounded-2xl border border-border bg-white shadow-sm md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                      <tr><th className="px-4 py-3">{t('patient')}</th><th className="px-4 py-3">{t('village')}</th><th className="px-4 py-3">{t('conditions')}</th><th className="px-4 py-3">{t('latestReading')}</th><th className="px-4 py-3">{t('risk')}</th><th className="px-4 py-3">{t('actions')}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {patients.map((patient) => (
                        <tr key={patient.patientId}>
                          <td className="px-4 py-4"><Link to={`/patients/${patient.patientId}`} className="font-bold text-brand hover:underline">{patient.name || t('patient')}</Link><p className="mt-1 text-xs text-muted">{patient.phone}</p></td>
                          <td className="px-4 py-4">{patient.village}</td>
                          <td className="px-4 py-4">{patient.conditions?.map((condition) => t(`condition${condition[0].toUpperCase()}${condition.slice(1)}`)).join(', ') || '—'}</td>
                          <td className="px-4 py-4">{patient.latestReading ? <><span className="font-semibold">{patient.latestReading.type === 'bp' ? `${formatNumber(patient.latestReading.values.systolic, i18n.language)}/${formatNumber(patient.latestReading.values.diastolic, i18n.language)}` : `${formatNumber(patient.latestReading.values.value, i18n.language)} ${patient.latestReading.values.unit ?? ''}`}</span><p className="mt-1 text-xs text-muted">{formatDate(patient.latestReading.recordedAt)} · {statusLabel(patient.latestReading.status)}</p></> : t('noReadings')}</td>
                          <td className="px-4 py-4"><PatientRisk status={patient.riskStatus} t={t} />{patient.missedToday && <p className="mt-1 text-xs text-muted">{t('readingMissingToday')}</p>}</td>
                          <td className="px-4 py-4"><QuickActions patient={patient} t={t} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-3 md:hidden">
                  {patients.map((patient) => (
                    <article key={patient.patientId} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><Link to={`/patients/${patient.patientId}`} className="font-extrabold text-brand">{patient.name || t('patient')}</Link><p className="mt-1 text-sm text-muted">{patient.phone}</p><p className="mt-1 text-sm">{patient.village}</p></div>
                        <PatientRisk status={patient.riskStatus} t={t} />
                      </div>
                      <p className="mt-3 text-sm">{patient.conditions?.map((condition) => t(`condition${condition[0].toUpperCase()}${condition.slice(1)}`)).join(', ') || '—'}</p>
                      <p className="mt-2 text-sm text-muted">{patient.latestReading ? `${patient.latestReading.type === 'bp' ? `${formatNumber(patient.latestReading.values.systolic, i18n.language)}/${formatNumber(patient.latestReading.values.diastolic, i18n.language)}` : `${formatNumber(patient.latestReading.values.value, i18n.language)} ${patient.latestReading.values.unit ?? ''}`} · ${formatDate(patient.latestReading.recordedAt)}` : t('noReadings')}</p>
                      {patient.missedToday && <p className="mt-2 text-xs font-bold text-amber-900">{t('readingMissingToday')}</p>}
                      <QuickActions patient={patient} t={t} />
                    </article>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <button type="button" disabled={page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1) }} className="min-h-11 rounded-xl border border-border bg-white px-4 font-semibold disabled:opacity-50">{t('previous')}</button>
                  <span className="text-sm text-muted">{t('pageNumber', { page })}</span>
                  <button type="button" disabled={!dashboard.hasMore} onClick={() => { setLoading(true); setPage((value) => value + 1) }} className="min-h-11 rounded-xl border border-border bg-white px-4 font-semibold disabled:opacity-50">{t('next')}</button>
                </div>
              </>
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-extrabold text-ink">{t('liveAlertFeed')}</h2><p className="text-xs text-muted">{t('updatesEveryMinute')}</p></div>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-900"><span className="size-2 animate-pulse rounded-full bg-red-700" /> {t('live')}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="mt-4 rounded-xl bg-green-50 p-4 text-sm text-green-950"><CheckCircle2 size={20} className="mb-2" aria-hidden="true" />{t('noOpenAlerts')}</div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {alerts.map((alert) => (
                <li key={alert._id} className="py-3">
                  <Link to={`/patients/${alert.patient?._id}`} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={19} className={alert.severity === 'critical' ? 'mt-0.5 shrink-0 text-red-700' : 'mt-0.5 shrink-0 text-amber-700'} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block font-bold text-ink">{alert.patient?.name ?? t('patient')}</span>
                        <span className="mt-1 block text-sm text-muted">{alert.message?.[i18n.language] ?? alert.message?.en}</span>
                        <span className="mt-1 block text-xs text-muted">{formatDate(alert.createdAt)}</span>
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/doctor/alerts" className="mt-3 inline-flex min-h-11 items-center font-bold text-brand">{t('viewAllAlerts')} →</Link>
        </aside>
      </section>
    </section>
  )
}

function SummaryTile({ icon: Icon, label, value, style, hint }) {
  return (
    <article className={`min-h-28 rounded-2xl border p-4 ${style}`}>
      <div className="flex items-center gap-2"><Icon size={20} aria-hidden="true" /><h2 className="text-sm font-bold leading-tight">{label}</h2></div>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs">{hint}</p>}
    </article>
  )
}

function QuickActions({ patient, t }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {patient.phone && <a href={`tel:${patient.phone}`} aria-label={t('callPatient', { name: patient.name })} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-bold text-ink"><Phone size={16} aria-hidden="true" />{t('call')}</a>}
      <Link to={`/patients/${patient.patientId}#notes`} className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-bold">{t('addNote')}</Link>
      <Link to={`/patients/${patient.patientId}#appointments`} className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-bold">{t('schedule')}</Link>
    </div>
  )
}
