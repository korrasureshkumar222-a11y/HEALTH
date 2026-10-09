import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Edit3, MapPin, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  deactivatePatient,
  getAssignableStaff,
  getPatient,
  updatePatientAssignments,
} from '../api/patients.js'
import { getApiErrorMessage } from '../api/client.js'
import { requestDroneMission } from '../api/drone.js'
import { useAuth } from '../context/useAuth.js'
import { useTranslation } from 'react-i18next'
import { formatDateTime, formatNumber } from '../utils/formatDate.js'

const DoctorPatientWorkspace = lazy(() => import('../components/DoctorPatientWorkspace.jsx'))
const vitalLabels = {
  bp: 'bloodPressure',
  sugar: 'bloodSugar',
  heartRate: 'heartRate',
  weight: 'weight',
  spo2: 'oxygenLevel',
  temperature: 'temperature',
}

function assignedName(profile, t) {
  return profile?.user?.name ?? t('unassigned')
}

function fetchPatientView(patientId, isAdmin, userId) {
  return Promise.all([
    getPatient(patientId, userId),
    isAdmin ? getAssignableStaff() : Promise.resolve({ doctors: [], chws: [] }),
  ])
}

export default function PatientDetailPage() {
  const { patientId } = useParams()
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const [patient, setPatient] = useState(null)
  const [staff, setStaff] = useState({ doctors: [], chws: [] })
  const [doctorId, setDoctorId] = useState('')
  const [chwId, setChwId] = useState('')
  const [saving, setSaving] = useState(false)
  const [droneRequesting, setDroneRequesting] = useState(false)
  const [droneMission, setDroneMission] = useState(null)
  const [error, setError] = useState('')
  const isAdmin = user?.role === 'admin'
  const userId = user?.id

  const load = useCallback(async () => {
    try {
      const [{ patient: loadedPatient }, assignableStaff] = await fetchPatientView(patientId, isAdmin, userId)
      setPatient(loadedPatient)
      setStaff(assignableStaff)
      setDoctorId(loadedPatient.assignedDoctor?._id ?? '')
      setChwId(loadedPatient.assignedChw?._id ?? '')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, t('patientDetailsLoadFailed')))
    }
  }, [patientId, isAdmin, t, userId])

  useEffect(() => {
    let active = true
    fetchPatientView(patientId, isAdmin, userId)
      .then(([{ patient: loadedPatient }, assignableStaff]) => {
        if (!active) return
        setPatient(loadedPatient)
        setStaff(assignableStaff)
        setDoctorId(loadedPatient.assignedDoctor?._id ?? '')
        setChwId(loadedPatient.assignedChw?._id ?? '')
      })
      .catch((requestError) => {
        if (active) setError(getApiErrorMessage(requestError, t('patientDetailsLoadFailed')))
      })
    return () => {
      active = false
    }
  }, [patientId, isAdmin, t, userId])

  async function saveAssignments(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await updatePatientAssignments(patientId, {
        doctorId: doctorId || null,
        chwId: chwId || null,
      })
      toast.success(t('careAssignmentsUpdated'))
      await load()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('assignmentsUpdateFailed')))
    } finally {
      setSaving(false)
    }
  }

  async function deactivate() {
    if (!window.confirm(t('deactivatePatientConfirm'))) return
    try {
      await deactivatePatient(patientId)
      toast.success(t('patientDeactivated'))
      await load()
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('patientDeactivateFailed')))
    }
  }

  async function requestEmergencySupplies() {
    if (!window.confirm(t('droneDoctorRequestConfirm', { name }))) return
    setDroneRequesting(true)
    try {
      const result = await requestDroneMission({
        patientId: patient._id,
        payload: ['medicine'],
      })
      setDroneMission(result.mission)
      toast.success(t('droneDoctorRequestCreated'))
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, t('droneRequestFailed')))
    } finally {
      setDroneRequesting(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
        <p>{error}</p>
        <button type="button" onClick={() => { setError(''); load() }} className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold">{t('tryAgain')}</button>
      </div>
    )
  }
  if (!patient) return <p className="rounded-xl bg-white p-5 text-muted">{t('loadingPatientDetails')}</p>

  const name = patient.user?.name ?? patient.name ?? t('patient')
  const genderKey = patient.gender === 'other'
    ? 'conditionOther'
    : patient.gender === 'prefer_not_to_say'
    ? 'preferNotToSay'
    : patient.gender ?? 'notSpecified'
  return (
    <section className="mx-auto max-w-5xl">
      <Link to={user?.role === 'chw' ? '/chw/patients' : user?.role === 'admin' ? '/admin/patients' : user?.role === 'patient' ? '/patient' : '/doctor/patients'} className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand">
        <ArrowLeft size={18} aria-hidden="true" /> {t('backToPatients')}
      </Link>
      <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-emerald-50 text-brand"><UserRound size={28} aria-hidden="true" /></span>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-brand">{t('patientProfile')}</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">{name}</h1>
            <p className="mt-1 text-sm text-muted">{patient.user?.phone ?? patient.phone ?? t('noPhoneNumber')} · {t(patient.status === 'inactive' ? 'inactive' : 'active')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/reports/patient/${patient._id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 font-bold">Reports</Link>
          {user?.role === 'doctor' && (
            <button type="button" onClick={requestEmergencySupplies} disabled={droneRequesting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-red-300 px-4 font-bold text-red-800 disabled:opacity-60">
              {droneRequesting ? t('loading') : t('droneRequestSupplies')}
            </button>
          )}
          <Link to={`/patients/${patient._id}/edit`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 font-bold">
            <Edit3 size={18} aria-hidden="true" /> {t('editProfile')}
          </Link>
        </div>
      </div>
      {droneMission && (
        <p role="status" className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4 font-semibold text-blue-950">
          {t('droneMissionRequestedStatus', { status: t(`droneStatus${droneMission.status[0].toUpperCase()}${droneMission.status.slice(1)}`) })}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-lg font-bold text-ink">{t('personalHealthDetails')}</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-muted">{t('ageGender')}</dt><dd className="mt-1 font-semibold">{formatNumber(patient.age, i18n.language)} / {t(genderKey)}</dd></div>
            <div><dt className="text-sm text-muted">{t('conditions')}</dt><dd className="mt-1 font-semibold">{patient.conditions?.map((condition) => t(`condition${condition[0].toUpperCase()}${condition.slice(1)}`)).join(', ') || t('notRecorded')}</dd></div>
            <div><dt className="text-sm text-muted">{t('bloodGroup')}</dt><dd className="mt-1 font-semibold">{patient.bloodGroup ?? t('notRecorded')}</dd></div>
            <div className="sm:col-span-2"><dt className="text-sm text-muted">{t('villageMandalDistrict')}</dt><dd className="mt-1 font-semibold">{[patient.village, patient.mandal, patient.district].filter(Boolean).join(', ')}</dd></div>
            <div className="sm:col-span-2"><dt className="text-sm text-muted">{t('allergies')}</dt><dd className="mt-1 font-semibold">{patient.allergies?.map(({ name: allergy }) => allergy).join(', ') || t('noneRecorded')}</dd></div>
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-lg font-bold text-ink">{t('careTeamLocation')}</h2>
          <dl className="mt-4 grid gap-4">
            <div><dt className="text-sm text-muted">{t('assignedDoctor')}</dt><dd className="mt-1 font-semibold">{assignedName(patient.assignedDoctor, t)}</dd></div>
            <div><dt className="text-sm text-muted">{t('communityHealthWorker')}</dt><dd className="mt-1 font-semibold">{assignedName(patient.assignedChw, t)}</dd></div>
            <div>
              <dt className="text-sm text-muted">{t('nearestHealthCentre')}</dt>
              <dd className="mt-1 flex items-start gap-2 font-semibold">
                <MapPin size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                {patient.nearestHealthCentre?.name ?? t('notLinked')}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border border-border bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{t('latestReading')}</h2>
          {user?.role === 'patient' && (
            <Link to="/patient/history" className="text-sm font-bold text-brand">
              {t('viewReadingHistory')}
            </Link>
          )}
        </div>
        {patient.latestReading ? (
          <p className="mt-2 text-sm text-muted">
            <span className="font-semibold text-ink">{t(vitalLabels[patient.latestReading.type] ?? patient.latestReading.type)}</span>
            {' · '}{t(`server${patient.latestReading.status[0].toUpperCase()}${patient.latestReading.status.slice(1)}`)}
            {' · '}{patient.latestReading.type === 'bp'
              ? `${formatNumber(patient.latestReading.values?.systolic, i18n.language)}/${formatNumber(patient.latestReading.values?.diastolic, i18n.language)} mmHg`
              : `${formatNumber(patient.latestReading.values?.value, i18n.language)} ${patient.latestReading.values?.unit ?? ''}`}
            {' · '}{formatDateTime(patient.latestReading.recordedAt, i18n.language)}
          </p>
        ) : <p className="mt-2 text-sm text-muted">{t('noReadingsRecordedYet')}</p>}
      </section>

      {user?.role === 'doctor' && (
        <Suspense fallback={        <p className="mt-5 rounded-xl bg-white p-4 text-muted">{t('loadingDoctorWorkspace')}</p>}>
          <DoctorPatientWorkspace patient={patient} />
        </Suspense>
      )}

      {isAdmin && (
        <section className="mt-4 grid gap-5 rounded-2xl border border-border bg-white p-5 sm:grid-cols-2">
          <form onSubmit={saveAssignments} className="grid gap-3 sm:col-span-2 sm:grid-cols-3 sm:items-end">
            <label className="grid gap-1 text-sm font-semibold">{t('doctor')}
              <select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} className="min-h-12 rounded-xl border border-border px-3">
                <option value="">{t('unassigned')}</option>
                {staff.doctors.map((doctor) => <option key={doctor._id} value={doctor._id}>{doctor.user?.name ?? doctor.registrationNo}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">{t('communityHealthWorker')}
              <select value={chwId} onChange={(event) => setChwId(event.target.value)} className="min-h-12 rounded-xl border border-border px-3">
                <option value="">{t('unassigned')}</option>
                {staff.chws.map((chw) => <option key={chw._id} value={chw._id}>{chw.user?.name ?? chw.employeeId}</option>)}
              </select>
            </label>
            <button type="submit" disabled={saving} className="min-h-12 rounded-xl bg-brand px-4 font-bold text-white disabled:opacity-60">{saving ? t('saving') : t('saveAssignments')}</button>
          </form>
          {patient.status === 'active' && (
            <div className="sm:col-span-2">
              <button type="button" onClick={deactivate} className="min-h-11 rounded-xl border border-red-300 px-4 font-bold text-red-800">{t('deactivatePatient')}</button>
              <p className="mt-2 text-xs text-muted">{t('deactivationDisablesAccess')}</p>
            </div>
          )}
        </section>
      )}
    </section>
  )
}
