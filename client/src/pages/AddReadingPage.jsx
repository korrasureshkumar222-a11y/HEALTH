import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { Activity, CheckCircle2, Droplet, HeartPulse, Plus, Scale, Wind } from 'lucide-react'
import toast from 'react-hot-toast'
import { createReading } from '../api/readings.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../context/useAuth.js'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import { cacheReading, queueReading } from '../offline/readingQueue.js'
import { requestBackgroundSync, syncPendingItems } from '../offline/syncManager.js'
import { previewReadingStatus } from '../offline/readingQueue.js'
import { useTranslation } from 'react-i18next'

const measurementTypes = [
  { id: 'bp', labelKey: 'bloodPressure', icon: Activity },
  { id: 'sugar', labelKey: 'bloodSugar', icon: Droplet },
  { id: 'heartRate', labelKey: 'heartRate', icon: HeartPulse },
  { id: 'weight', labelKey: 'weight', icon: Scale },
  { id: 'spo2', labelKey: 'oxygenLevel', icon: Wind },
]

function localDateTimeValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function PreviewStatus({ status, t }) {
  const styleByStatus = {
    normal: 'border-green-300 bg-green-50 text-green-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-950',
    critical: 'border-red-300 bg-red-50 text-red-900',
    unclassified: 'border-slate-300 bg-slate-50 text-slate-800',
  }
  const labelByStatus = {
    normal: t('readingPreviewNormal'),
    warning: t('readingPreviewWarning'),
    critical: t('readingPreviewCritical'),
    unclassified: t('readingPreviewUnclassified'),
  }
  return (
    <div className={`rounded-xl border p-4 ${styleByStatus[status]}`} role="status" aria-live="polite">
      <p className="font-bold">{labelByStatus[status]}</p>
      <p className="mt-1 text-sm">{t('readingPreviewDisclaimer')}</p>
    </div>
  )
}

function NumericField({ label, unit, error, register, name, min = 0, max, step = 1, required, t }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-ink">
      {label}
      <span className="flex min-h-16 items-center rounded-2xl border border-border bg-white focus-within:border-brand focus-within:ring-2 focus-within:ring-blue-100">
        <input
          id={name}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          aria-label={`${label} (${unit})`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : undefined}
          className="min-w-0 flex-1 rounded-2xl bg-transparent px-4 py-3 text-2xl font-bold outline-none"
          {...register(name, {
            required: required ? t('measurementRequired') : false,
            valueAsNumber: true,
            min: { value: min, message: t('measurementMinimum', { min }) },
            ...(max === undefined ? {} : { max: { value: max, message: t('measurementMaximum', { max }) } }),
          })}
        />
        <span className="px-4 text-sm font-semibold text-muted">{unit}</span>
      </span>
      {error && <span id={`${name}-error`} className="font-medium text-red-700" role="alert">{error.message}</span>}
    </label>
  )
}

export default function AddReadingPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const [type, setType] = useState('bp')
  const [success, setSuccess] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm({
    shouldUnregister: true,
    defaultValues: {
      recordedAt: localDateTimeValue(),
      sugarContext: 'fasting',
    },
  })
  const values = useWatch({ control })
  const previewStatus = useMemo(() => {
    if (type === 'bp' && Number.isFinite(values.systolic) && Number.isFinite(values.diastolic)) {
      return previewReadingStatus({
        type,
        values: { systolic: values.systolic, diastolic: values.diastolic, unit: 'mmHg' },
      })
    }
    if (type !== 'bp' && Number.isFinite(values.value)) {
      return previewReadingStatus({
        type,
        values: {
          value: values.value,
          unit: { sugar: 'mg/dL', heartRate: 'bpm', weight: 'kg', spo2: '%' }[type],
          ...(type === 'sugar' ? { sugarContext: values.sugarContext } : {}),
        },
      })
    }
    return null
  }, [type, values.systolic, values.diastolic, values.value, values.sugarContext])

  useEffect(() => {
    if (!isOnline || !user?.id) return
    syncPendingItems(user.id)
      .then((result) => {
        if (result.pending) toast.error(t('readingSyncSomeFailed', { count: result.pending }))
      })
      .catch((error) => {
        if (!error.response) return
        toast.error(getApiErrorMessage(error, t('readingSyncFailed')))
      })
  }, [isOnline, user?.id, t])

  const selectedType = measurementTypes.find((item) => item.id === type)
  const Icon = selectedType.icon

  async function submit(valuesToSave) {
    setSubmitting(true)
    const measurementValues = type === 'bp'
      ? { systolic: valuesToSave.systolic, diastolic: valuesToSave.diastolic, unit: 'mmHg' }
      : {
        value: valuesToSave.value,
        unit: { sugar: 'mg/dL', heartRate: 'bpm', weight: 'kg', spo2: '%' }[type],
        ...(type === 'sugar' ? { sugarContext: valuesToSave.sugarContext } : {}),
      }
    const reading = {
      clientId: crypto.randomUUID(),
      type,
      values: measurementValues,
      recordedAt: new Date(valuesToSave.recordedAt).toISOString(),
    }
    let result

    try {
      if (!isOnline) {
        await queueReading(user.id, reading)
        await requestBackgroundSync()
        result = { queued: true, status: previewReadingStatus(reading) }
      } else {
        try {
          const response = await createReading(reading)
          await cacheReading(user.id, response.record)
          result = {
            queued: false,
            status: response.record.status,
            record: response.record,
          }
        } catch (error) {
          if (error.response) throw error
          await queueReading(user.id, reading)
          await requestBackgroundSync()
          result = { queued: true, status: previewReadingStatus(reading) }
        }
      }

      setSuccess(result)
      reset({ recordedAt: localDateTimeValue(), sugarContext: 'fasting' })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('readingSaveFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-border bg-white p-6 text-center shadow-sm sm:p-9">
        <span className={`mx-auto grid size-16 place-items-center rounded-full ${success.queued ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-900'}`}>
          <CheckCircle2 size={34} aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">
          {success.queued ? t('readingSavedOffline') : t('readingSaved')}
        </h1>
        <p className="mt-3 leading-7 text-muted">
          {success.queued ? t('readingQueuedDescription') : t('readingSavedDescription')}
        </p>
        {!success.queued && success.record?.status && (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-muted">
            {t('serverStatus')}: <span className="font-bold capitalize text-ink">{success.record.status}</span>
          </p>
        )}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setSuccess(null)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-bold text-white"
          >
            <Plus size={19} aria-hidden="true" /> {t('addAnotherReading')}
          </button>
          <Link to="/patient/history" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-5 font-bold text-ink">
            {t('viewReadingHistory')}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-3xl">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">{t('readings')}</p>
      <h1 className="text-3xl font-bold tracking-tight text-ink">{t('addReading')}</h1>
      <p className="mt-2 text-base leading-6 text-muted">{t('addReadingDescription')}</p>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5" role="tablist" aria-label={t('measurementType')}>
        {measurementTypes.map(({ id, labelKey, icon: TypeIcon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={type === id}
            onClick={() => setType(id)}
            className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center text-sm font-bold ${
              type === id ? 'border-brand bg-blue-50 text-brand' : 'border-border bg-white text-ink'
            }`}
          >
            <TypeIcon size={23} aria-hidden="true" />
            {t(labelKey)}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(submit)} className="mt-4 grid gap-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white text-brand"><Icon size={22} aria-hidden="true" /></span>
          <div><p className="font-bold text-ink">{t(selectedType.labelKey)}</p><p className="text-sm text-muted">{t('enterMeasurementBelow')}</p></div>
        </div>

        {type === 'bp' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumericField label={t('systolic')} unit="mmHg" name="systolic" max={400} required t={t} register={register} error={errors.systolic} />
            <NumericField label={t('diastolic')} unit="mmHg" name="diastolic" max={300} required t={t} register={register} error={errors.diastolic} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <NumericField
              label={t(selectedType.labelKey)}
              unit={{ sugar: 'mg/dL', heartRate: 'bpm', weight: 'kg', spo2: '%' }[type]}
              name="value"
              min={0}
              max={{ sugar: 100000, heartRate: 300, weight: 500, spo2: 100 }[type]}
              step={type === 'weight' ? 0.1 : 1}
              required
              t={t}
              register={register}
              error={errors.value}
            />
            {type === 'sugar' && (
              <label className="grid gap-2 text-sm font-bold text-ink">
                {t('sugarContext')}
                <select className="min-h-16 rounded-2xl border border-border bg-white px-4 text-base" {...register('sugarContext', { required: t('sugarContextRequired') })}>
                  <option value="fasting">{t('fasting')}</option>
                  <option value="postMeal">{t('postMeal')}</option>
                  <option value="random">{t('random')}</option>
                </select>
                {errors.sugarContext && <span className="font-medium text-red-700">{errors.sugarContext.message}</span>}
              </label>
            )}
          </div>
        )}

        <label className="grid gap-2 text-sm font-bold text-ink">
          {t('recordedAt')}
          <input
            type="datetime-local"
            className="min-h-14 rounded-xl border border-border px-4 text-base"
            {...register('recordedAt', { required: t('recordedAtRequired') })}
          />
          {errors.recordedAt && <span className="font-medium text-red-700">{errors.recordedAt.message}</span>}
        </label>

        {previewStatus && <PreviewStatus status={previewStatus} t={t} />}
        <p className="text-sm leading-6 text-muted">{t('readingDisclaimer')}</p>

        <button type="submit" disabled={submitting} className="min-h-14 rounded-xl bg-brand px-6 text-lg font-bold text-white hover:bg-brand-dark disabled:opacity-60">
          {submitting ? t('savingReading') : t('saveReading')}
        </button>
      </form>
    </section>
  )
}
