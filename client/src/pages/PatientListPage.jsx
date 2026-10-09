import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { listPatients } from '../api/patients.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../context/useAuth.js'
import { useTranslation } from 'react-i18next'

function PatientStatus({ status, risk, t }) {
  const color = risk === 'critical'
    ? 'bg-red-100 text-red-800'
    : risk === 'warning'
      ? 'bg-amber-100 text-amber-900'
      : 'bg-green-100 text-green-800'
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${color}`}>
      {risk
        ? t(`risk${risk[0].toUpperCase()}${risk.slice(1)}`)
        : t(status === 'inactive' ? 'inactive' : status === 'active' ? 'active' : 'riskUnclassified')}
    </span>
  )
}

export default function PatientListPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [filters, setFilters] = useState({ search: '', village: '', condition: '', risk: '', status: '' })
  const [query, setQuery] = useState({ page: 1, limit: 20 })
  const [result, setResult] = useState({ items: [], total: 0, hasMore: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const canCreate = ['chw', 'admin'].includes(user?.role)

  useEffect(() => {
    let active = true
    listPatients({ ...query, ...filters })
      .then((data) => {
        if (active) setResult(data)
      })
      .catch((requestError) => {
        if (active) setError(getApiErrorMessage(requestError, t('patientsLoadFailed')))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [query, filters, reload, t])

  function applyFilters(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setFilters({
      search: String(formData.get('search') ?? '').trim(),
      village: String(formData.get('village') ?? '').trim(),
      condition: String(formData.get('condition') ?? ''),
      risk: String(formData.get('risk') ?? ''),
      status: String(formData.get('status') ?? ''),
    })
    setLoading(true)
    setError('')
    setQuery((current) => ({ ...current, page: 1 }))
  }

  const patientHref = (patientId) => `/patients/${patientId}`

  return (
    <section className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">{t('careTeam')}</p>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{t('patients')}</h1>
          <p className="mt-2 text-base text-muted">{t('patientRecordsAvailable')}</p>
        </div>
        {canCreate && (
          <Link
            to="/patients/new"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark"
          >
            <UserPlus size={20} aria-hidden="true" />
            {t('registerPatient')}
          </Link>
        )}
      </div>

      <form onSubmit={applyFilters} className="mt-6 grid gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-semibold text-ink">
          {t('searchPatient')}
          <span className="relative">
            <Search className="absolute left-3 top-3.5 text-muted" size={18} aria-hidden="true" />
            <input name="search" defaultValue={filters.search} className="min-h-12 w-full rounded-xl border border-border pl-10 pr-3" />
          </span>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-ink">
          {t('village')}
          <input name="village" defaultValue={filters.village} className="min-h-12 rounded-xl border border-border px-3" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-ink">
          {t('condition')}
          <select name="condition" defaultValue={filters.condition} className="min-h-12 rounded-xl border border-border px-3">
            <option value="">{t('allConditions')}</option>
            <option value="diabetes">{t('conditionDiabetes')}</option>
            <option value="hypertension">{t('conditionHypertension')}</option>
            <option value="cardiac">{t('conditionCardiac')}</option>
            <option value="other">{t('conditionOther')}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-ink">
          {t('latestReadingRisk')}
          <select name="risk" defaultValue={filters.risk} className="min-h-12 rounded-xl border border-border px-3">
            <option value="">{t('allRiskLevels')}</option>
            <option value="critical">{t('riskCritical')}</option>
            <option value="warning">{t('riskWarning')}</option>
            <option value="normal">{t('riskNormal')}</option>
            <option value="unclassified">{t('riskUnclassified')}</option>
          </select>
        </label>
        {user?.role === 'admin' && (
          <label className="grid gap-1 text-sm font-semibold text-ink">
            {t('patientStatus')}
            <select name="status" defaultValue={filters.status} className="min-h-12 rounded-xl border border-border px-3">
              <option value="">{t('active')}</option>
              <option value="inactive">{t('inactive')}</option>
            </select>
          </label>
        )}
        <button type="submit" className="min-h-12 rounded-xl bg-slate-900 px-5 font-bold text-white sm:col-span-2 lg:col-span-4">
          {t('applyFilters')}
        </button>
      </form>

      <div className="mt-5" aria-live="polite">
        {loading && <p className="rounded-xl bg-white p-5 text-muted">{t('loadingPatients')}</p>}
        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p>{error}</p>
            <button type="button" className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold" onClick={() => { setLoading(true); setError(''); setReload((value) => value + 1) }}>
              {t('tryAgain')}
            </button>
          </div>
        )}
        {!loading && !error && result.items.length === 0 && (
          <div className="rounded-2xl border border-border bg-white p-8 text-center">
            <h2 className="text-lg font-bold text-ink">{t('noPatientsFound')}</h2>
            <p className="mt-2 text-muted">{t('changePatientFilters')}</p>
          </div>
        )}
        {!loading && !error && result.items.length > 0 && (
          <>
            <p className="mb-3 text-sm text-muted">{t('patientCount', { count: result.total })}</p>
            <div className="hidden overflow-x-auto rounded-2xl border border-border bg-white shadow-sm md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                  <tr><th className="px-5 py-4">{t('patient')}</th><th className="px-5 py-4">{t('village')}</th><th className="px-5 py-4">{t('conditions')}</th><th className="px-5 py-4">{t('latestReadingRisk')}</th><th className="px-5 py-4"><span className="sr-only">{t('open')}</span></th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.items.map((patient) => (
                    <tr key={patient._id}>
                      <td className="px-5 py-4"><Link className="font-bold text-brand underline-offset-4 hover:underline" to={patientHref(patient._id)}>{patient.name || t('patient')}</Link><p className="mt-1 text-muted">{patient.phone}</p></td>
                      <td className="px-5 py-4">{[patient.village, patient.mandal, patient.district].filter(Boolean).join(', ')}</td>
                      <td className="px-5 py-4">{patient.conditions?.map((condition) => t(`condition${condition[0].toUpperCase()}${condition.slice(1)}`)).join(', ') || t('notRecorded')}</td>
                      <td className="px-5 py-4"><PatientStatus status={patient.status} risk={patient.latestReading?.status} t={t} /></td>
                      <td className="px-5 py-4 text-right"><Link className="font-bold text-brand" to={patientHref(patient._id)}>{t('view')}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:hidden">
              {result.items.map((patient) => (
                <Link key={patient._id} to={patientHref(patient._id)} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="font-bold text-ink">{patient.name || t('patient')}</h2><p className="mt-1 text-sm text-muted">{patient.phone}</p></div>
                    <PatientStatus status={patient.status} risk={patient.latestReading?.status} t={t} />
                  </div>
                  <p className="mt-3 text-sm text-muted">{[patient.village, patient.mandal, patient.district].filter(Boolean).join(', ')}</p>
                  <p className="mt-2 text-sm">{patient.conditions?.map((condition) => t(`condition${condition[0].toUpperCase()}${condition.slice(1)}`)).join(', ') || t('noConditionsRecorded')}</p>
                </Link>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <button type="button" disabled={query.page <= 1} onClick={() => { setLoading(true); setQuery((current) => ({ ...current, page: current.page - 1 })) }} className="min-h-11 rounded-xl border border-border bg-white px-4 font-semibold disabled:opacity-50">{t('previous')}</button>
              <span className="text-sm text-muted">{t('pageNumber', { page: result.page })}</span>
              <button type="button" disabled={!result.hasMore} onClick={() => { setLoading(true); setQuery((current) => ({ ...current, page: current.page + 1 })) }} className="min-h-11 rounded-xl border border-border bg-white px-4 font-semibold disabled:opacity-50">{t('next')}</button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
