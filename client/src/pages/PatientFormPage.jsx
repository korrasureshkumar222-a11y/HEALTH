import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import toast from 'react-hot-toast'
import { createPatient, getPatient, updatePatient } from '../api/patients.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../context/useAuth.js'
import { useTranslation } from 'react-i18next'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import { queuePatient } from '../offline/syncManager.js'
import { getCachedPatient } from '../offline/patientCache.js'

const villages = ['Mangalagiri', 'Tenali', 'Poranki', 'Gannavaram', 'Tadepalli']
const conditions = ['diabetes', 'hypertension', 'cardiac', 'other']

function Field({ label, error, children, t }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-ink">
      {label}
      {children}
      {error && <span className="font-medium text-red-700">{t(error.message, { defaultValue: error.message })}</span>}
    </label>
  )
}

function inputClass() {
  return 'min-h-12 w-full rounded-xl border border-border bg-white px-3 text-base font-normal'
}

export default function PatientFormPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(Boolean(patientId))
  const [loadError, setLoadError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gpsMessage, setGpsMessage] = useState('')
  const [resolvedPatientId, setResolvedPatientId] = useState(patientId)
  const [serverUpdatedAt, setServerUpdatedAt] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm({
    defaultValues: {
      name: '',
      phone: '',
      village: '',
      mandal: '',
      district: 'Guntur',
      age: '',
      gender: '',
      bloodGroup: '',
      allergyNames: '',
      conditions: [],
      location: null,
      consent: { accepted: false },
    },
  })

  useEffect(() => {
    if (!patientId) return undefined
    let active = true
    function populateForm(patient) {
      if (!active) return
      setResolvedPatientId(patient._id)
      setServerUpdatedAt(patient.updatedAt ?? null)
      reset({
        name: patient.user?.name ?? patient.name ?? '',
        phone: patient.user?.phone ?? patient.phone ?? '',
        village: patient.village ?? '',
        mandal: patient.mandal ?? '',
        district: patient.district ?? '',
        age: patient.age ?? '',
        gender: patient.gender ?? '',
        bloodGroup: patient.bloodGroup ?? '',
        allergyNames: patient.allergies?.map(({ name: allergy }) => allergy).join(', ') ?? '',
        conditions: patient.conditions ?? [],
        location: patient.location ?? null,
      })
    }
    getPatient(patientId, user?.id)
      .then(({ patient }) => populateForm(patient))
      .catch(async (error) => {
        try {
          const cached = !error.response || error.response.status >= 500
            ? await getCachedPatient(user?.id, patientId)
            : null
          if (cached) populateForm(cached)
          else setLoadError(getApiErrorMessage(error, t('patientProfileLoadFailed')))
        } catch (cacheError) {
          console.error('Could not load the cached patient profile.', cacheError)
          setLoadError(getApiErrorMessage(cacheError, t('patientProfileLoadFailed')))
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [patientId, reset, retryCount, t, user?.id])

  function captureLocation() {
    if (!navigator.geolocation) {
      setGpsMessage('locationUnavailableBrowser')
      return
    }
    setGpsBusy(true)
    setGpsMessage('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setValue('location', {
          type: 'Point',
          coordinates: [coords.longitude, coords.latitude],
        }, { shouldDirty: true })
        setGpsMessage('locationCaptured')
        setGpsBusy(false)
      },
      (error) => {
        setGpsMessage(error.code === error.PERMISSION_DENIED
          ? 'locationPermissionDenied'
          : 'locationCaptureFailed')
        setGpsBusy(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  }

  async function submit(values) {
    setSubmitting(true)
    const payload = {
      ...values,
      age: values.age === '' ? undefined : Number(values.age),
      gender: values.gender || undefined,
      bloodGroup: values.bloodGroup || undefined,
      allergies: values.allergyNames
        ? values.allergyNames.split(',').map((name) => ({ name: name.trim() })).filter(({ name }) => name)
        : [],
      conditions: values.conditions ?? [],
      location: values.location || undefined,
      ...(patientId ? {} : {
        consent: {
          accepted: Boolean(values.consent?.accepted),
          policyVersion: 'patient-registration-v1',
        },
      }),
    }
    const updateChanges = Object.fromEntries(
      ['name', 'phone', 'village', 'mandal', 'district', 'age', 'gender', 'bloodGroup', 'conditions', 'location']
        .filter((key) => dirtyFields[key] && payload[key] !== undefined)
        .map((key) => [key, payload[key]]),
    )
    if (dirtyFields.allergyNames) updateChanges.allergies = payload.allergies
    try {
      if (!isOnline) {
        if (patientId) {
          if (!Object.keys(updateChanges).length) {
            toast.success(t('patientProfileUpdated'))
            navigate(`/patients/${resolvedPatientId}`, { replace: true })
            return
          }
          await queuePatient(user.id, {
            operation: 'update',
            patientId: resolvedPatientId,
            payload: updateChanges,
            clientTimestamp: serverUpdatedAt ?? undefined,
          })
          toast.success(t('patientQueuedOffline'))
          navigate(`/patients/${resolvedPatientId}`, { replace: true })
        } else {
          await queuePatient(user.id, { operation: 'create', payload })
          toast.success(t('patientRegistrationQueued'))
          navigate(user.role === 'admin' ? '/admin/patients' : '/chw/patients', { replace: true })
        }
        return
      }
      const result = patientId
        ? await updatePatient(resolvedPatientId, payload)
        : await createPatient(payload)
      const id = result.patient._id ?? patientId
      toast.success(patientId ? t('patientProfileUpdated') : t('patientRegistered'))
      navigate(`/patients/${id}`, { replace: true })
    } catch (error) {
      if (!error.response && isOnline) {
        try {
          if (patientId) {
            await queuePatient(user.id, {
              operation: 'update',
              patientId: resolvedPatientId,
              payload: updateChanges,
              clientTimestamp: serverUpdatedAt ?? undefined,
            })
            toast.success(t('patientQueuedOffline'))
            navigate(`/patients/${resolvedPatientId}`, { replace: true })
          } else {
            await queuePatient(user.id, { operation: 'create', payload })
            toast.success(t('patientRegistrationQueued'))
            navigate(user.role === 'admin' ? '/admin/patients' : '/chw/patients', { replace: true })
          }
          return
        } catch (queueError) {
          toast.error(getApiErrorMessage(queueError, t('patientSaveFailed')))
          return
        }
      }
      const details = error.response?.data?.error?.details
      if (Array.isArray(details)) {
        for (const detail of details) {
          if (detail.field) setError(detail.field, { type: 'server', message: detail.message })
        }
      }
      toast.error(getApiErrorMessage(error, t('patientSaveFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="rounded-xl bg-white p-5 text-muted">{t('loadingPatientProfile')}</p>
  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
        <p>{loadError}</p>
        <button
          type="button"
          onClick={() => { setLoadError(''); setLoading(true); setRetryCount((count) => count + 1) }}
          className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold"
        >
          {t('tryAgain')}
        </button>
      </div>
    )
  }

  return (
    <section className="mx-auto max-w-3xl">
      <p className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">{t('patientRecords')}</p>
      <h1 className="text-3xl font-bold tracking-tight text-ink">{patientId ? t('updatePatient') : t('registerPatient')}</h1>
      {!patientId && user?.role === 'chw' && (
        <p className="mt-2 text-sm leading-6 text-muted">
          {t('chwRegistrationHint')}
        </p>
      )}
      <form onSubmit={handleSubmit(submit)} className="mt-6 grid gap-5 rounded-2xl border border-border bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-7">
        <Field label={t('patientName')} error={errors.name} t={t}>
          <input autoComplete="name" className={inputClass()} {...register('name', { required: 'patientNameRequired' })} />
        </Field>
        <Field label={t('mobileNumber')} error={errors.phone} t={t}>
          <input type="tel" inputMode="tel" autoComplete="tel-national" readOnly={user?.role !== 'admin'} className={`${inputClass()} read-only:bg-slate-50 read-only:text-muted`} placeholder={t('tenDigitMobile')} {...register('phone', { required: 'mobileRequired', pattern: { value: /^(?:\+91)?[6-9]\d{9}$/, message: 'validPhone' } })} />
        </Field>
        <Field label={t('village')} error={errors.village} t={t}>
          <>
            <input list="patient-villages" autoComplete="address-level2" className={inputClass()} {...register('village', { required: 'villageRequired' })} />
            <datalist id="patient-villages">
              {villages.map((village) => <option key={village} value={village} />)}
            </datalist>
          </>
        </Field>
        <Field label={t('mandal')} error={errors.mandal} t={t}>
          <input autoComplete="address-level3" className={inputClass()} {...register('mandal')} />
        </Field>
        <Field label={t('district')} error={errors.district} t={t}>
          <input autoComplete="address-level1" className={inputClass()} {...register('district')} />
        </Field>
        <Field label={t('age')} error={errors.age} t={t}>
          <input type="number" min="0" max="130" className={inputClass()} {...register('age', { min: { value: 0, message: 'ageCannotBeNegative' }, max: { value: 130, message: 'ageMaximum' } })} />
        </Field>
        <Field label={t('gender')} error={errors.gender} t={t}>
          <select className={inputClass()} {...register('gender')}>
            <option value="">{t('notSpecified')}</option>
            <option value="female">{t('female')}</option>
            <option value="male">{t('male')}</option>
            <option value="other">{t('conditionOther')}</option>
            <option value="prefer_not_to_say">{t('preferNotToSay')}</option>
          </select>
        </Field>
        <Field label={t('bloodGroup')} error={errors.bloodGroup} t={t}>
          <select className={inputClass()} {...register('bloodGroup')}>
            <option value="">{t('notSpecified')}</option>
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </Field>
        <Field label={t('allergiesCommaSeparated')} error={errors.allergies} t={t}>
          <input className={inputClass()} placeholder={t('allergyExample')} {...register('allergyNames')} />
        </Field>
        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-semibold text-ink">{t('knownConditions')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {conditions.map((condition) => (
              <label key={condition} className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3 text-sm capitalize">
                <input type="checkbox" value={condition} className="size-5 accent-brand" {...register('conditions')} />
                {t(`condition${condition[0].toUpperCase()}${condition.slice(1)}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {!patientId && (
          <label className="flex min-h-14 items-start gap-3 rounded-xl border border-border p-3 text-sm leading-6 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-brand"
              {...register('consent.accepted', { required: 'patientConsentRequired' })}
            />
            <span>
              {t('patientConsentText')}
              {errors.consent?.accepted && <span className="mt-1 block font-medium text-red-700">{t(errors.consent.accepted.message)}</span>}
            </span>
          </label>
        )}
        <div className="sm:col-span-2">
          <button type="button" onClick={captureLocation} disabled={gpsBusy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand px-4 font-bold text-brand disabled:opacity-60">
            <MapPin size={19} aria-hidden="true" />
            {gpsBusy ? t('gettingLocation') : t('captureGpsLocation')}
          </button>
          <p className="mt-2 text-sm text-muted" aria-live="polite">
            {gpsMessage ? t(gpsMessage) : t('gpsOptionalHint')}
          </p>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:col-span-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => navigate(-1)} className="min-h-12 rounded-xl border border-border px-5 font-bold">{t('cancel')}</button>
          <button type="submit" disabled={submitting} className="min-h-12 rounded-xl bg-brand px-6 font-bold text-white disabled:opacity-60">
            {submitting ? t('saving') : patientId ? t('saveChanges') : t('registerPatient')}
          </button>
        </div>
      </form>
    </section>
  )
}
