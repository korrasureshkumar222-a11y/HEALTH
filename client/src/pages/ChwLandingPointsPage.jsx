import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { useAuth } from '../context/useAuth.js'
import { createLandingPoint, listLandingPoints, updateLandingChecklist } from '../api/drone.js'
import { getApiErrorMessage } from '../api/client.js'
import LandingPointForm from '../components/LandingPointForm.jsx'
import LandingPointPhotos from '../components/LandingPointPhotos.jsx'
import { formatDateTime } from '../utils/formatDate.js'

const checklistItems = [
  ['clearArea', 'droneChecklistClearArea'],
  ['minimumAreaConfirmed', 'droneChecklistMinimumArea'],
  ['noOverheadWiresOrTrees', 'droneChecklistNoObstructions'],
  ['awayFromCrowds', 'droneChecklistAwayFromCrowds'],
  ['contactAvailable', 'droneChecklistContactAvailable'],
]

export default function ChwLandingPointsPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const [points, setPoints] = useState([])
  const [villages, setVillages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [checklists, setChecklists] = useState({})
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const result = await listLandingPoints({ page: 1, limit: 100, includeInactive: true })
      setPoints(result.items)
      setVillages(result.assignedVillages ?? [])
      setChecklists(Object.fromEntries(result.items.map((point) => [point._id, point.checklist ?? {}])))
      setNow(Date.now())
      setError('')
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t('droneLoadFailed')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function submitLandingPoint(input) {
    try {
      await createLandingPoint(input)
      toast.success(t('droneLandingPointSubmitted'))
      await load()
      return true
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError, t('droneLandingPointSaveFailed')))
      return false
    }
  }

  async function saveChecklist(point) {
    setBusy(point._id)
    try {
      await updateLandingChecklist(point._id, checklists[point._id])
      toast.success(t('chwChecklistSaved'))
      await load()
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError, t('droneLandingPointSaveFailed')))
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">{t('chwHomeEyebrow')}</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">{t('chwLandingPointsTitle')}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t('chwLandingPointsDescription')}</p>
        </div>
        <button type="button" onClick={load} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-white px-4 font-bold">
          <RefreshCw size={18} aria-hidden="true" />{t('refreshDashboard')}
        </button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-900">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-xl font-extrabold">{t('chwSubmittedLandingPoints')}</h2>
          {loading && <p role="status" className="mt-4">{t('loading')}</p>}
          {!loading && points.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-muted">{t('droneNoLandingPoints')}</p>}
          <ul className="mt-3 divide-y divide-border">
            {points.map((point) => {
              const overdue = point.reverifyAt && new Date(point.reverifyAt).getTime() <= now
              return (
                <li key={point._id} className="py-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold">{point.name} · {point.village}</p>
                      <p className="mt-1 text-sm font-semibold">
                        {point.verifiedAt ? t('droneVerifiedAt', { date: formatDateTime(point.verifiedAt, i18n.resolvedLanguage) }) : t('chwAwaitingAdminVerification')}
                      </p>
                      <p className={`mt-1 text-sm ${overdue ? 'font-bold text-red-800' : 'text-muted'}`}>
                        {point.reverifyAt
                          ? t(overdue ? 'droneReverificationOverdue' : 'droneReverifyAt', { date: formatDateTime(point.reverifyAt, i18n.resolvedLanguage) })
                          : t('droneUnverified')}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${point.isActive ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900'}`}>
                      {t(point.isActive ? 'dronePointActive' : 'chwPendingVerification')}
                    </span>
                  </div>
                  <LandingPointPhotos point={point} />
                  <details className="mt-3 rounded-lg bg-slate-50 p-3">
                    <summary className="cursor-pointer font-bold">{t('droneSiteChecklist')}</summary>
                    <div className="mt-2 grid gap-2">
                      {checklistItems.map(([key, label]) => (
                        <label key={key} className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                          <input
                            type="checkbox"
                            checked={Boolean(checklists[point._id]?.[key])}
                            disabled={busy === point._id}
                            onChange={(event) => setChecklists((previous) => ({
                              ...previous,
                              [point._id]: { ...previous[point._id], [key]: event.target.checked },
                            }))}
                            className="size-5 accent-green-700"
                          />
                          {t(label)}
                        </label>
                      ))}
                    </div>
                    {point.submittedBy === user.id
                      ? (
                        <button type="button" disabled={busy === point._id} onClick={() => saveChecklist(point)} className="mt-3 min-h-11 rounded-lg border border-brand px-3 font-bold text-brand disabled:opacity-50">
                          {busy === point._id ? t('saving') : t('chwSaveChecklist')}
                        </button>
                      )
                      : <p className="mt-3 text-sm text-muted">{t('chwChecklistAdminOnly')}</p>}
                  </details>
                </li>
              )
            })}
          </ul>
        </section>

        <LandingPointForm onSubmit={submitLandingPoint} assignedVillages={villages} />
      </div>
    </section>
  )
}
