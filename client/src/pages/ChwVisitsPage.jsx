import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, MapPin, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { getApiErrorMessage } from '../api/client.js'
import { getChwDashboard, listChwVisits, createChwVisit } from '../api/chw.js'
import { useAuth } from '../context/useAuth.js'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import { queueVisit, requestBackgroundSync } from '../offline/syncManager.js'

const checklistItems = [
  ['vitals', 'chwVisitVitals'],
  ['medications', 'chwVisitMedication'],
  ['symptoms', 'chwVisitSymptoms'],
  ['education', 'chwVisitEducation'],
]

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function gpsPosition() {
  if (!navigator.geolocation) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ type: 'Point', coordinates: [coords.longitude, coords.latitude] }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    )
  })
}

export default function ChwVisitsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const online = useOnlineStatus()
  const [dashboard, setDashboard] = useState({ villages: [], patients: [] })
  const [visits, setVisits] = useState([])
  const [date, setDate] = useState(localDateValue())
  const [village, setVillage] = useState('')
  const [patientId, setPatientId] = useState('')
  const [status, setStatus] = useState('completed')
  const [checklist, setChecklist] = useState([])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedPatients = useMemo(() => dashboard.patients.filter((patient) => (
    !village || patient.village.toLocaleLowerCase() === village.toLocaleLowerCase()
  )), [dashboard.patients, village])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [dashboardResult, visitResult] = await Promise.all([
        getChwDashboard(),
        listChwVisits({
          from: new Date(`${date}T00:00:00`).toISOString(),
          to: new Date(`${date}T23:59:59.999`).toISOString(),
          ...(village ? { village } : {}),
        }),
      ])
      setDashboard(dashboardResult)
      setVisits(visitResult.items)
      setError('')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('chwVisitsLoadFailed')))
    } finally {
      setLoading(false)
    }
  }, [date, t, village])

  useEffect(() => {
    load()
  }, [load])

  async function submit(event) {
    event.preventDefault()
    if (!patientId) {
      toast.error(t('chwSelectPatientFirst'))
      return
    }
    setSaving(true)
    try {
      const input = {
        clientId: crypto.randomUUID(),
        patientId,
        date: new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`).toISOString(),
        status,
        checklist,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(status === 'completed' ? { location: await gpsPosition() } : {}),
      }
      if (!online) {
        await queueVisit(user.id, input)
        await requestBackgroundSync()
        toast.success(t('chwVisitQueued'))
      } else {
        await createChwVisit(input)
        toast.success(status === 'planned' ? t('chwVisitPlanned') : t('chwVisitSaved'))
      }
      setNotes('')
      setChecklist([])
      await load()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('chwVisitSaveFailed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-bold uppercase tracking-wide text-brand">{t('chwHomeEyebrow')}</p><h1 className="mt-1 text-3xl font-extrabold">{t('chwVisitPlannerTitle')}</h1><p className="mt-2 text-muted">{t('chwVisitPlannerDescription')}</p></div>
        <button type="button" onClick={() => load()} disabled={loading} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-white px-4 font-bold"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} />{t('refreshDashboard')}</button>
      </header>

      <div className="mt-5 grid gap-4 rounded-2xl border border-border bg-white p-5 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">{t('date')}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-12 rounded-xl border px-3" /></label>
        <label className="grid gap-2 text-sm font-bold">{t('village')}<select value={village} onChange={(event) => { setVillage(event.target.value); setPatientId('') }} className="min-h-12 rounded-xl border px-3"><option value="">{t('chwAllAssignedVillages')}</option>{dashboard.villages.map((item) => <option key={`${item.village}-${item.mandal}`} value={item.village}>{item.village}{item.mandal ? ` · ${item.mandal}` : ''}</option>)}</select></label>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4 rounded-2xl border border-border bg-white p-5">
        <h2 className="text-xl font-extrabold">{t('chwAddVisit')}</h2>
        <label className="grid gap-2 text-sm font-bold">{t('chwSelectPatient')}<select required value={patientId} onChange={(event) => setPatientId(event.target.value)} className="min-h-12 rounded-xl border px-3"><option value="">{t('chwChoosePatient')}</option>{selectedPatients.map((patient) => <option key={patient._id} value={patient._id}>{patient.name} · {patient.village} · {patient.phone}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-bold">{t('chwVisitStatus')}<select value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-12 rounded-xl border px-3"><option value="completed">{t('chwVisitCompleted')}</option><option value="planned">{t('chwVisitPlannedOption')}</option><option value="missed">{t('chwVisitMissed')}</option></select></label>
        <fieldset><legend className="mb-2 text-sm font-bold">{t('chwVisitChecklist')}</legend><div className="grid gap-2 sm:grid-cols-2">{checklistItems.map(([key, label]) => <label key={key} className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3"><input type="checkbox" checked={checklist.includes(key)} onChange={(event) => setChecklist((items) => event.target.checked ? [...items, key] : items.filter((item) => item !== key))} className="size-5 accent-brand" />{t(label)}</label>)}</div></fieldset>
        <label className="grid gap-2 text-sm font-bold">{t('notes')}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows="3" className="rounded-xl border px-3 py-2 font-normal" /></label>
        {status === 'completed' && <p className="flex items-center gap-2 text-sm text-muted"><MapPin size={17} />{t('chwVisitGpsHint')}</p>}
        <button type="submit" disabled={saving || !patientId} className="min-h-14 rounded-xl bg-brand px-4 text-lg font-extrabold text-white disabled:opacity-50">{saving ? t('saving') : online ? t('chwSaveVisit') : t('chwSaveVisitOffline')}</button>
      </form>

      <section className="mt-6 rounded-2xl border border-border bg-white p-5">
        <h2 className="flex items-center gap-2 text-xl font-extrabold"><CalendarDays size={20} />{t('chwVisitChecklistForDate', { date })}</h2>
        {error && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-red-800">{error}</div>}
        {loading ? <p className="mt-4 text-muted">{t('loading')}</p> : selectedPatients.length ? (
          <ul className="mt-3 divide-y divide-border">
            {selectedPatients.map((patient) => {
              const visit = visits.find((item) => String(item.patient?._id ?? item.patient) === String(patient._id))
              return (
                <li key={patient._id} className="flex min-h-16 items-center justify-between gap-3 py-3">
                  <div><p className="font-bold">{patient.name}</p><p className="text-sm text-muted">{patient.village} · {patient.phone}</p></div>
                  {visit ? <span className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-bold ${visit.status === 'completed' ? 'bg-green-100 text-green-900' : visit.status === 'missed' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-950'}`}><Check size={16} />{t(`chwVisitStatus${visit.status[0].toUpperCase()}${visit.status.slice(1)}`)}</span>
                    : <button type="button" onClick={() => setPatientId(patient._id)} className="min-h-11 rounded-lg border border-brand px-3 font-bold text-brand">{t('chwPlanVisit')}</button>}
                </li>
              )
            })}
          </ul>
        ) : <div className="mt-4 rounded-xl bg-slate-50 p-5 text-center text-muted">{t('chwNoVillagePatients')}</div>}
      </section>
    </section>
  )
}
