import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Printer, Share2 } from 'lucide-react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../api/client.js'
import { listPatients, getOwnPatient } from '../api/patients.js'
import { downloadAdminReportsCsv, downloadPatientSummaryPdf, downloadReadingsCsv, getAdminReports, getPatientSummaryReport } from '../api/reports.js'
import { useAuth } from '../context/useAuth.js'
import { formatDateTime } from '../utils/formatDate.js'
import { useTranslation } from 'react-i18next'

const inputClass = 'min-h-touch rounded-xl border border-border bg-white px-3 text-sm'
const panelClass = 'rounded-2xl border border-border bg-white p-5 shadow-sm'

function rangeParams(from, to) {
  return {
    ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
  }
}

function Stat({ label, value }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>
}

function MiniChart({ readings }) {
  const chartType = readings.some((reading) => reading.type === 'bp') ? 'bp' : readings.at(-1)?.type
  const points = readings.filter((reading) => reading.type === chartType).slice(-30)
  const values = points.map((reading) => reading.type === 'bp' ? reading.values?.systolic : reading.values?.value).filter(Number.isFinite)
  if (values.length < 2) return <p className="text-sm text-muted">At least two readings are needed to draw a chart.</p>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const coords = values.map((value, index) => `${20 + index * 560 / (values.length - 1)},${130 - (value - min) * 100 / span}`).join(' ')
  return <svg role="img" aria-label={`Recent ${chartType} readings chart`} viewBox="0 0 600 160" className="h-44 w-full rounded-xl bg-slate-50">
    <polyline points={coords} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    {values.map((value, index) => <circle key={`${index}-${value}`} cx={20 + index * 560 / (values.length - 1)} cy={130 - (value - min) * 100 / span} r="3" fill="#0f766e" />)}
    <text x="20" y="150" fontSize="10" fill="#475569">{min}–{max}</text>
  </svg>
}

export default function ReportsPage() {
  const { patientId: routePatientId } = useParams()
  const { user } = useAuth()
  const { i18n, t } = useTranslation()
  const admin = user?.role === 'admin' && !routePatientId
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [patients, setPatients] = useState([])
  const [patientSearch, setPatientSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(routePatientId ?? '')
  const [summary, setSummary] = useState(null)
  const [adminData, setAdminData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = rangeParams(from, to)
      if (admin) {
        const report = await getAdminReports(params)
        setAdminData(report)
        const result = await listPatients({ page: 1, limit: 100, search: patientSearch })
        setPatients(result.items ?? [])
        setSummary(selectedPatient ? await getPatientSummaryReport(selectedPatient, params) : null)
      } else {
        let targetId = routePatientId || selectedPatient
        if (!targetId && user?.role === 'patient') {
          const own = await getOwnPatient()
          targetId = (own.patient ?? own)._id
          setSelectedPatient(targetId)
        }
        if (targetId) setSummary(await getPatientSummaryReport(targetId, params))
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Could not load reports.'))
    } finally {
      setLoading(false)
    }
  }, [admin, from, patientSearch, routePatientId, selectedPatient, to, user?.role])

  useEffect(() => { load() }, [load])

  const summaryText = useMemo(() => {
    if (!summary) return ''
    const patient = summary.patient
    const stats = Object.entries(summary.stats).map(([type, stat]) => `${type}: ${stat.count} readings, ${type === 'bp' ? `average ${stat.averageSystolic ?? 'n/a'}/${stat.averageDiastolic ?? 'n/a'}` : `average ${stat.average ?? 'n/a'}`}`).join('\n')
    return `${patient.user?.name ?? patient.name ?? 'Patient'} — ${patient.village}\n${stats}\n${summary.alerts.length} alerts, ${summary.medications.length} medications, ${summary.notes.length} notes`
  }, [summary])

  async function exportCsv() {
    try {
      const blob = await downloadReadingsCsv(selectedPatient || summary?.patient?._id || routePatientId, rangeParams(from, to))
      saveBlob(blob, `readings-${selectedPatient || summary?.patient?._id || 'patient'}.csv`)
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Could not export readings.'))
    }
  }

  async function exportPatientPdf() {
    try {
      const patientId = selectedPatient || summary?.patient?._id || routePatientId
      const blob = await downloadPatientSummaryPdf(patientId, {
        ...rangeParams(from, to),
        language: i18n.language?.startsWith('te') ? 'te' : 'en',
      })
      saveBlob(blob, `patient-summary-${patientId}.pdf`)
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Could not download patient PDF.'))
    }
  }

  async function shareReport() {
    setShareBusy(true)
    try {
      if (summary && navigator.share) {
        const patientId = selectedPatient || summary.patient._id || routePatientId
        const blob = await downloadPatientSummaryPdf(patientId, {
          ...rangeParams(from, to),
          language: i18n.language?.startsWith('te') ? 'te' : 'en',
        })
        const file = new File([blob], `patient-summary-${patientId}.pdf`, { type: 'application/pdf' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ title: 'Patient health summary', files: [file] })
          return
        }
      }
      if (navigator.share) await navigator.share({ title: 'Health report', text: adminData ? JSON.stringify(adminData, null, 2) : summaryText })
      else {
        await navigator.clipboard.writeText(adminData ? JSON.stringify(adminData, null, 2) : summaryText)
        toast.success('Report summary copied.')
      }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') toast.error('Could not share this report.')
    } finally {
      setShareBusy(false)
    }
  }

  async function downloadAdminReport() {
    try {
      const blob = await downloadAdminReportsCsv(rangeParams(from, to))
      saveBlob(blob, 'admin-health-reports.csv')
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Could not download admin reports.'))
    }
  }

  function printReport() {
    window.print()
  }

  const patient = summary?.patient
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
      <div><p className="text-sm font-semibold uppercase tracking-wide text-brand">Reports</p><h1 className="mt-1 text-3xl font-bold">{admin ? 'Administration reports' : 'Patient summary'}</h1></div>
      <div className="flex flex-wrap gap-2">
        {admin && <><input aria-label="Search patients" className={inputClass} placeholder="Search patients" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} /><select aria-label="Patient for summary" className={inputClass} value={selectedPatient} onChange={(event) => setSelectedPatient(event.target.value)}>
          <option value="">Select patient summary</option>{patients.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.village}</option>)}
        </select></>}
        <label className="sr-only" htmlFor="report-from">From</label><input id="report-from" className={inputClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <label className="sr-only" htmlFor="report-to">To</label><input id="report-to" className={inputClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <button className="min-h-touch rounded-xl bg-brand px-4 font-semibold text-white" onClick={load} type="button">Refresh</button>
      </div>
    </header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-900">{error}</p>}
    {loading && <p role="status" className="text-muted">Loading report…</p>}
    {adminData && <div className="space-y-5">
      <div className="flex justify-end gap-2 print:hidden"><button className="min-h-touch rounded-xl border border-border px-3" onClick={shareReport} type="button"><Share2 size={17} className="mr-1 inline" />{t('shareReport')}</button><button className="min-h-touch rounded-xl border border-border px-3" onClick={downloadAdminReport} type="button"><Download size={17} className="mr-1 inline" />{t('downloadCsv')}</button><button className="min-h-touch rounded-xl bg-brand px-3 text-white" onClick={printReport} type="button"><Printer size={17} className="mr-1 inline" />{t('printReport')}</button></div>
      <section className={panelClass}><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Patients per village</h2><span>{adminData.patientsPerVillage.reduce((sum, row) => sum + row.patients, 0)} active patients</span></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">District</th><th className="p-2">Mandal</th><th className="p-2">Village</th><th className="p-2">Patients</th></tr></thead><tbody>{adminData.patientsPerVillage.map((row) => <tr className="border-t border-border" key={`${row._id.district}-${row._id.mandal}-${row._id.village}`}><td className="p-2">{row._id.district ?? '—'}</td><td className="p-2">{row._id.mandal ?? '—'}</td><td className="p-2">{row._id.village}</td><td className="p-2">{row.patients}</td></tr>)}</tbody></table></div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={panelClass}><h2 className="text-xl font-bold">Critical alerts per week</h2><div className="mt-3 space-y-2">{adminData.criticalAlertsPerWeek.map((row) => <div className="flex justify-between rounded-lg bg-slate-50 p-3" key={row.weekStarting}><span>{formatDateTime(row.weekStarting, 'en')}</span><strong>{row.count}</strong></div>)}</div></section>
        <section className={panelClass}><h2 className="text-xl font-bold">CHW activity</h2><div className="mt-3 space-y-2">{adminData.chwActivity.map((row) => <div className="flex justify-between gap-4 rounded-lg bg-slate-50 p-3" key={row.chwId}><span>{row.name ?? row.employeeId ?? 'CHW'}</span><span>{row.completed}/{row.visits} completed · {row.missed} missed</span></div>)}</div></section>
        <section className={panelClass}><h2 className="text-xl font-bold">SOS response times</h2><p className="mt-3">Average response: <strong>{adminData.sosResponse.averageMinutes ?? '—'} min</strong> · {adminData.sosResponse.resolved}/{adminData.sosResponse.total} resolved</p></section>
        <section className={panelClass}><h2 className="text-xl font-bold">Drone missions</h2><p className="mt-3">{adminData.droneMissions.total} missions in range</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(adminData.droneMissions.byStatus).map(([status, count]) => <span key={status} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{status}: {count}</span>)}</div></section>
      </div>
    </div>}
    {summary && <article className="space-y-5 print:space-y-3">
      <section className={panelClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted">{formatDateTime(summary.period.from, 'en')} – {formatDateTime(summary.period.to, 'en')}</p><h2 className="mt-1 text-2xl font-bold">{patient?.user?.name ?? patient?.name}</h2><p>{patient?.age ?? '—'} · {patient?.gender ?? '—'} · {patient?.village}, {patient?.mandal}, {patient?.district}</p><p className="mt-1 text-sm">Conditions: {patient?.conditions?.join(', ') || '—'} · Doctor: {patient?.assignedDoctor?.user?.name ?? '—'}</p></div><div className="flex gap-2 print:hidden"><button className="min-h-touch rounded-xl border border-border px-3" onClick={exportCsv} type="button"><Download size={17} className="mr-1 inline" />{t('downloadCsv')}</button><button className="min-h-touch rounded-xl border border-border px-3" onClick={shareReport} type="button" disabled={shareBusy}><Share2 size={17} className="mr-1 inline" />{t('shareReport')}</button><button className="min-h-touch rounded-xl bg-brand px-3 text-white" onClick={exportPatientPdf} type="button"><Download size={17} className="mr-1 inline" />{t('downloadPdf')}</button></div></div></section>
      <section className={panelClass}><h2 className="text-xl font-bold">Vital statistics for selected period</h2><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{Object.entries(summary.stats).map(([type, stat]) => <Stat key={type} label={type} value={`${stat.count} · avg ${type === 'bp' ? `${stat.averageSystolic ?? '—'}/${stat.averageDiastolic ?? '—'}` : stat.average ?? '—'}`} />)}</div><div className="mt-4"><MiniChart readings={summary.readings} /></div></section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className={panelClass}><h2 className="text-xl font-bold">Alerts</h2>{summary.alerts.length ? summary.alerts.map((alert) => <p className="mt-2 border-t border-border pt-2" key={alert._id}><strong>{alert.severity}</strong> · {alert.message?.en} · {formatDateTime(alert.createdAt, 'en')}</p>) : <p className="mt-2 text-muted">No alerts in this period.</p>}</section>
        <section className={panelClass}><h2 className="text-xl font-bold">Medications</h2>{summary.medications.length ? summary.medications.map((med) => <p className="mt-2 border-t border-border pt-2" key={med._id}><strong>{med.name}</strong> · {med.dose} · {med.frequency} {med.active ? '· Active' : '· Inactive'}</p>) : <p className="mt-2 text-muted">No medication records.</p>}</section>
        <section className={`${panelClass} lg:col-span-2`}><h2 className="text-xl font-bold">Doctor and care team notes</h2>{summary.notes.length ? summary.notes.map((note) => <div className="mt-3 border-t border-border pt-3" key={note._id}><p className="text-xs text-muted">{note.author?.name} · {note.authorRole} · {formatDateTime(note.createdAt, 'en')}</p><p className="whitespace-pre-wrap">{note.body}</p></div>) : <p className="mt-2 text-muted">No notes in this period.</p>}</section>
      </div>
    </article>}
    <style>{`@media print { @page { margin: 14mm; } body { background: white !important; font-family: "Noto Sans Telugu", "Nirmala UI", "Gautami", sans-serif; } main { max-width: none !important; padding: 0 !important; } header, nav, .print\\:hidden { display: none !important; } .shadow-sm { box-shadow: none !important; } }`}</style>
  </div>
}
