import { useCallback, useEffect, useState } from 'react'
import { Clock3, MapPin, Phone, RefreshCw, Stethoscope } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getNearestHealthCentres } from '../api/healthCentres.js'
import { getApiErrorMessage } from '../api/client.js'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import {
  cacheHealthCentres,
  getCachedHealthCentres,
} from '../offline/healthCentreCache.js'
import { formatNumber } from '../utils/formatDate.js'

const resultLimit = 10

function openMapUrl(centre) {
  const [longitude, latitude] = centre.location.coordinates
  const label = encodeURIComponent(centre.name)
  return `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`
}

export default function NearbyCentresPage() {
  const { t, i18n } = useTranslation()
  const isOnline = useOnlineStatus()
  const [position, setPosition] = useState(null)
  const [type, setType] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(() => Boolean(navigator.geolocation))
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState(() => (
    navigator.geolocation ? '' : 'centresLocationUnavailable'
  ))
  const [cachedAt, setCachedAt] = useState(null)
  const [usingCache, setUsingCache] = useState(false)

  const requestLocation = useCallback(() => {
    setLoading(true)
    setError('')
    if (!navigator.geolocation) {
      setError('centresLocationUnavailable')
      setLoading(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setPosition({ lat: coords.latitude, lng: coords.longitude }),
      () => {
        setPosition(null)
        setError('centresLocationDenied')
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setPosition({ lat: coords.latitude, lng: coords.longitude }),
      () => {
        setPosition(null)
        setError('centresLocationDenied')
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [])

  useEffect(() => {
    if (!position) return
    let active = true
    const params = {
      lat: position.lat,
      lng: position.lng,
      limit: resultLimit,
      ...(type ? { type } : {}),
    }

    async function loadCentres() {
      setLoading(true)
      setError('')
      try {
        const result = await getNearestHealthCentres(params)
        if (!active) return
        setItems(result)
        setUsingCache(false)
        setCachedAt(new Date())
        try {
          await cacheHealthCentres(params, result)
        } catch (cacheError) {
          console.warn('Could not cache nearby health-centre results.', cacheError)
        }
      } catch (requestError) {
        try {
          const cached = await getCachedHealthCentres(params)
          if (!active) return
          if (cached) {
            setItems(cached.items)
            setCachedAt(cached.updatedAt)
            setUsingCache(true)
            setError('')
          } else {
            setItems([])
            setError(getApiErrorMessage(requestError, t('centresLoadFailed')))
          }
        } catch (cacheError) {
          if (active) {
            setItems([])
            setError(getApiErrorMessage(cacheError, t('centresLoadFailed')))
          }
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCentres()
    return () => {
      active = false
    }
  }, [position, type, refreshKey, t])

  function distanceText(centre) {
    if (typeof centre.distanceKm === 'number') {
      return t('centresDistanceKm', {
        distance: formatNumber(centre.distanceKm, i18n.resolvedLanguage, { maximumFractionDigits: 1 }),
      })
    }
    return t('centresDistanceMeters', {
      distance: formatNumber(centre.distanceMeters, i18n.resolvedLanguage, { maximumFractionDigits: 0 }),
    })
  }

  return (
    <section className="mx-auto max-w-3xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand">{t('patientHome')}</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">{t('nearbyHealthCentresTitle')}</h1>
          <p className="mt-2 text-muted">{t('centresPageDescription')}</p>
        </div>
        <button
          type="button"
          onClick={() => position ? setRefreshKey((value) => value + 1) : requestLocation()}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-white px-4 font-bold"
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          {t('refreshDashboard')}
        </button>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="centre-type" className="font-bold">{t('centresFilterByType')}</label>
        <select
          id="centre-type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="min-h-12 rounded-xl border border-border bg-white px-3"
        >
          <option value="">{t('centresAllTypes')}</option>
          <option value="PHC">{t('centreTypePHC')}</option>
          <option value="CHC">{t('centreTypeCHC')}</option>
          <option value="districtHospital">{t('centreTypeDistrictHospital')}</option>
          <option value="private">{t('centreTypePrivate')}</option>
        </select>
      </div>

      {!isOnline && (
        <p role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 font-semibold text-amber-950">
          {t('offline')}
        </p>
      )}
      {usingCache && cachedAt && (
        <p role="status" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
          {t('centresCachedAt', { date: new Intl.DateTimeFormat(i18n.resolvedLanguage === 'te' ? 'te-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(cachedAt)) })}
        </p>
      )}

      {loading && (
        <div role="status" className="mt-5 grid min-h-40 place-items-center rounded-2xl border border-border bg-white text-muted">
          {t('loading')}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
          <p className="font-bold">{t('centresLoadFailed')}</p>
          <p className="mt-1 text-sm">{error.startsWith('centresLocation') ? t(error) : error}</p>
          {!position && (
            <button type="button" onClick={requestLocation} className="mt-3 min-h-11 rounded-xl border border-red-300 px-4 font-bold">
              {t('centresEnableLocation')}
            </button>
          )}
        </div>
      )}

      {!loading && !error && !items.length && (
        <div className="mt-5 rounded-2xl border border-border bg-white p-6 text-center">
          <MapPin className="mx-auto text-muted" size={32} aria-hidden="true" />
          <p className="mt-3 font-bold">{t('centresEmpty')}</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="mt-5 grid gap-4">
          {items.map((centre) => (
            <li key={centre._id} className="rounded-2xl border border-border bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-brand">
                  <Stethoscope size={24} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-extrabold">{centre.name}</h2>
                  <p className="mt-1 font-semibold text-brand">{t(`centreType${centre.type === 'districtHospital' ? 'DistrictHospital' : centre.type}`)}</p>
                  <p className="mt-2 text-sm text-muted">{centre.address}</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold">
                    <MapPin size={16} aria-hidden="true" />{distanceText(centre)}
                  </p>
                  {centre.is24x7 && (
                    <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-green-900">
                      <Clock3 size={16} aria-hidden="true" />{t('centresOpen24x7')}
                    </p>
                  )}
                  {centre.services?.length > 0 && (
                    <p className="mt-2 text-sm text-muted">{centre.services.join(' · ')}</p>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {centre.phone ? (
                  <a href={`tel:${centre.phone}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-3 font-bold text-white">
                    <Phone size={18} aria-hidden="true" />{t('call')}
                  </a>
                ) : (
                  <span className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-100 px-3 text-center text-sm font-semibold text-muted">{t('centresPhoneUnavailable')}</span>
                )}
                <a href={openMapUrl(centre)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand px-3 font-bold text-brand">
                  <MapPin size={18} aria-hidden="true" />{t('centresOpenMap')}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
