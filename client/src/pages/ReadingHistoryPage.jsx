import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../api/client.js'
import { getMyReadingSeries, listMyReadings } from '../api/readings.js'
import { HealthChartPanel } from '../components/HealthCharts.jsx'
import { ListSkeleton } from '../components/LoadingSkeleton.jsx'
import { useAuth } from '../context/useAuth.js'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import {
  cacheReading,
  getCachedReadings,
  getPendingReadingCount,
} from '../offline/readingQueue.js'
import { triggerSync } from '../offline/syncManager.js'
import { useTranslation } from 'react-i18next'
import { formatDateTime, formatNumber } from '../utils/formatDate.js'

const statusClasses = {
  normal: 'bg-green-100 text-green-900',
  warning: 'bg-amber-100 text-amber-950',
  critical: 'bg-red-100 text-red-900',
  unclassified: 'bg-slate-100 text-slate-800',
}

function formatReadingValue(reading, language) {
  if (reading.type === 'bp') {
    return `${formatNumber(reading.values?.systolic, language)}/${formatNumber(reading.values?.diastolic, language)} ${reading.values?.unit ?? 'mmHg'}`
  }
  return `${formatNumber(reading.values?.value, language)} ${reading.values?.unit ?? ''}`
}

function readingStatusLabel(reading, t) {
  const keyByStatus = reading._offline
    ? {
      normal: 'readingPreviewNormal',
      warning: 'readingPreviewWarning',
      critical: 'readingPreviewCritical',
      unclassified: 'readingPreviewUnclassified',
    }
    : {
      normal: 'serverNormal',
      warning: 'serverWarning',
      critical: 'serverCritical',
      unclassified: 'serverUnclassified',
    }
  return t(keyByStatus[reading.status] ?? 'serverUnclassified')
}

function localDateFilter(value, endOfDay = false) {
  if (!value) return undefined
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
  return date.toISOString()
}

function matchesFilters(reading, filters) {
  return (!filters.type || reading.type === filters.type)
    && (!filters.status || reading.status === filters.status)
    && (!filters.from || new Date(reading.recordedAt) >= new Date(`${filters.from}T00:00:00`))
    && (!filters.to || new Date(reading.recordedAt) <= new Date(`${filters.to}T23:59:59.999`))
}

export default function ReadingHistoryPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [filters, setFilters] = useState({ type: '', status: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [readings, setReadings] = useState([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [chartType, setChartType] = useState('bp')
  const [chartRange, setChartRange] = useState('30d')
  const [chartSeries, setChartSeries] = useState(null)
  const [chartLoading, setChartLoading] = useState(true)
  const [chartError, setChartError] = useState('')
  const chartRequestId = useRef(0)
  const limit = 20

  const loadReadings = useCallback(async () => {
    if (isOnline) {
      try {
        const result = await listMyReadings({
          page,
          limit,
          type: filters.type || undefined,
          status: filters.status || undefined,
          from: localDateFilter(filters.from),
          to: localDateFilter(filters.to, true),
        })
        await Promise.all(result.items.map((reading) => cacheReading(user.id, reading)))
        const cached = await getCachedReadings(user.id)
        const pending = cached.filter((reading) => reading._offline && matchesFilters(reading, filters))
        setReadings([...result.items, ...pending].sort(
          (left, right) => new Date(right.recordedAt) - new Date(left.recordedAt),
        ))
        setTotal(result.total + pending.length)
        setHasMore(result.hasMore)
      } catch (requestError) {
        if (requestError.response) {
          setError(getApiErrorMessage(requestError, t('historyLoadFailed')))
          return
        }
        const cached = (await getCachedReadings(user.id)).filter((reading) => matchesFilters(reading, filters))
        setReadings(cached.slice((page - 1) * limit, page * limit))
        setTotal(cached.length)
        setHasMore(false)
      }
    } else {
      const cached = await getCachedReadings(user.id)
      const filtered = cached.filter((reading) => matchesFilters(reading, filters))
      setReadings(filtered.slice((page - 1) * limit, page * limit))
      setTotal(filtered.length)
      setHasMore(page * limit < filtered.length)
    }
    const pending = await getPendingReadingCount(user.id)
    setPendingCount(pending)
  }, [filters, isOnline, page, t, user.id])

  const finishLoading = useCallback(() => setLoading(false), [])

  const loadChart = useCallback(async () => {
    const requestId = ++chartRequestId.current
    if (!isOnline) {
      setChartSeries(null)
      setChartError(t('chartOffline'))
      setChartLoading(false)
      return
    }
    setChartLoading(true)
    setChartError('')
    try {
      const result = await getMyReadingSeries({ type: chartType, range: chartRange })
      if (requestId === chartRequestId.current) setChartSeries(result)
    } catch (requestError) {
      if (requestId === chartRequestId.current) {
        setChartSeries(null)
        setChartError(getApiErrorMessage(requestError, t('chartLoadFailed')))
      }
    } finally {
      if (requestId === chartRequestId.current) setChartLoading(false)
    }
  }, [chartRange, chartType, isOnline, t])

  useEffect(() => {
    let active = true
    // This async request updates data state only after reading remote or cached records.
    // eslint-disable-next-line react/set-state-in-effect
    loadReadings()
      .catch((loadError) => {
        if (active) toast.error(getApiErrorMessage(loadError, t('historyLoadFailed')))
      })
      .finally(finishLoading)
    return () => {
      active = false
    }
  }, [finishLoading, loadReadings, reload, t])

  useEffect(() => {
    // Synchronize the chart with connectivity, metric, and range changes.
    // eslint-disable-next-line react/set-state-in-effect
    loadChart()
  }, [loadChart])

  async function syncNow() {
    setError('')
    setLoading(true)
    try {
      const result = await triggerSync(user.id)
      setReload((count) => count + 1)
      if (result.pending) toast.error(t('readingSyncSomeFailed', { count: result.pending }))
      else if (result.synced) toast.success(t('readingSyncComplete', { count: result.synced }))
      else toast(t('noPendingReadings'))
    } catch (syncError) {
      setLoading(false)
      toast.error(getApiErrorMessage(syncError, t('readingSyncFailed')))
    }
  }

  function applyFilters(event) {
    event.preventDefault()
    setError('')
    const values = new FormData(event.currentTarget)
    setFilters({
      type: String(values.get('type') ?? ''),
      status: String(values.get('status') ?? ''),
      from: String(values.get('from') ?? ''),
      to: String(values.get('to') ?? ''),
    })
    setPage(1)
    setLoading(true)
  }

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">{t('readings')}</p>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t('readingHistory')}</h1>
          <p className="mt-2 text-base text-muted">{t('readingHistoryDescription')}</p>
        </div>
        <Link to="/patient/readings/new" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-bold text-white">
          {t('addReading')}
        </Link>
      </div>

      <form onSubmit={applyFilters} className="mt-6 grid gap-3 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-sm font-semibold">
          {t('measurementType')}
          <select name="type" defaultValue={filters.type} className="min-h-12 rounded-xl border border-border px-3">
            <option value="">{t('allTypes')}</option>
            <option value="bp">{t('bloodPressure')}</option>
            <option value="sugar">{t('bloodSugar')}</option>
            <option value="heartRate">{t('heartRate')}</option>
            <option value="weight">{t('weight')}</option>
            <option value="spo2">{t('oxygenLevel')}</option>
            <option value="temperature">{t('temperature')}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t('status')}
          <select name="status" defaultValue={filters.status} className="min-h-12 rounded-xl border border-border px-3">
            <option value="">{t('allStatuses')}</option>
            <option value="normal">{t('readingPreviewNormal')}</option>
            <option value="warning">{t('readingPreviewWarning')}</option>
            <option value="critical">{t('readingPreviewCritical')}</option>
            <option value="unclassified">{t('readingPreviewUnclassified')}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t('fromDate')}
          <input type="date" name="from" defaultValue={filters.from} className="min-h-12 rounded-xl border border-border px-3" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t('toDate')}
          <input type="date" name="to" defaultValue={filters.to} className="min-h-12 rounded-xl border border-border px-3" />
        </label>
        <button type="submit" className="min-h-12 self-end rounded-xl bg-slate-900 px-4 font-bold text-white">{t('applyFilters')}</button>
      </form>

      <section className="mt-5 rounded-2xl border border-border bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">{t('readingTrends')}</h2>
            <p className="text-sm text-muted">{t('trendDisclaimer')}</p>
          </div>
          <label className="grid gap-1 text-sm font-semibold">{t('measurementType')}
            <select value={chartType} onChange={(event) => setChartType(event.target.value)} className="min-h-11 rounded-xl border border-border px-3">
              <option value="bp">{t('bloodPressure')}</option>
              <option value="sugar">{t('bloodSugar')}</option>
              <option value="heartRate">{t('heartRate')}</option>
              <option value="weight">{t('weight')}</option>
              <option value="spo2">{t('oxygenLevel')}</option>
              <option value="temperature">{t('temperature')}</option>
            </select>
          </label>
        </div>
        <HealthChartPanel
          type={chartType}
          points={chartSeries?.points}
          summary={chartSeries?.summary}
          range={chartRange}
          onRangeChange={setChartRange}
          loading={chartLoading}
          error={chartError}
          locale={i18n.language}
          labels={{
            range: t('chartRange'),
            '7d': t('last7Days'),
            '30d': t('last30Days'),
            '90d': t('last90Days'),
            loading: t('loadingChart'),
            empty: t('noChartReadings'),
            chartDescription: t('chartDataDescription'),
            dataTableCaption: t('chartDataTable'),
            date: t('date'),
            average: t('average'),
            averageShort: t('averageShort'),
            highest: t('highest'),
            lowest: t('lowest'),
            min: t('minimumShort'),
            max: t('maximumShort'),
            percentInRange: t('percentInRange'),
            readingCount: t('chartReadingsCount'),
            dailyCount: t('dailyReadingCount'),
            notAvailable: t('notAvailable'),
            referenceDisclaimer: t('chartReferenceDisclaimer'),
            value: t(chartType === 'sugar' ? 'bloodSugar' : chartType === 'heartRate' ? 'heartRate' : chartType === 'spo2' ? 'oxygenLevel' : chartType === 'temperature' ? 'temperature' : 'weight'),
            systolic: t('systolic'),
            diastolic: t('diastolic'),
          }}
        />
      </section>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-live="polite">
        <p className="text-sm text-muted">{t('readingCount', { count: total })}</p>
        {pendingCount > 0 && (
          <button type="button" disabled={!isOnline} onClick={syncNow} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 font-bold text-amber-950 disabled:opacity-60">
            <RefreshCw size={17} aria-hidden="true" /> {t('pendingReadings', { count: pendingCount })}
          </button>
        )}
      </div>

      <div className="mt-3" aria-live="polite">
        {loading && <ListSkeleton label={t('loadingReadings')} rows={5} />}
        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => { setError(''); setLoading(true); setReload((count) => count + 1) }} className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold">{t('tryAgain')}</button>
          </div>
        )}
        {!loading && !error && readings.length === 0 && (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <h2 className="text-lg font-bold text-ink">{t('noReadings')}</h2>
            <p className="mt-2 text-muted">{t('noReadingsDescription')}</p>
            <Link to="/patient/readings/new" className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-bold text-white">{t('addReading')}</Link>
          </div>
        )}
        {!loading && !error && readings.length > 0 && (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-border bg-white shadow-sm md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                  <tr><th className="px-5 py-4">{t('dateAndTime')}</th><th className="px-5 py-4">{t('measurementType')}</th><th className="px-5 py-4">{t('value')}</th><th className="px-5 py-4">{t('status')}</th><th className="px-5 py-4">{t('syncStatus')}</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {readings.map((reading) => (
                    <tr key={reading._id ?? reading.id}>
                      <td className="px-5 py-4">{formatDateTime(reading.recordedAt, i18n.language)}</td>
                      <td className="px-5 py-4 font-semibold capitalize">{t(({ bp: 'bloodPressure', sugar: 'bloodSugar', heartRate: 'heartRate', weight: 'weight', spo2: 'oxygenLevel' })[reading.type] ?? reading.type)}</td>
                      <td className="px-5 py-4">{formatReadingValue(reading, i18n.language)}</td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClasses[reading.status] ?? statusClasses.unclassified}`}>{readingStatusLabel(reading, t)}</span></td>
                      <td className="px-5 py-4">{reading._offline ? t('queuedOffline') : t('synced')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:hidden">
              {readings.map((reading) => (
                <article key={reading._id ?? reading.id} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-bold capitalize text-ink">{t(({ bp: 'bloodPressure', sugar: 'bloodSugar', heartRate: 'heartRate', weight: 'weight', spo2: 'oxygenLevel' })[reading.type] ?? reading.type)}</h2><p className="mt-1 text-lg font-bold">{formatReadingValue(reading, i18n.language)}</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses[reading.status] ?? statusClasses.unclassified}`}>{readingStatusLabel(reading, t)}</span>
                  </div>
                  <p className="mt-3 text-sm text-muted">{formatDateTime(reading.recordedAt, i18n.language)}</p>
                  {reading._offline && <p className="mt-2 text-xs font-semibold text-amber-900">{t('queuedOffline')}</p>}
                </article>
              ))}
            </div>
            {isOnline && (
              <div className="mt-5 flex items-center justify-between">
                <button type="button" disabled={page <= 1} onClick={() => { setError(''); setLoading(true); setPage((current) => current - 1) }} className="min-h-11 rounded-xl border border-border bg-white px-4 font-semibold disabled:opacity-50">{t('previous')}</button>
                <span className="text-sm text-muted">{t('pageNumber', { page })}</span>
                <button type="button" disabled={!hasMore} onClick={() => { setError(''); setLoading(true); setPage((current) => current + 1) }} className="min-h-11 rounded-xl border border-border bg-white px-4 font-semibold disabled:opacity-50">{t('next')}</button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
