import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Clock3, MapPin, Phone, Send, Siren } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createSos, getSosIncident } from '../api/sos.js'
import { listDroneMissions, requestDroneMission } from '../api/drone.js'
import { getApiErrorMessage } from '../api/client.js'
import { getOwnPatient } from '../api/patients.js'
import { useAuth } from '../context/useAuth.js'
import { formatDateTime, formatNumber } from '../utils/formatDate.js'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import {
  cacheEmergencyPhones,
  cacheSos,
  getCachedEmergencyPhones,
  getCachedSosLocation,
  getLatestSos,
  queueSos,
} from '../offline/sosQueue.js'
import { requestBackgroundSync, syncPendingItems } from '../offline/syncManager.js'

function getGpsLocation() {
  if (!navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        type: 'Point',
        coordinates: [coords.longitude, coords.latitude],
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    )
  })
}

function smsUri(sms) {
  if (!sms) return null
  const recipients = sms.recipients?.join(',') ?? ''
  return `sms:${recipients}?body=${encodeURIComponent(sms.body)}`
}

export default function SosPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [incident, setIncident] = useState(null)
  const [droneMission, setDroneMission] = useState(null)
  const [centres, setCentres] = useState([])
  const [countdown, setCountdown] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [smsLink, setSmsLink] = useState('')
  const cachedPhones = useRef([])
  const holdTimer = useRef(null)
  const syncing = useRef(false)

  const refreshIncident = useCallback(async () => {
    const localIncident = await getLatestSos(user.id)
    if (localIncident) {
      setIncident(localIncident)
      setCentres(localIncident.nearestHealthCentres ?? [])
      setSmsLink(smsUri(localIncident.emergencySms))
      if (localIncident.localOnly) setError(t('sosPendingSync'))
      if (localIncident._id && isOnline) {
        try {
          const response = await getSosIncident(localIncident._id)
          const latest = { ...localIncident, ...response.incident }
          setIncident(latest)
          await cacheSos(user.id, { incident: latest, nearestHealthCentres: localIncident.nearestHealthCentres })
          setError('')
          const missionResult = await listDroneMissions({ page: 1, limit: 100 })
          setDroneMission(missionResult.items.find((mission) => (
            String(mission.sosIncident) === String(localIncident._id)
          )) ?? null)
        } catch (requestError) {
          setError(getApiErrorMessage(requestError, t('sosStatusLoadFailed')))
        }
      }
    }
    setLoading(false)
  }, [isOnline, t, user.id])

  async function requestSuppliesMission() {
    if (!incident?._id || incident.localOnly || !isOnline) return
    setSubmitting(true)
    try {
      const result = await requestDroneMission({
        sosIncident: incident._id,
        payload: ['medicine'],
      })
      setDroneMission(result.mission)
      setError(result.contactSms?.status === 'failed'
        ? t('droneSmsDeliveryFailed')
        : '')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('droneRequestFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    const initialize = async () => {
      const phones = await getCachedEmergencyPhones(user.id)
      cachedPhones.current = phones
      if (isOnline) {
        try {
          const profile = await getOwnPatient()
          const contacts = profile.patient?.emergencyContacts ?? profile.emergencyContacts ?? []
          await cacheEmergencyPhones(user.id, [
            ...contacts,
            { phone: profile.patient?.assignedDoctor?.user?.phone },
            { phone: profile.patient?.assignedChw?.user?.phone },
          ], profile.patient?.location)
          cachedPhones.current = await getCachedEmergencyPhones(user.id)
        } catch {
          if (phones.length === 0) setError(t('sosContactsUnavailable'))
        }
      }
      await refreshIncident()
    }
    initialize().catch((requestError) => {
      setError(getApiErrorMessage(requestError, t('sosStatusLoadFailed')))
      setLoading(false)
    })
  }, [isOnline, refreshIncident, t, user.id])

  useEffect(() => {
    if (!isOnline || syncing.current) return undefined
    syncing.current = true
    syncPendingItems(user.id)
      .then(async ({ synced }) => {
        if (synced > 0) {
          await refreshIncident()
          setError('')
        }
      })
      .catch((syncError) => setError(getApiErrorMessage(syncError, t('sosSyncFailed'))))
      .finally(() => {
        syncing.current = false
      })
    return undefined
  }, [isOnline, refreshIncident, t, user.id])

  const triggerSos = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setError('')
    if (navigator.vibrate) navigator.vibrate([180, 80, 180, 80, 300])
    try {
      const location = await getGpsLocation() ?? await getCachedSosLocation(user.id)
      const request = {
        clientId: crypto.randomUUID(),
        ...(location ? { location } : {}),
      }
      let result
      if (isOnline) {
        try {
          result = await createSos(request)
        } catch (requestError) {
          if (requestError.response && requestError.response.status < 500) throw requestError
          await queueSos(user.id, request)
          await requestBackgroundSync()
          result = {
            incident: {
              clientId: request.clientId,
              status: 'triggered',
              location: request.location,
              timeline: [{ status: 'triggered', at: new Date() }],
              localOnly: true,
              updatedAt: new Date(),
            },
            nearestHealthCentres: [],
            emergencySms: {
              recipients: cachedPhones.current,
              body: request.location
                ? `${t('smsEmergencyPrefix')} ${t('smsLocationLabel')}: https://maps.google.com/?q=${request.location.coordinates[1]},${request.location.coordinates[0]}`
                : `${t('smsEmergencyPrefix')} ${t('smsLocationUnavailable')}`,
            },
          }
        }
      } else {
        await queueSos(user.id, request)
        await requestBackgroundSync()
        const locationText = request.location
          ? `https://maps.google.com/?q=${request.location.coordinates[1]},${request.location.coordinates[0]}`
          : t('smsLocationUnavailable')
        result = {
          incident: {
            clientId: request.clientId,
            status: 'triggered',
            location: request.location,
            timeline: [{ status: 'triggered', at: new Date() }],
            localOnly: true,
            updatedAt: new Date(),
          },
          nearestHealthCentres: [],
          emergencySms: {
            recipients: cachedPhones.current,
            body: `${t('smsEmergencyPrefix')} ${t('smsLocationLabel')}: ${locationText}`,
          },
        }
      }
      setIncident(result.incident)
      setDroneMission(null)
      setCentres(result.nearestHealthCentres ?? [])
      await cacheSos(user.id, result)
      const uri = smsUri(result.emergencySms)
      if (uri) {
        setSmsLink(uri)
        if (!isOnline || result.emergencySms.recipients?.length) window.location.href = uri
      }
      if (result.incident.localOnly) setError(t('sosPendingSync'))
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('sosTriggerFailed')))
    } finally {
      setSubmitting(false)
    }
  }, [isOnline, submitting, t, user.id])

  useEffect(() => {
    if (countdown === null) return undefined
    if (countdown <= 0) {
      // Countdown expiry is the user's explicit confirmation to submit SOS.
      // eslint-disable-next-line react/set-state-in-effect
      setCountdown(null)
      triggerSos()
      return undefined
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown, triggerSos])

  function startHold() {
    if (submitting || countdown !== null || holdTimer.current) return
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      if (navigator.vibrate) navigator.vibrate(120)
      setCountdown(5)
    }, 2000)
  }

  function cancelHold() {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  function cancelCountdown() {
    setCountdown(null)
    if (navigator.vibrate) navigator.vibrate(40)
  }

  const timeline = [...(incident?.timeline ?? [])].sort((left, right) => new Date(left.at) - new Date(right.at))
  const formatDate = (date) => formatDateTime(date, i18n.language)
  const openedAt = timeline.find((item) => item.status === 'triggered')?.at

  return (
    <section className="mx-auto min-h-[calc(100vh-10rem)] max-w-3xl">
      <header className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-red-800 text-white"><Siren size={26} aria-hidden="true" /></span>
          <div>
            <h1 className="text-2xl font-extrabold text-red-950">{t('sosTitle')}</h1>
            <p className="mt-1 leading-6 text-red-950">{t('sosInstructions')}</p>
          </div>
        </div>
        <a href="tel:108" className="mt-4 flex min-h-14 items-center justify-center gap-3 rounded-xl bg-red-800 px-4 text-lg font-extrabold text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-900">
          <Phone size={22} aria-hidden="true" />{t('call108')}
        </a>
      </header>

      <div className="mt-4 rounded-2xl border border-border bg-white p-4 sm:p-6">
        {countdown !== null ? (
          <div className="text-center" role="alert">
            <p className="text-sm font-bold uppercase tracking-wide text-red-800">{t('sosSendingIn')}</p>
            <p className="my-2 text-6xl font-black tabular-nums text-red-800" aria-live="assertive">{formatNumber(countdown, i18n.language)}</p>
            <p className="text-muted">{t('sosCancelHint')}</p>
            <button type="button" onClick={cancelCountdown} className="mt-4 min-h-14 w-full rounded-xl border-2 border-slate-400 bg-white px-5 text-lg font-extrabold text-ink">
              {t('cancelSos')}
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="font-bold text-ink">{t('sosHoldPrompt')}</p>
            <button
              type="button"
              disabled={submitting}
              onPointerDown={startHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
              onKeyDown={(event) => {
                if (['Enter', ' '].includes(event.key) && !event.repeat) startHold()
              }}
              onKeyUp={(event) => {
                if (['Enter', ' '].includes(event.key)) cancelHold()
              }}
              onContextMenu={(event) => event.preventDefault()}
              className="mt-4 flex min-h-28 w-full select-none touch-none flex-col items-center justify-center gap-2 rounded-2xl border-4 border-red-950 bg-red-700 px-5 text-2xl font-black text-white shadow-lg disabled:opacity-60"
              aria-label={t('sosHoldPrompt')}
            >
              <Siren size={36} aria-hidden="true" />
              {submitting ? t('sosSubmitting') : t('holdForHelp')}
            </button>
            <p className="mt-3 text-sm leading-6 text-muted">{isOnline ? t('sosOnlineHint') : t('sosOfflineHint')}</p>
          </div>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 font-semibold text-amber-950" role="status">{error}</p>}
      {loading && <p className="mt-4 rounded-xl bg-white p-4 text-muted" role="status">{t('loadingSosStatus')}</p>}

      {!loading && incident && (
        <section className="mt-4 rounded-2xl border border-border bg-white p-4 sm:p-6" aria-labelledby="sos-status-heading">
          <div className="flex items-center gap-3">
            {incident.status === 'resolved'
              ? <CheckCircle2 className="text-green-800" size={25} aria-hidden="true" />
              : <Clock3 className="text-amber-800" size={25} aria-hidden="true" />}
            <div>
              <h2 id="sos-status-heading" className="text-xl font-extrabold">{t('sosStatusTitle')}</h2>
              <p className="text-sm text-muted">{openedAt ? formatDate(openedAt) : t('sosQueuedOnDevice')}</p>
            </div>
          </div>
          {incident.localOnly && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-950">{t('sosNotServerConfirmed')}</p>}
          {!incident.localOnly && incident._id && incident.status !== 'resolved' && isOnline && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="font-bold text-blue-950">{t('droneSosRequestInfo')}</p>
              {droneMission ? (
                <p className="mt-2 text-sm font-semibold text-blue-950">{t('droneMissionRequestedStatus', { status: t(`droneStatus${droneMission.status[0].toUpperCase()}${droneMission.status.slice(1)}`) })}</p>
              ) : (
                <button type="button" disabled={submitting} onClick={requestSuppliesMission} className="mt-3 min-h-12 w-full rounded-xl bg-brand px-4 font-bold text-white disabled:opacity-60">
                  {submitting ? t('loading') : t('droneRequestSupplies')}
                </button>
              )}
            </div>
          )}
          <ol className="mt-5 space-y-0">
            {timeline.map((event, index) => {
              return (
                <li key={`${event.status}-${event.at}`} className="relative flex min-h-16 gap-3">
                  {index < timeline.length - 1 && <span className="absolute left-[11px] top-6 h-full w-0.5 bg-green-700" aria-hidden="true" />}
                  <span className="relative z-10 mt-1 grid size-6 shrink-0 place-items-center rounded-full border-2 border-green-800 bg-green-800 text-white">
                    <CheckCircle2 size={15} aria-hidden="true" />
                  </span>
                  <div className="pb-4">
                    <p className="font-bold text-ink">{t(`sosStep_${event.status}`)}</p>
                    <p className="mt-0.5 text-sm text-muted">{formatDate(event.at)}{event.note ? ` · ${event.note}` : ''}</p>
                    {['doctorNotified', 'chwNotified'].includes(event.status) && <p className="text-xs text-muted">{t('sosInAppNotice')}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {!loading && incident && smsLink && (
        <a href={smsLink} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 font-bold">
          <Send size={18} aria-hidden="true" />{t('openSmsComposer')}
        </a>
      )}

      {!loading && incident && (
        <section className="mt-4 rounded-2xl border border-border bg-white p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <MapPin size={20} aria-hidden="true" className="text-brand" />
            <h2 className="text-lg font-extrabold">{t('nearestCentres')}</h2>
          </div>
          {centres.length ? (
            <ul className="mt-3 divide-y divide-border">
              {centres.map((centre) => (
                <li key={centre._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-bold">{centre.name}</p>
                    <p className="text-sm text-muted">{centre.address} · {formatNumber(centre.distanceKm, i18n.language, { maximumFractionDigits: 1 })} km</p>
                    {(centre.hasAmbulance || centre.hasDrone) && <p className="mt-1 text-xs font-semibold">{centre.hasAmbulance ? t('ambulanceAvailable') : ''}{centre.hasAmbulance && centre.hasDrone ? ' · ' : ''}{centre.hasDrone ? t('droneAvailable') : ''}</p>}
                  </div>
                  {centre.phone && <a href={`tel:${centre.phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 font-semibold"><Phone size={16} aria-hidden="true" />{t('call')}</a>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm leading-6 text-muted">{incident.localOnly ? t('centresAfterSync') : t('noCentresFound')}</p>}
        </section>
      )}

      {!incident && !loading && (
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-muted">{t('noActiveSos')}</p>
      )}
    </section>
  )
}
