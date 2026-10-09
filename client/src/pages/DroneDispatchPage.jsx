import { useCallback, useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import { AlertTriangle, Check, MapPin, RefreshCw, ShieldAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import LandingPointForm from '../components/LandingPointForm.jsx'
import LandingPointPhotos from '../components/LandingPointPhotos.jsx'
import {
  abortDroneMission,
  approveDroneMission,
  createLandingPoint,
  listDroneMissions,
  listLandingPoints,
  updateLandingPoint,
  updateDroneMissionStatus,
} from '../api/drone.js'
import { getApiErrorMessage } from '../api/client.js'
import { formatDateTime, formatNumber } from '../utils/formatDate.js'

import 'leaflet/dist/leaflet.css'

const defaultMapCentre = [16.5, 80.6]

const payloadName = {
  medicine: 'dronePayloadMedicine',
  AED: 'dronePayloadAED',
  glucoseKit: 'dronePayloadGlucoseKit',
  firstAid: 'dronePayloadFirstAid',
  other: 'dronePayloadOther',
}

const missionStatusKeys = {
  requested: 'droneStatusRequested',
  approved: 'droneStatusApproved',
  dispatched: 'droneStatusDispatched',
  enRoute: 'droneStatusEnRoute',
  arrived: 'droneStatusArrived',
  delivered: 'droneStatusDelivered',
  aborted: 'droneStatusAborted',
}

function coordinates(point) {
  return [point.location.coordinates[1], point.location.coordinates[0]]
}

export default function DroneDispatchPage() {
  const { t, i18n } = useTranslation()
  const [landingPoints, setLandingPoints] = useState([])
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    try {
      const [pointResult, missionResult] = await Promise.all([
        listLandingPoints({ page: 1, limit: 100, includeInactive: true }),
        listDroneMissions({ page: 1, limit: 100 }),
      ])
      setLandingPoints(pointResult.items)
      setMissions(missionResult.items)
      setNow(Date.now())
      setError('')
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t('droneLoadFailed')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => load(false), 0)
    const timer = window.setInterval(() => load(false), 15_000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
    }
  }, [load])

  async function submitLandingPoint(input) {
    try {
      await createLandingPoint(input)
      toast.success(t('droneLandingPointSaved'))
      await load()
      return true
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError, t('droneLandingPointSaveFailed')))
      return false
    }
  }

  async function updatePoint(point, patch) {
    setBusy(point._id)
    try {
      await updateLandingPoint(point._id, patch)
      await load()
    } catch (updateError) {
      toast.error(getApiErrorMessage(updateError, t('droneLandingPointSaveFailed')))
    } finally {
      setBusy('')
    }
  }

  async function toggleChecklistItem(point, key, checked) {
    await updatePoint(point, {
      checklist: { ...point.checklist, [key]: checked },
    })
  }

  async function approveMission(mission) {
    if (!window.confirm(t('droneConfirmApprove'))) return
    setBusy(mission._id)
    try {
      const result = await approveDroneMission(mission._id)
      if (result.contactSms.status === 'failed') {
        toast.error(t('droneSmsDeliveryFailed'))
      } else {
        toast.success(result.provider.simulated ? t('droneMockDispatched') : t('droneDispatched'))
      }
      await load()
    } catch (approveError) {
      toast.error(getApiErrorMessage(approveError, t('droneApproveFailed')))
    } finally {
      setBusy('')
    }
  }

  async function abortMission(mission) {
    const reason = window.prompt(t('droneAbortReason'))
    if (!reason?.trim()) return
    setBusy(mission._id)
    try {
      await abortDroneMission(mission._id, reason.trim())
      toast.success(t('droneAborted'))
      await load()
    } catch (abortError) {
      toast.error(getApiErrorMessage(abortError, t('droneAbortFailed')))
    } finally {
      setBusy('')
    }
  }

  async function advanceMission(mission, status) {
    setBusy(mission._id)
    try {
      await updateDroneMissionStatus(mission._id, { status })
      await load()
    } catch (updateError) {
      toast.error(getApiErrorMessage(updateError, t('droneStatusUpdateFailed')))
    } finally {
      setBusy('')
    }
  }

  const mapCentre = landingPoints.length ? coordinates(landingPoints[0]) : defaultMapCentre

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">{t('droneAdminEyebrow')}</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">{t('droneAdminTitle')}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{t('droneSafetyNotice')}</p>
        </div>
        <button type="button" onClick={() => load(false)} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-white px-4 font-bold">
          <RefreshCw size={18} aria-hidden="true" />{t('refreshDashboard')}
        </button>
      </header>

      <div className="rounded-2xl border border-amber-400 bg-amber-50 p-4 text-amber-950" role="note">
        <p className="flex items-center gap-2 font-extrabold"><ShieldAlert size={20} aria-hidden="true" />{t('droneSimulationNotice')}</p>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-900">{error}</p>}

      <section className="grid gap-5 lg:grid-cols-[1.4fr,0.8fr]">
        <article className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="p-4">
            <h2 className="text-xl font-extrabold">{t('droneLandingMap')}</h2>
            <p className="mt-1 text-sm text-muted">{t('droneLandingMapDescription')}</p>
          </div>
          <MapContainer center={mapCentre} zoom={9} scrollWheelZoom={false} className="h-[360px] w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {landingPoints.map((point) => (
              <CircleMarker
                key={point._id}
                center={coordinates(point)}
                radius={point.noFly ? 10 : 8}
                pathOptions={{
                  color: point.noFly ? '#b91c1c' : point.isActive ? '#15803d' : '#b45309',
                  fillOpacity: 0.8,
                }}
              >
                <Popup>
                  <strong>{point.name}</strong><br />
                  {point.village}<br />
                  {point.noFly ? t('droneNoFly') : point.isActive ? t('dronePointActive') : t('dronePointInactive')}
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
          <ul className="divide-y divide-border">
            {landingPoints.map((point) => (
              <li key={point._id} className="flex flex-wrap items-center gap-3 p-4">
                <MapPin size={19} aria-hidden="true" className={point.noFly ? 'text-red-700' : point.isActive ? 'text-green-700' : 'text-amber-700'} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{point.name} · {point.village}</p>
                  <p className="text-sm text-muted">
                    {point.verifiedAt ? t('droneVerifiedAt', { date: formatDateTime(point.verifiedAt, i18n.resolvedLanguage) }) : t('droneUnverified')}
                    {point.noFly ? ` · ${t('droneNoFly')}` : ''}
                    {point.reverifyAt ? ` · ${t(new Date(point.reverifyAt).getTime() <= now ? 'droneReverificationOverdue' : 'droneReverifyAt', { date: formatDateTime(point.reverifyAt, i18n.resolvedLanguage) })}` : ''}
                  </p>
                  <LandingPointPhotos point={point} />
                </div>
                {point.noFly ? (
                  <button type="button" disabled={busy === point._id} onClick={() => updatePoint(point, { noFly: false })} className="min-h-11 rounded-lg border border-border px-3 font-bold">{t('droneClearNoFly')}</button>
                ) : (
                  <button type="button" disabled={busy === point._id} onClick={() => updatePoint(point, { noFly: true })} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-300 px-3 font-bold text-red-800"><AlertTriangle size={16} aria-hidden="true" />{t('droneMarkNoFly')}</button>
                )}
                {!point.verifiedAt || !point.reverifyAt || new Date(point.reverifyAt).getTime() <= now ? (
                  <button type="button" disabled={busy === point._id || !Object.values(point.checklist ?? {}).every(Boolean)} onClick={() => updatePoint(point, { verified: true })} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-3 font-bold text-white disabled:opacity-50"><Check size={16} aria-hidden="true" />{t('droneVerify')}</button>
                ) : (
                  <button type="button" disabled={busy === point._id || point.noFly || !point.reverifyAt || new Date(point.reverifyAt).getTime() <= now} onClick={() => updatePoint(point, { isActive: !point.isActive })} className="min-h-11 rounded-lg border border-border px-3 font-bold">
                    {point.isActive ? t('droneDeactivate') : t('droneActivate')}
                  </button>
                )}
                <details className="basis-full rounded-lg bg-slate-50 p-3">
                  <summary className="cursor-pointer font-bold">{t('droneSiteChecklist')}</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {[
                      ['clearArea', 'droneChecklistClearArea'],
                      ['minimumAreaConfirmed', 'droneChecklistMinimumArea'],
                      ['noOverheadWiresOrTrees', 'droneChecklistNoObstructions'],
                      ['awayFromCrowds', 'droneChecklistAwayFromCrowds'],
                      ['contactAvailable', 'droneChecklistContactAvailable'],
                    ].map(([key, label]) => (
                      <label key={key} className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={Boolean(point.checklist?.[key])}
                          disabled={busy === point._id}
                          onChange={(event) => toggleChecklistItem(point, key, event.target.checked)}
                          className="size-5 accent-green-700"
                        />
                        {t(label)}
                      </label>
                    ))}
                  </div>
                </details>
              </li>
            ))}
            {!loading && landingPoints.length === 0 && <li className="p-4 text-muted">{t('droneNoLandingPoints')}</li>}
          </ul>
        </article>

        <LandingPointForm onSubmit={submitLandingPoint} />
      </section>

      <section className="rounded-2xl border border-border bg-white p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">{t('droneMissionsTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('dronePollingStatus')}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold">{formatNumber(missions.length, i18n.resolvedLanguage)}</span>
        </header>
        {loading && <p role="status" className="mt-4">{t('loading')}</p>}
        {!loading && missions.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-4 text-muted">{t('droneNoMissions')}</p>}
        <ul className="mt-4 divide-y divide-border">
          {missions.map((mission) => (
            <li key={mission._id} className="py-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{mission.patient?.name ?? t('patient')} · {mission.landingPoint?.name}</p>
                  <p className="mt-1 text-sm text-muted">{t('droneMissionPayload', { payload: mission.payload.map((item) => t(payloadName[item])).join(', ') })}</p>
                  <p className="mt-1 text-sm text-muted">{t('droneMissionDistanceEta', {
                    distance: formatNumber(mission.distanceKm, i18n.resolvedLanguage, { maximumFractionDigits: 1 }),
                    eta: formatDateTime(mission.eta, i18n.resolvedLanguage),
                  })}</p>
                  <p className="mt-1 text-sm font-bold">{t(missionStatusKeys[mission.status])}
                    {mission.provider === 'mock' ? ` · ${t('droneSimulated')}` : ''}
                  </p>
                  <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    {mission.timeline.map((entry, index) => <li key={`${entry.status}-${index}`}>{t(missionStatusKeys[entry.status])}: {formatDateTime(entry.at, i18n.resolvedLanguage)}</li>)}
                  </ol>
                </div>
                <div className="flex gap-2">
                  {['requested', 'approved'].includes(mission.status) && (
                    <button type="button" disabled={Boolean(busy)} onClick={() => approveMission(mission)} className="min-h-11 rounded-lg bg-green-800 px-3 font-bold text-white">{t('droneApproveDispatch')}</button>
                  )}
                  {mission.status === 'dispatched' && <button type="button" disabled={Boolean(busy)} onClick={() => advanceMission(mission, 'enRoute')} className="min-h-11 rounded-lg border border-border px-3 font-bold">{t('droneMarkEnRoute')}</button>}
                  {mission.status === 'enRoute' && <button type="button" disabled={Boolean(busy)} onClick={() => advanceMission(mission, 'arrived')} className="min-h-11 rounded-lg border border-border px-3 font-bold">{t('droneMarkArrived')}</button>}
                  {mission.status === 'arrived' && <button type="button" disabled={Boolean(busy)} onClick={() => advanceMission(mission, 'delivered')} className="min-h-11 rounded-lg border border-border px-3 font-bold">{t('droneMarkDelivered')}</button>}
                  {!['aborted', 'delivered'].includes(mission.status) && (
                    <button type="button" disabled={Boolean(busy)} onClick={() => abortMission(mission)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-300 px-3 font-bold text-red-800"><X size={17} aria-hidden="true" />{t('droneAbort')}</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
