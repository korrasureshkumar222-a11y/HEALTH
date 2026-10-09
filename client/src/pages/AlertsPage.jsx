import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCheck, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { getLocale } from '../utils/formatDate.js'
import { acknowledgeAlert, getAlerts, resolveAlert } from '../api/alerts.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../context/useAuth.js'

const severityStyles = {
  critical: 'border-l-red-700 bg-red-50',
  warning: 'border-l-amber-600 bg-amber-50',
  info: 'border-l-blue-700 bg-blue-50',
}

export default function AlertsPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [filters, setFilters] = useState({ status: 'open', severity: '', type: '' })
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ items: [], total: 0, hasMore: false })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [resolutionId, setResolutionId] = useState('')
  const requestId = useRef(0)
  const limit = 20

  const load = useCallback(async (background = false) => {
    const currentRequestId = ++requestId.current
    if (background) setRefreshing(true)
    else setLoading(true)
    try {
      const response = await getAlerts({
        ...filters,
        page,
        limit,
      })
      if (currentRequestId === requestId.current) {
        setResult(response)
        setError('')
      }
    } catch (requestError) {
      if (currentRequestId === requestId.current) {
        setError(getApiErrorMessage(requestError, t('alertsLoadFailed')))
      }
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [filters, page, t])

  useEffect(() => {
    // Load the filtered alert page and maintain its live refresh interval.
    // eslint-disable-next-line react/set-state-in-effect
    load()
    const interval = window.setInterval(() => load(true), 30_000)
    return () => window.clearInterval(interval)
  }, [load])

  async function updateFilters(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setFilters({
      status: String(form.get('status') ?? ''),
      severity: String(form.get('severity') ?? ''),
      type: String(form.get('type') ?? ''),
    })
    setPage(1)
  }

  async function acknowledge(alert) {
    try {
      await acknowledgeAlert(alert._id)
      toast.success(t('alertAcknowledged'))
      await load(true)
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('alertUpdateFailed')))
    }
  }

  async function resolve(event, alert) {
    event.preventDefault()
    const resolutionNote = String(new FormData(event.currentTarget).get('resolutionNote') ?? '').trim()
    try {
      await resolveAlert(alert._id, resolutionNote)
      setResolutionId('')
      toast.success(t('alertResolved'))
      await load(true)
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('alertUpdateFailed')))
    }
  }

  const mayAcknowledge = ['doctor', 'chw', 'admin'].includes(user?.role)
  const mayResolve = ['doctor', 'admin'].includes(user?.role)

  return (
    <section className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">{t('careTeam')}</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">{t('alerts')}</h1>
          <p className="mt-2 text-base text-muted">{t('alertsDescription')}</p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-white px-4 font-bold disabled:opacity-60"
        >
          <RefreshCw size={18} aria-hidden="true" className={refreshing ? 'animate-spin' : ''} />
          {t('refreshDashboard')}
        </button>
      </header>

      <form onSubmit={updateFilters} className="mt-5 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-semibold">{t('alertStatus')}
          <select name="status" defaultValue={filters.status} className="min-h-12 rounded-xl border border-border px-3">
            <option value="">{t('allStatuses')}</option>
            <option value="open">{t('alertOpen')}</option>
            <option value="acknowledged">{t('alertAcknowledgedStatus')}</option>
            <option value="resolved">{t('alertResolvedStatus')}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">{t('severity')}
          <select name="severity" defaultValue={filters.severity} className="min-h-12 rounded-xl border border-border px-3">
            <option value="">{t('allSeverities')}</option>
            <option value="critical">{t('riskCritical')}</option>
            <option value="warning">{t('riskWarning')}</option>
            <option value="info">{t('alertInfo')}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">{t('alertType')}
          <select name="type" defaultValue={filters.type} className="min-h-12 rounded-xl border border-border px-3">
            <option value="">{t('allAlertTypes')}</option>
            <option value="critical_reading">{t('alertCriticalReading')}</option>
            <option value="warning_reading">{t('alertWarningReading')}</option>
            <option value="missed_reading">{t('alertMissedReading')}</option>
            <option value="sos">{t('alertSos')}</option>
            <option value="medication_missed">{t('alertMedicationMissed')}</option>
          </select>
        </label>
        <button type="submit" className="min-h-12 self-end rounded-xl bg-slate-900 px-4 font-bold text-white">{t('applyFilters')}</button>
      </form>

      <p className="mt-4 text-sm text-muted" aria-live="polite">{t('alertCount', { count: result.total })}</p>
      <div className="mt-3 space-y-3" aria-live="polite">
        {loading && <p className="rounded-xl bg-white p-5 text-muted" role="status">{t('loadingAlerts')}</p>}
        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => load()} className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold">{t('tryAgain')}</button>
          </div>
        )}
        {!loading && !error && result.items.length === 0 && (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <CheckCheck className="mx-auto text-green-800" size={32} aria-hidden="true" />
            <p className="mt-3 font-bold">{t('noAlerts')}</p>
          </div>
        )}
        {!loading && !error && result.items.map((alert) => {
          const patientName = alert.patient?.user?.name ?? alert.patient?.name ?? t('patient')
          const message = alert.message?.[i18n.language] ?? alert.message?.en ?? ''
          const createdAt = new Intl.DateTimeFormat(getLocale(i18n.language), { dateStyle: 'medium', timeStyle: 'short' })
            .format(new Date(alert.createdAt))
          return (
            <article key={alert._id} className={`rounded-2xl border border-border border-l-4 p-4 shadow-sm ${severityStyles[alert.severity] ?? 'bg-white'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-1 shrink-0" size={22} aria-hidden="true" />
                  <div>
                    <h2 className="font-extrabold">{patientName}{alert.patient?.village ? ` · ${alert.patient.village}` : ''}</h2>
                    <p className="mt-1 leading-6">{message}</p>
                    <p className="mt-2 text-sm text-slate-700">{createdAt} · {t(`alertStatus_${alert.status}`)} · {t(`alertTypeLabel_${alert.type}`)} · {t(`alertSeverity_${alert.severity}`)}</p>
                    {alert.acknowledgedBy && <p className="mt-1 text-sm text-slate-700">{t('acknowledgedBy')}: {alert.acknowledgedBy.name}</p>}
                    {alert.resolutionNote && <p className="mt-1 text-sm text-slate-700">{t('resolutionNote')}: {alert.resolutionNote}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mayAcknowledge && alert.status === 'open' && (
                    <button type="button" onClick={() => acknowledge(alert)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-3 font-bold">
                      <Check size={17} aria-hidden="true" />{t('acknowledge')}
                    </button>
                  )}
                  {mayResolve && alert.status !== 'resolved' && (
                    <button type="button" onClick={() => setResolutionId((current) => current === alert._id ? '' : alert._id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-3 font-bold">
                      <CheckCheck size={17} aria-hidden="true" />{t('resolve')}
                    </button>
                  )}
                </div>
              </div>
              {mayResolve && resolutionId === alert._id && (
                <form onSubmit={(event) => resolve(event, alert)} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="grid gap-1 text-sm font-semibold">{t('resolutionNote')}
                    <input name="resolutionNote" required minLength={3} maxLength={1000} className="min-h-11 rounded-xl border border-border bg-white px-3" />
                  </label>
                  <button type="submit" className="min-h-11 self-end rounded-xl bg-brand px-4 font-bold text-white">{t('confirmResolution')}</button>
                </form>
              )}
            </article>
          )
        })}
      </div>
      {!loading && !error && result.total > limit && (
        <div className="mt-5 flex items-center justify-between">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="min-h-11 rounded-xl border border-border bg-white px-4 font-semibold disabled:opacity-50">{t('previous')}</button>
          <span className="text-sm text-muted">{t('pageNumber', { page })}</span>
          <button type="button" disabled={!result.hasMore} onClick={() => setPage((current) => current + 1)} className="min-h-11 rounded-xl border border-border bg-white px-4 font-semibold disabled:opacity-50">{t('next')}</button>
        </div>
      )}
    </section>
  )
}
