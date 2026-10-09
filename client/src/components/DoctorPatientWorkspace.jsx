import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, CalendarPlus, ClipboardPlus, Pill, Save, Stethoscope } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HealthChartPanel } from './HealthCharts.jsx'
import {
  getAppointmentAvailability,
  getMyAvailability,
} from '../api/appointments.js'
import { getBookableHealthCentres } from '../api/healthCentres.js'
import {
  addPatientNote,
  getPatientAppointments,
  getPatientMedications,
  getPatientNotes,
  getPatientReadingSeries,
  getPatientTimeline,
  prescribeMedication,
  schedulePatientAppointment,
  updatePrescription,
} from '../api/patients.js'
import { getApiErrorMessage } from '../api/client.js'
import { formatNumber, getLocale } from '../utils/formatDate.js'

const chartTypes = ['bp', 'sugar', 'heartRate', 'weight', 'spo2', 'temperature']

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

export default function DoctorPatientWorkspace({ patient }) {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState({ notes: [], medications: [], appointments: [], timeline: [] })
  const [chartType, setChartType] = useState('bp')
  const [chartRange, setChartRange] = useState('30d')
  const [chartSeries, setChartSeries] = useState(null)
  const [chartLoading, setChartLoading] = useState(true)
  const [chartError, setChartError] = useState('')
  const chartRequestId = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [noteText, setNoteText] = useState('')
  const [showMedicationForm, setShowMedicationForm] = useState(() => window.location.hash === '#medications')
  const [showAppointmentForm, setShowAppointmentForm] = useState(() => window.location.hash === '#appointments')
  const [saving, setSaving] = useState(false)
  const [todayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [doctorId, setDoctorId] = useState('')
  const [appointmentDate, setAppointmentDate] = useState(dateInputValue)
  const [availableSlots, setAvailableSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState('')
  const [appointmentSlotsError, setAppointmentSlotsError] = useState('')
  const [appointmentMode, setAppointmentMode] = useState('phone')
  const [healthCentres, setHealthCentres] = useState([])
  const [healthCentreId, setHealthCentreId] = useState('')

  const load = useCallback(async () => {
    try {
      const [noteResult, medicationResult, appointmentResult, timelineResult, doctorAvailability] = await Promise.all([
        getPatientNotes(patient._id, { limit: 100 }),
        getPatientMedications(patient._id),
        getPatientAppointments(patient._id),
        getPatientTimeline(patient._id),
        getMyAvailability(),
      ])
      setDoctorId(doctorAvailability.doctorId)
      setData({
        notes: noteResult.items ?? [],
        medications: medicationResult.items ?? [],
        appointments: appointmentResult.items ?? [],
        timeline: timelineResult.items ?? [],
      })
      setError('')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('doctorWorkspaceLoadFailed')))
    } finally {
      setLoading(false)
    }
  }, [patient._id, t])

  useEffect(() => {
    if (!showAppointmentForm || !doctorId || !appointmentDate) return undefined
    let active = true
    async function loadAppointmentSlots() {
      setAvailableSlots([])
      setSelectedSlot('')
      setAppointmentSlotsError('')
      try {
        const result = await getAppointmentAvailability({
          doctorId,
          ...localDayRange(appointmentDate),
        })
        if (active) setAvailableSlots(result.slots ?? [])
      } catch (requestError) {
        if (active) setAppointmentSlotsError(getApiErrorMessage(requestError, t('appointmentsSlotsFailed')))
      }
    }
    loadAppointmentSlots()
    return () => { active = false }
  }, [appointmentDate, doctorId, showAppointmentForm, t])

  useEffect(() => {
    if (!showAppointmentForm || appointmentMode !== 'inPerson') return undefined
    let active = true
    getBookableHealthCentres()
      .then((centres) => {
        if (active) setHealthCentres(centres ?? [])
      })
      .catch((requestError) => {
        if (active) setAppointmentSlotsError(getApiErrorMessage(requestError, t('appointmentsLoadFailed')))
      })
    return () => { active = false }
  }, [appointmentMode, showAppointmentForm, t])

  const loadChartSeries = useCallback(async () => {
    const requestId = ++chartRequestId.current
    setChartLoading(true)
    setChartError('')
    try {
      const result = await getPatientReadingSeries(patient._id, { type: chartType, range: chartRange })
      if (requestId === chartRequestId.current) setChartSeries(result)
    } catch (requestError) {
      if (requestId === chartRequestId.current) {
        setChartSeries(null)
        setChartError(getApiErrorMessage(requestError, t('chartLoadFailed')))
      }
    } finally {
      if (requestId === chartRequestId.current) setChartLoading(false)
    }
  }, [chartRange, chartType, patient._id, t])

  useEffect(() => {
    // Start the series request when the selected metric or range changes.
    // eslint-disable-next-line react/set-state-in-effect
    loadChartSeries()
  }, [loadChartSeries])

  useEffect(() => {
    let active = true
    // Load the patient-specific remote care record for the selected route.
    // eslint-disable-next-line react/set-state-in-effect
    load().catch((loadError) => {
      if (active) setError(getApiErrorMessage(loadError, t('doctorWorkspaceLoadFailed')))
    })
    return () => {
      active = false
    }
  }, [load, t])

  useEffect(() => {
    if (!loading && window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [loading])

  async function saveNote(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await addPatientNote(patient._id, { kind: 'clinical', body: noteText, visibility: 'careTeam' })
      setNoteText('')
      toast.success(t('noteSaved'))
      await load()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('noteSaveFailed')))
    } finally {
      setSaving(false)
    }
  }

  async function saveMedication(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const timings = String(form.get('timings')).split(',').map((time) => time.trim()).filter(Boolean)
    setSaving(true)
    try {
      await prescribeMedication(patient._id, {
        name: String(form.get('name')).trim(),
        dose: String(form.get('dose')).trim(),
        frequency: String(form.get('frequency')).trim(),
        timings,
        startDate: new Date(`${form.get('startDate')}T00:00:00`).toISOString(),
        instructions: {
          en: String(form.get('instructionsEn') ?? '').trim(),
          te: String(form.get('instructionsTe') ?? '').trim(),
        },
      })
      setShowMedicationForm(false)
      toast.success(t('medicationSaved'))
      await load()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('medicationSaveFailed')))
    } finally {
      setSaving(false)
    }
  }

  async function saveAppointment(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      await schedulePatientAppointment(patient._id, {
        scheduledAt: selectedSlot,
        durationMinutes: 30,
        mode: String(form.get('mode')),
        ...(appointmentMode === 'inPerson' ? { healthCentreId } : {}),
        reason: String(form.get('reason') ?? '').trim(),
      })
      setShowAppointmentForm(false)
      toast.success(t('appointmentSaved'))
      await load()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('appointmentSaveFailed')))
    } finally {
      setSaving(false)
    }
  }

  async function deactivatePrescription(medication) {
    const reason = window.prompt(t('prescriptionChangeReason'))
    if (!reason) return
    try {
      await updatePrescription(patient._id, medication._id, {
        active: false,
        reason,
      })
      toast.success(t('prescriptionUpdated'))
      await load()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('medicationSaveFailed')))
    }
  }

  async function editPrescription(medication) {
    const dose = window.prompt(t('editDosePrompt'), medication.dose)
    if (dose === null || !dose.trim()) return
    const frequency = window.prompt(t('editFrequencyPrompt'), medication.frequency)
    if (frequency === null || !frequency.trim()) return
    const reason = window.prompt(t('prescriptionChangeReason'))
    if (!reason) return
    try {
      await updatePrescription(patient._id, medication._id, {
        dose: dose.trim(),
        frequency: frequency.trim(),
        reason,
      })
      toast.success(t('prescriptionUpdated'))
      await load()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('medicationSaveFailed')))
    }
  }

  const formatDate = (value) => new Intl.DateTimeFormat(getLocale(i18n.language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

  return (
    <section className="mt-5 space-y-4">
      {loading && <p className="rounded-xl bg-white p-4 text-muted">{t('loadingDoctorWorkspace')}</p>}
      {!loading && error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900" role="alert">{error}</p>}
      {!loading && !error && (
        <>
          <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-900"><Activity size={23} aria-hidden="true" /></span>
                <div><h2 className="text-lg font-extrabold">{t('readingTrends')}</h2><p className="text-sm text-muted">{t('trendDisclaimer')}</p></div>
              </div>
              <label className="grid gap-1 text-sm font-semibold">{t('measurementType')}
                <select value={chartType} onChange={(event) => setChartType(event.target.value)} className="min-h-11 rounded-xl border border-border px-3">
                  {chartTypes.map((type) => <option key={type} value={type}>{t(type === 'bp' ? 'bloodPressure' : type === 'sugar' ? 'bloodSugar' : type === 'spo2' ? 'oxygenLevel' : type)}</option>)}
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

          <div className="grid gap-4 lg:grid-cols-2">
            <section id="notes" className="rounded-2xl border border-border bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-900"><ClipboardPlus size={21} aria-hidden="true" /></span><h2 className="text-lg font-extrabold">{t('clinicalNotes')}</h2></div>
              </div>
              <form onSubmit={saveNote} className="mt-3 grid gap-2">
                <label htmlFor="doctor-note" className="text-sm font-semibold">{t('addClinicalNote')}</label>
                <textarea id="doctor-note" value={noteText} onChange={(event) => setNoteText(event.target.value)} required maxLength={5000} rows={3} className="rounded-xl border border-border p-3" />
                <button type="submit" disabled={saving || !noteText.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-bold text-white disabled:opacity-50"><ClipboardPlus size={17} aria-hidden="true" />{t('saveNote')}</button>
              </form>
              <ul className="mt-4 divide-y divide-border">
                {data.notes.map((note) => <li key={note._id} className="py-3"><p className="whitespace-pre-wrap text-sm leading-6">{note.body}</p><p className="mt-1 text-xs text-muted">{note.author?.name ?? t('careTeam')} · {formatDate(note.createdAt)}</p></li>)}
                {data.notes.length === 0 && <li className="py-3 text-sm text-muted">{t('noClinicalNotes')}</li>}
              </ul>
            </section>

            <section id="medications" className="rounded-2xl border border-border bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-purple-50 text-purple-900"><Pill size={21} aria-hidden="true" /></span><h2 className="text-lg font-extrabold">{t('medications')}</h2></div>
                <button type="button" onClick={() => setShowMedicationForm((value) => !value)} className="min-h-10 rounded-lg border border-border px-3 text-sm font-bold">{t('prescribe')}</button>
              </div>
              {showMedicationForm && (
                <form onSubmit={saveMedication} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-semibold">{t('medicationName')}<input name="name" required maxLength={160} className="min-h-10 rounded-lg border border-border px-2" /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('dose')}<input name="dose" required maxLength={120} className="min-h-10 rounded-lg border border-border px-2" /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('frequency')}<input name="frequency" required maxLength={120} className="min-h-10 rounded-lg border border-border px-2" placeholder={t('frequencyExample')} /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('timesCommaSeparated')}<input name="timings" required pattern="([01][0-9]|2[0-3]):[0-5][0-9](,\\s*([01][0-9]|2[0-3]):[0-5][0-9])*" className="min-h-10 rounded-lg border border-border px-2" placeholder="08:00, 20:00" /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('startDate')}<input name="startDate" type="date" required defaultValue={todayDate} className="min-h-10 rounded-lg border border-border px-2" /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('instructionsEnglish')}<textarea name="instructionsEn" maxLength={1000} rows={2} className="rounded-lg border border-border p-2" /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('instructionsTelugu')}<textarea name="instructionsTe" maxLength={1000} rows={2} className="rounded-lg border border-border p-2" /></label>
                  <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-3 font-bold text-white disabled:opacity-50"><Save size={16} aria-hidden="true" />{t('savePrescription')}</button>
                </form>
              )}
              <ul className="mt-3 divide-y divide-border">
                {data.medications.map((medication) => (
                  <li key={medication._id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{medication.name} · {medication.dose}</p>
                        <p className="mt-1 text-sm text-muted">{medication.frequency} · {medication.timings.join(', ')}</p>
                        {(medication.instructions?.[i18n.language] || medication.instructions?.en) && <p className="mt-1 text-sm">{medication.instructions[i18n.language] || medication.instructions.en}</p>}
                        {!medication.active && <p className="mt-1 text-xs font-bold text-slate-600">{t('discontinued')}</p>}
                      </div>
                      {medication.active && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => editPrescription(medication)} className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold">{t('editPrescription')}</button><button type="button" onClick={() => deactivatePrescription(medication)} className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold">{t('stopPrescription')}</button></div>}
                    </div>
                  </li>
                ))}
                {data.medications.length === 0 && <li className="py-3 text-sm text-muted">{t('noMedications')}</li>}
              </ul>
            </section>
          </div>

          <section id="appointments" className="rounded-2xl border border-border bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-green-50 text-green-900"><CalendarPlus size={21} aria-hidden="true" /></span><h2 className="text-lg font-extrabold">{t('appointments')}</h2></div>
              <button type="button" onClick={() => setShowAppointmentForm((value) => !value)} className="min-h-10 rounded-lg border border-border px-3 text-sm font-bold">{t('scheduleAppointment')}</button>
            </div>
            {showAppointmentForm && (
              <form onSubmit={saveAppointment} className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">{t('appointmentDateTime')}<input type="date" min={dateInputValue()} value={appointmentDate} onChange={(event) => setAppointmentDate(event.target.value)} required className="min-h-11 rounded-lg border border-border px-3" /></label>
                <label className="grid gap-1 text-sm font-semibold">{t('appointmentMode')}
                  <select name="mode" value={appointmentMode} onChange={(event) => setAppointmentMode(event.target.value)} className="min-h-11 rounded-lg border border-border px-3"><option value="inPerson">{t('inPerson')}</option><option value="phone">{t('phoneCall')}</option><option value="video">{t('videoCall')}</option></select>
                </label>
                {appointmentMode === 'inPerson' && (
                  <label className="grid gap-1 text-sm font-semibold">{t('appointmentHealthCentre')}
                    <select required value={healthCentreId} onChange={(event) => setHealthCentreId(event.target.value)} className="min-h-11 rounded-lg border border-border px-3">
                      <option value="">{t('selectHealthCentre')}</option>
                      {healthCentres.map((centre) => <option key={centre._id} value={centre._id}>{centre.name} · {centre.address}</option>)}
                    </select>
                  </label>
                )}
                <label className="grid gap-1 text-sm font-semibold">{t('reason')}<input name="reason" maxLength={1000} className="min-h-11 rounded-lg border border-border px-3" /></label>
                <fieldset className="sm:col-span-2">
                  <legend className="text-sm font-bold">{t('availableSlots')}</legend>
                  {appointmentSlotsError && <p role="alert" className="mt-2 text-sm font-semibold text-red-800">{appointmentSlotsError}</p>}
                  {availableSlots.length > 0 ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {availableSlots.map(({ scheduledAt }) => (
                        <label key={scheduledAt} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm font-bold ${selectedSlot === scheduledAt ? 'border-brand bg-brand text-white' : 'border-border bg-white'}`}>
                          <input className="sr-only" type="radio" name="appointment-slot" value={scheduledAt} checked={selectedSlot === scheduledAt} onChange={() => setSelectedSlot(scheduledAt)} />
                          {new Intl.DateTimeFormat(i18n.resolvedLanguage === 'te' ? 'te-IN' : 'en-IN', { timeStyle: 'short' }).format(new Date(scheduledAt))}
                        </label>
                      ))}
                    </div>
                  ) : <p className="mt-2 text-sm text-muted">{t('noAvailableSlots')}</p>}
                </fieldset>
                <button type="submit" disabled={saving || !selectedSlot} className="min-h-11 rounded-lg bg-brand px-4 font-bold text-white disabled:opacity-50">{t('saveAppointment')}</button>
              </form>
            )}
            <ul className="mt-3 divide-y divide-border">
              {data.appointments.map((appointment) => <li key={appointment._id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="font-semibold">{formatDate(appointment.scheduledAt)} · {t(`mode${appointment.mode[0].toUpperCase()}${appointment.mode.slice(1)}`)}</span><span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-900">{t(`appointment${appointment.status[0].toUpperCase()}${appointment.status.slice(1)}`)}</span></li>)}
              {data.appointments.length === 0 && <li className="py-3 text-sm text-muted">{t('noAppointments')}</li>}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-800"><Stethoscope size={21} aria-hidden="true" /></span><h2 className="text-lg font-extrabold">{t('patientTimeline')}</h2></div>
            <ol className="mt-4 space-y-3 border-l-2 border-border pl-4">
              {data.timeline.map((entry) => (
                <li key={`${entry.type}-${entry.id}`} className="relative">
                  <span className="absolute -left-[1.38rem] top-1 size-3 rounded-full bg-brand ring-4 ring-white" />
                  <p className="text-xs font-semibold text-muted">{formatDate(entry.at)}</p>
                  <TimelineEntry entry={entry} t={t} language={i18n.language} />
                </li>
              ))}
              {data.timeline.length === 0 && <li className="text-sm text-muted">{t('timelineEmpty')}</li>}
            </ol>
          </section>
        </>
      )}
    </section>
  )
}

function TimelineEntry({ entry, t, language }) {
  if (entry.type === 'reading') {
    const reading = entry.item
    const value = reading.type === 'bp'
      ? `${formatNumber(reading.values.systolic, i18n.language)}/${formatNumber(reading.values.diastolic, i18n.language)} mmHg`
      : `${formatNumber(reading.values.value, i18n.language)} ${reading.values.unit ?? ''}`
    return <p className="mt-1 text-sm font-semibold">{t('readingTimeline')}: {t(reading.type === 'bp' ? 'bloodPressure' : reading.type === 'sugar' ? 'bloodSugar' : reading.type === 'spo2' ? 'oxygenLevel' : reading.type)} · {value} · {t(`server${reading.status[0].toUpperCase()}${reading.status.slice(1)}`)}</p>
  }
  if (entry.type === 'note') return <p className="mt-1 whitespace-pre-wrap text-sm">{t('noteTimeline')}: {entry.item.body}</p>
  if (entry.type === 'alert') return <p className="mt-1 text-sm">{t('alertTimeline')}: {entry.item.message?.[language] ?? entry.item.message?.en} · {entry.item.status}</p>
  if (entry.type === 'medication') return <p className="mt-1 text-sm">{t('medicationTimeline')}: {entry.item.name} · {entry.item.dose} · {entry.item.active ? t('active') : t('discontinued')}</p>
  return <p className="mt-1 text-sm">{t('appointmentTimeline')}: {entry.item.reason || t('appointments')} · {entry.item.status}</p>
}
