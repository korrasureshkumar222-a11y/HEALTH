import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { Camera, CheckCircle2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { listPatients } from '../api/patients.js'
import { createReading } from '../api/readings.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../context/useAuth.js'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import { listCachedPatients } from '../offline/patientCache.js'
import { queueReading } from '../offline/readingQueue.js'
import { requestBackgroundSync } from '../offline/syncManager.js'
import { useTranslation } from 'react-i18next'

const types = [
  { value: 'bp', label: 'bloodPressure' },
  { value: 'sugar', label: 'bloodSugar' },
  { value: 'heartRate', label: 'heartRate' },
  { value: 'weight', label: 'weight' },
  { value: 'spo2', label: 'oxygenLevel' },
]

function timeNow() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function ChwQuickReadingPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const online = useOnlineStatus()
  const [searchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState([])
  const [selected, setSelected] = useState(null)
  const [type, setType] = useState('bp')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedOffline, setSavedOffline] = useState(false)
  const [scannerActive, setScannerActive] = useState(false)
  const videoRef = useRef(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { recordedAt: timeNow(), sugarContext: 'fasting' },
  })

  useEffect(() => {
    const requestedPatient = searchParams.get('patientId')
    if (!requestedPatient) return
    const loadPatient = online
      ? listPatients({ search: requestedPatient, limit: 10 }).then((result) => result.items.find((item) => item._id === requestedPatient))
      : listCachedPatients(user.id).then((items) => items.find((item) => item._id === requestedPatient))
    loadPatient
      .then((result) => {
        const patient = result
        if (patient) {
          setSelected(patient)
          setQuery(`${patient.name} · ${patient.phone}`)
        }
      })
      .catch((error) => console.error('Could not load the requested patient for a quick reading.', error))
  }, [online, searchParams, user.id])

  useEffect(() => {
    if (query.trim().length < 2 || selected) {
      setPatients([])
      return undefined
    }
    let active = true
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        if (online) {
          const result = await listPatients({ search: query.trim(), limit: 10 })
          if (active) setPatients(result.items)
        } else {
          const cached = await listCachedPatients(user.id)
          const needle = query.trim().toLocaleLowerCase()
          if (active) setPatients(cached.filter((patient) => (
            [patient.name, patient.phone, patient.village].some((value) => String(value ?? '').toLocaleLowerCase().includes(needle))
          )))
        }
      } catch (error) {
        if (active) toast.error(getApiErrorMessage(error, t('chwPatientSearchFailed')))
      } finally {
        if (active) setSearching(false)
      }
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [online, query, selected, t, user.id])

  useEffect(() => {
    if (!scannerActive) return undefined
    let stream
    let active = true
    let frame
    async function scan() {
      try {
        const Detector = globalThis.BarcodeDetector
        if (!Detector) throw new Error(t('chwScannerUnavailable'))
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const detector = new Detector({ formats: ['qr_code', 'code_128', 'ean_13'] })
        const detectNext = async () => {
          if (!active || !videoRef.current) return
          const codes = await detector.detect(videoRef.current)
          if (codes[0]?.rawValue) {
            setQuery(codes[0].rawValue)
            setSelected(null)
            setScannerActive(false)
            return
          }
          frame = requestAnimationFrame(detectNext)
        }
        detectNext()
      } catch (error) {
        toast.error(error.message || t('chwScannerUnavailable'))
        setScannerActive(false)
      }
    }
    scan()
    return () => {
      active = false
      if (frame) cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [scannerActive, t])

  async function submit(values) {
    if (!selected) {
      toast.error(t('chwSelectPatientFirst'))
      return
    }
    const readingValues = type === 'bp'
      ? { systolic: Number(values.systolic), diastolic: Number(values.diastolic), unit: 'mmHg' }
      : {
        value: Number(values.value),
        unit: { sugar: 'mg/dL', heartRate: 'bpm', weight: 'kg', spo2: '%' }[type],
        ...(type === 'sugar' ? { sugarContext: values.sugarContext } : {}),
      }
    const reading = {
      patientId: selected._id,
      clientId: crypto.randomUUID(),
      type,
      values: readingValues,
      recordedAt: new Date(values.recordedAt).toISOString(),
      ...(values.notes ? { notes: values.notes } : {}),
    }
    setSaving(true)
    let queued = false
    try {
      if (!online) {
        await queueReading(user.id, reading)
        await requestBackgroundSync()
        queued = true
      } else {
        try {
          await createReading(reading)
        } catch (error) {
          if (error.response) throw error
          await queueReading(user.id, reading)
          await requestBackgroundSync()
          queued = true
        }
      }
      setSavedOffline(queued)
      toast.success(queued ? t('chwReadingQueued') : t('chwReadingSaved'))
      reset({ recordedAt: timeNow(), sugarContext: 'fasting', notes: '' })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('readingSaveFailed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto max-w-2xl">
      <p className="text-sm font-bold uppercase tracking-wide text-brand">{t('chwHomeEyebrow')}</p>
      <h1 className="mt-1 text-3xl font-extrabold">{t('chwQuickReadingTitle')}</h1>
      <p className="mt-2 text-muted">{t('chwQuickReadingDescription')}</p>

      {savedOffline && <div role="status" className="mt-5 flex items-center gap-2 rounded-xl bg-amber-50 p-4 font-semibold text-amber-950"><CheckCircle2 size={20} />{t('chwReadingQueued')}</div>}
      <div className="mt-5 rounded-2xl border border-border bg-white p-5">
        <label className="grid gap-2 text-sm font-bold">{t('chwSearchScanPatient')}
          <span className="flex min-h-14 items-center gap-2 rounded-xl border border-border px-3">
            <Search size={19} className="text-muted" />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null) }} className="min-w-0 flex-1 outline-none" placeholder={t('chwSearchScanPlaceholder')} />
            {'BarcodeDetector' in globalThis && (
              <button type="button" onClick={() => setScannerActive((value) => !value)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3">
                <Camera size={18} />{t('chwScan')}
              </button>
            )}
          </span>
        </label>
        {scannerActive && <div className="mt-3"><video ref={videoRef} className="max-h-64 w-full rounded-xl bg-black" aria-label={t('chwCameraScanner')} /><button type="button" onClick={() => setScannerActive(false)} className="mt-2 min-h-11 rounded-lg border px-3">{t('cancel')}</button></div>}
        {searching && <p className="mt-3 text-sm text-muted">{t('searching')}</p>}
        {patients.length > 0 && (
          <ul className="mt-2 max-h-60 divide-y overflow-y-auto rounded-xl border border-border">
            {patients.map((patient) => (
              <li key={patient._id}>
                <button type="button" onClick={() => { setSelected(patient); setQuery(`${patient.name} · ${patient.phone}`); setPatients([]) }} className="min-h-14 w-full px-3 text-left hover:bg-slate-50">
                  <span className="font-bold">{patient.name}</span><span className="ml-2 text-sm text-muted">{patient.phone} · {patient.village}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected && <div className="mt-3 flex items-center justify-between rounded-xl bg-green-50 p-3 text-green-950"><span><strong>{selected.name}</strong><br /><span className="text-sm">{selected.village} · {selected.phone}</span></span><button type="button" onClick={() => { setSelected(null); setQuery('') }} className="min-h-10 px-2 underline">{t('change')}</button></div>}

        <form onSubmit={handleSubmit(submit)} className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-bold">{t('readingType')}
            <select value={type} onChange={(event) => { setType(event.target.value); reset({ recordedAt: timeNow(), sugarContext: 'fasting' }) }} className="min-h-14 rounded-xl border border-border px-3 text-lg">
              {types.map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}
            </select>
          </label>
          {type === 'bp' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 font-bold">{t('systolic')} (mmHg)<input type="number" inputMode="decimal" min="1" max="300" step="1" className="min-h-16 rounded-xl border px-4 text-2xl" {...register('systolic', { required: t('measurementRequired'), valueAsNumber: true, min: 1, max: 300 })} />{errors.systolic && <span className="text-sm text-red-700">{errors.systolic.message}</span>}</label>
              <label className="grid gap-2 font-bold">{t('diastolic')} (mmHg)<input type="number" inputMode="decimal" min="1" max="200" step="1" className="min-h-16 rounded-xl border px-4 text-2xl" {...register('diastolic', { required: t('measurementRequired'), valueAsNumber: true, min: 1, max: 200 })} />{errors.diastolic && <span className="text-sm text-red-700">{errors.diastolic.message}</span>}</label>
            </div>
          ) : (
            <label className="grid gap-2 font-bold">{t(types.find((item) => item.value === type).label)}
              <span className="flex min-h-16 items-center rounded-xl border border-border"><input type="number" inputMode="decimal" min="0" step="any" className="min-w-0 flex-1 rounded-xl px-4 text-2xl outline-none" {...register('value', { required: t('measurementRequired'), valueAsNumber: true, min: 0 })} /><span className="px-4 text-sm text-muted">{{ sugar: 'mg/dL', heartRate: 'bpm', weight: 'kg', spo2: '%' }[type]}</span></span>
              {errors.value && <span className="text-sm text-red-700">{errors.value.message}</span>}
            </label>
          )}
          {type === 'sugar' && <label className="grid gap-2 font-bold">{t('sugarContext')}<select className="min-h-12 rounded-xl border px-3" {...register('sugarContext')}><option value="fasting">{t('fasting')}</option><option value="postMeal">{t('postMeal')}</option><option value="random">{t('random')}</option></select></label>}
          <label className="grid gap-2 font-bold">{t('recordedAt')}<input type="datetime-local" className="min-h-12 rounded-xl border px-3" {...register('recordedAt', { required: true })} /></label>
          <label className="grid gap-2 font-bold">{t('notes')}<textarea rows="3" className="rounded-xl border px-3 py-2 font-normal" {...register('notes', { maxLength: 1000 })} /></label>
          <button type="submit" disabled={saving || !selected} className="min-h-14 rounded-xl bg-brand px-4 text-lg font-extrabold text-white disabled:opacity-50">{saving ? t('saving') : online ? t('chwSaveReading') : t('chwSaveOffline')}</button>
        </form>
      </div>
    </section>
  )
}
