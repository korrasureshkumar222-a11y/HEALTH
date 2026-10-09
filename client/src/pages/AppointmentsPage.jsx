import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Check, Clock3, RefreshCw, Save, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import {
  cancelAppointment,
  confirmAppointment,
  createAppointment,
  getAppointmentAvailability,
  getAppointmentDoctors,
  getMyAvailability,
  listAppointments,
  rescheduleAppointment,
  setAppointmentStatus,
  updateMyAvailability,
} from '../api/appointments.js'
import { getApiErrorMessage } from '../api/client.js'
import { getOwnPatient, listPatients } from '../api/patients.js'
import { getBookableHealthCentres } from '../api/healthCentres.js'
import { useAuth } from '../context/useAuth.js'

function dateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDayRange(date) {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

function appointmentDoctorId(appointment) {
  return appointment.doctor?._id ?? appointment.doctor
}

function formatDateTime(value, language) {
  return new Intl.DateTimeFormat(language === 'te' ? 'te-IN' : 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function appointmentWindow() {
  const now = new Date()
  return {
    from: new Date(now.getTime() - 14 * 24 * 60 * 60_000).toISOString(),
    to: new Date(now.getTime() + 90 * 24 * 60 * 60_000).toISOString(),
  }
}

const defaultScheduleSlot = { dayOfWeek: '1', startTime: '09:00', endTime: '17:00', timezone: 'Asia/Kolkata' }

export default function AppointmentsPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isDoctor = user?.role === 'doctor'
  const isChw = user?.role === 'chw'
  const canBook = user?.role === 'patient' || isChw
  const canChooseSlot = canBook || (isDoctor && Boolean(rescheduling))
  const [patientId, setPatientId] = useState('')
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [healthCentres, setHealthCentres] = useState([])
  const [healthCentreId, setHealthCentreId] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [appointments, setAppointments] = useState([])
  const [availability, setAvailability] = useState([])
  const [day, setDay] = useState(dateInputValue)
  const [slots, setSlots] = useState([])
  const [slot, setSlot] = useState('')
  const [mode, setMode] = useState('phone')
  const [reason, setReason] = useState('')
  const [scheduleSlot, setScheduleSlot] = useState(defaultScheduleSlot)
  const [rescheduling, setRescheduling] = useState(null)
  const [loading, setLoading] = useState(true)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const refreshAppointments = useCallback(async () => {
    const result = await listAppointments({ ...appointmentWindow(), page: 1, limit: 100 })
    setAppointments(result.items ?? [])
  }, [])

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        const requests = [listAppointments({ ...appointmentWindow(), page: 1, limit: 100 })]
        if (canBook) requests.push(getAppointmentDoctors(), getBookableHealthCentres())
        if (isChw) requests.push(listPatients({ page: 1, limit: 100, status: 'active' }))
        if (user?.role === 'patient') requests.push(getOwnPatient())
        if (isDoctor) requests.push(getMyAvailability())
        const results = await Promise.all(requests)
        if (!active) return

        setAppointments(results[0].items ?? [])
        let resultIndex = 1
        let availableDoctors = []
        if (canBook) {
          const doctorResult = results[resultIndex]
          availableDoctors = doctorResult.items ?? []
          setDoctors(doctorResult.items ?? [])
          setDoctorId(doctorResult.items?.[0]?._id ?? '')
          resultIndex += 1
          const centres = results[resultIndex]
          setHealthCentres(centres ?? [])
          resultIndex += 1
        }
        if (isChw) {
          const patientResult = results[resultIndex]
          setPatients(patientResult.items ?? [])
          setPatientId(patientResult.items?.[0]?._id ?? '')
          resultIndex += 1
        }
        if (user?.role === 'patient') {
          const profile = results[resultIndex]?.patient
          setPatientId(profile?._id ?? '')
          const assignedDoctor = profile?.assignedDoctor?._id ?? profile?.assignedDoctor
          if (assignedDoctor && availableDoctors.some((doctor) => doctor._id === assignedDoctor)) {
            setDoctorId(assignedDoctor)
          }
        }
        if (isDoctor) setAvailability(results[resultIndex].availability ?? [])
      } catch (requestError) {
        if (active) setError(getApiErrorMessage(requestError, t('appointmentsLoadFailed')))
      } finally {
        if (active) setLoading(false)
      }
    }
    initialize()
    return () => { active = false }
  }, [canBook, isChw, isDoctor, t, user?.role])

  useEffect(() => {
    if (!canChooseSlot || !doctorId || !day) return undefined
    let active = true
    async function loadSlots() {
      setSlotsLoading(true)
      setSlots([])
      setSlot('')
      try {
        const result = await getAppointmentAvailability({ doctorId, ...localDayRange(day) })
        if (active) setSlots(result.slots ?? [])
      } catch (requestError) {
        if (active) setError(getApiErrorMessage(requestError, t('appointmentsSlotsFailed')))
      } finally {
        if (active) setSlotsLoading(false)
      }
    }
    loadSlots()
    return () => { active = false }
  }, [canChooseSlot, day, doctorId, rescheduling, t])

  async function submitBooking(event) {
    event.preventDefault()
    if (!slot || !doctorId || (!isDoctor && !patientId)) return
    setSubmitting(true)
    setError('')
    try {
      if (rescheduling) {
        await rescheduleAppointment(rescheduling._id, { scheduledAt: slot, durationMinutes: 30 })
        toast.success(t('appointmentRescheduled'))
      } else {
        await createAppointment({
          ...(isChw ? { patientId } : {}),
          doctorId,
          scheduledAt: slot,
          mode,
          ...(mode === 'inPerson' ? { healthCentreId } : {}),
          reason,
        })
        toast.success(t('appointmentRequested'))
      }
      setRescheduling(null)
      setReason('')
      await refreshAppointments()
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('appointmentsSaveFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  function startReschedule(appointment) {
    setRescheduling(appointment)
    setDoctorId(appointmentDoctorId(appointment))
    setDay(dateInputValue(new Date(appointment.scheduledAt)))
    setSlot('')
  }

  async function runAppointmentAction(action, appointment, payload) {
    setError('')
    try {
      await action(appointment._id, ...(payload ?? []))
      await refreshAppointments()
      toast.success(t('appointmentUpdated'))
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('appointmentsSaveFailed')))
    }
  }

  function addScheduleSlot(event) {
    event.preventDefault()
    const entry = {
      dayOfWeek: Number(scheduleSlot.dayOfWeek),
      startTime: scheduleSlot.startTime,
      endTime: scheduleSlot.endTime,
      timezone: scheduleSlot.timezone,
    }
    setAvailability((current) => [...current, entry])
  }

  async function saveAvailability() {
    setSubmitting(true)
    try {
      const updated = await updateMyAvailability(availability)
      setAvailability(updated.availability ?? availability)
      toast.success(t('appointmentAvailabilitySaved'))
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('appointmentsSaveFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  function patientName(appointment) {
    return appointment.patient?.name ?? appointment.patient?.user?.name ?? t('patient')
  }

  if (loading) {
    return <div role="status" className="grid min-h-48 place-items-center text-muted">{t('loading')}</div>
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <CalendarDays className="mt-1 text-brand" size={28} aria-hidden="true" />
        <div>
          <h1 className="text-3xl font-extrabold text-ink">{t(isDoctor ? 'doctorAppointmentsTitle' : 'appointmentsTitle')}</h1>
          <p className="mt-2 text-muted">{t(isDoctor ? 'doctorAppointmentsDescription' : 'appointmentsDescription')}</p>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-900">{error}</div>}

      {isDoctor && (
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">{t('doctorAvailabilityTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('doctorAvailabilityDescription')}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="grid gap-1 text-sm font-semibold">
              {t('weekday')}
              <select className="min-h-12 rounded-xl border border-border px-3" value={scheduleSlot.dayOfWeek} onChange={(event) => setScheduleSlot({ ...scheduleSlot, dayOfWeek: event.target.value })}>
                {[0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => <option key={dayOfWeek} value={dayOfWeek}>{t(`weekday${dayOfWeek}`)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              {t('availabilityStart')}
              <input type="time" step="1800" value={scheduleSlot.startTime} onChange={(event) => setScheduleSlot({ ...scheduleSlot, startTime: event.target.value })} className="min-h-12 rounded-xl border border-border px-3" />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              {t('availabilityEnd')}
              <input type="time" step="1800" value={scheduleSlot.endTime} onChange={(event) => setScheduleSlot({ ...scheduleSlot, endTime: event.target.value })} className="min-h-12 rounded-xl border border-border px-3" />
            </label>
            <button type="button" onClick={addScheduleSlot} className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 font-bold hover:bg-slate-50">
              <CalendarDays size={17} aria-hidden="true" />{t('addAvailability')}
            </button>
          </div>
          {availability.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {availability.map((entry, index) => (
                <li key={`${entry.dayOfWeek}-${entry.startTime}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span className="font-semibold">{t(`weekday${entry.dayOfWeek}`)} · {entry.startTime}–{entry.endTime}</span>
                  <button type="button" className="min-h-10 rounded-lg px-3 text-red-800 hover:bg-red-50" aria-label={t('removeAvailability')} onClick={() => setAvailability((current) => current.filter((_item, itemIndex) => itemIndex !== index))}>
                    <X size={18} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 rounded-xl bg-amber-50 p-3 font-semibold text-amber-950">{t('noAvailability')}</p>}
          <button type="button" disabled={submitting} onClick={saveAvailability} className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand px-4 font-bold text-white disabled:opacity-60">
            <Save size={18} aria-hidden="true" />{t('saveAvailability')}
          </button>
        </section>
      )}

      {canChooseSlot && (
        <form onSubmit={submitBooking} className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-xl font-bold">{t(rescheduling ? 'rescheduleAppointment' : 'bookAppointment')}</h2>
            <p className="mt-1 text-sm text-muted">{t('appointmentBookingHelp')}</p>
          </div>
          {isChw && !rescheduling && (
            <label className="grid gap-1 font-semibold">
              {t('selectPatient')}
              <select required value={patientId} onChange={(event) => {
                const nextPatientId = event.target.value
                setPatientId(nextPatientId)
                const assignedDoctorId = patients.find((patient) => patient._id === nextPatientId)?.assignedDoctor?._id
                  ?? patients.find((patient) => patient._id === nextPatientId)?.assignedDoctor
                if (assignedDoctorId && doctors.some((doctor) => doctor._id === assignedDoctorId)) {
                  setDoctorId(assignedDoctorId)
                } else if (isChw) {
                  setDoctorId('')
                }
              }} className="min-h-12 rounded-xl border border-border px-3">
                <option value="">{t('selectPatient')}</option>
                {patients.map((patient) => <option key={patient._id} value={patient._id}>{patient.name ?? patient.user?.name} · {patient.village}</option>)}
              </select>
            </label>
          )}
          <div className={`grid gap-4 ${isDoctor ? '' : 'sm:grid-cols-2'}`}>
            {!isDoctor && (
              <label className="grid gap-1 font-semibold">
                {t('doctor')}
                <select required value={doctorId} onChange={(event) => setDoctorId(event.target.value)} className="min-h-12 rounded-xl border border-border px-3">
                  <option value="">{t('selectDoctor')}</option>
                  {doctors.map((doctor) => <option key={doctor._id} value={doctor._id}>{doctor.name} · {doctor.specialization}</option>)}
                </select>
              </label>
            )}
            <label className="grid gap-1 font-semibold">
              {t('appointmentDate')}
              <input required type="date" min={dateInputValue()} value={day} onChange={(event) => setDay(event.target.value)} className="min-h-12 rounded-xl border border-border px-3" />
            </label>
          </div>
          {!rescheduling && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 font-semibold">
                {t('appointmentMode')}
                <select value={mode} onChange={(event) => setMode(event.target.value)} className="min-h-12 rounded-xl border border-border px-3">
                  <option value="phone">{t('appointmentModePhone')}</option>
                  <option value="video">{t('appointmentModeVideo')}</option>
                  <option value="inPerson">{t('appointmentModeInPerson')}</option>
                </select>
              </label>
              <label className="grid gap-1 font-semibold">
                {t('appointmentReason')}
                <input maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-12 rounded-xl border border-border px-3" />
              </label>
            </div>
          )}
          {!rescheduling && mode === 'inPerson' && (
            <label className="grid gap-1 font-semibold">
              {t('appointmentHealthCentre')}
              <select required value={healthCentreId} onChange={(event) => setHealthCentreId(event.target.value)} className="min-h-12 rounded-xl border border-border px-3">
                <option value="">{t('selectHealthCentre')}</option>
                {healthCentres.map((centre) => <option key={centre._id} value={centre._id}>{centre.name} · {centre.address}</option>)}
              </select>
            </label>
          )}
          <fieldset>
            <legend className="font-bold">{t('availableSlots')}</legend>
            {slotsLoading ? (
              <p role="status" className="mt-2 flex items-center gap-2 text-muted"><RefreshCw size={16} className="animate-spin" aria-hidden="true" />{t('loading')}</p>
            ) : slots.length ? (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {slots.map(({ scheduledAt }) => (
                  <label key={scheduledAt} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-bold ${slot === scheduledAt ? 'border-brand bg-brand text-white' : 'border-border hover:bg-slate-50'}`}>
                    <input className="sr-only" type="radio" name="appointment-slot" value={scheduledAt} checked={slot === scheduledAt} onChange={() => setSlot(scheduledAt)} />
                    {new Intl.DateTimeFormat(i18n.resolvedLanguage === 'te' ? 'te-IN' : 'en-IN', { timeStyle: 'short' }).format(new Date(scheduledAt))}
                  </label>
                ))}
              </div>
            ) : <p className="mt-2 rounded-xl bg-slate-50 p-3 text-muted">{t(doctorId ? 'noAvailableSlots' : 'selectDoctorFirst')}</p>}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={!slot || submitting} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              <Check size={18} aria-hidden="true" />{t(rescheduling ? 'saveNewTime' : 'requestAppointment')}
            </button>
            {rescheduling && <button type="button" onClick={() => setRescheduling(null)} className="min-h-12 rounded-xl border border-border px-4 font-bold">{t('cancel')}</button>}
          </div>
        </form>
      )}

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Clock3 className="text-brand" size={21} aria-hidden="true" />
          <h2 className="text-xl font-bold">{t(isDoctor ? 'doctorSchedule' : 'yourAppointments')}</h2>
        </div>
        {appointments.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-muted">{t('noAppointments')}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {appointments.map((appointment) => {
              const open = ['requested', 'confirmed'].includes(appointment.status)
              return (
                <li key={appointment._id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{isDoctor ? patientName(appointment) : `${t('doctor')}: ${appointment.doctor?.user?.name ?? t('doctor')}`}</p>
                      <p className="mt-1 text-sm text-muted">{formatDateTime(appointment.scheduledAt, i18n.resolvedLanguage)}</p>
                      <p className="mt-1 text-sm text-muted">{t(`appointmentMode${appointment.mode[0].toUpperCase()}${appointment.mode.slice(1)}`)} · {appointment.reason || t('noAppointmentReason')}</p>
                      {appointment.healthCentre?.name && <p className="mt-1 text-sm text-muted">{appointment.healthCentre.name} · {appointment.healthCentre.address}</p>}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${appointment.status === 'confirmed' ? 'bg-green-100 text-green-900' : appointment.status === 'requested' ? 'bg-amber-100 text-amber-950' : 'bg-slate-100 text-slate-700'}`}>
                      {t(`appointmentStatus${appointment.status.replace(/(^|-)(\w)/g, (_match, _hyphen, character) => character.toUpperCase())}`)}
                    </span>
                  </div>
                  {open && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isDoctor && appointment.status === 'requested' && (
                        <button type="button" onClick={() => runAppointmentAction(confirmAppointment, appointment)} className="min-h-11 rounded-lg bg-green-700 px-3 font-bold text-white">{t('confirmAppointment')}</button>
                      )}
                      <button type="button" onClick={() => startReschedule(appointment)} className="min-h-11 rounded-lg border border-border px-3 font-bold">{t('rescheduleAppointment')}</button>
                      {isDoctor && appointment.status === 'confirmed' && (
                        <>
                          <button type="button" onClick={() => runAppointmentAction(setAppointmentStatus, appointment, [{ status: 'completed' }])} className="min-h-11 rounded-lg border border-green-700 px-3 font-bold text-green-800">{t('markCompleted')}</button>
                          <button type="button" onClick={() => runAppointmentAction(setAppointmentStatus, appointment, [{ status: 'no-show' }])} className="min-h-11 rounded-lg border border-amber-600 px-3 font-bold text-amber-900">{t('markNoShow')}</button>
                        </>
                      )}
                      <button type="button" onClick={() => runAppointmentAction(cancelAppointment, appointment, [t('cancelledByUser')])} className="min-h-11 rounded-lg border border-red-300 px-3 font-bold text-red-800">{t('cancelAppointment')}</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </section>
  )
}
