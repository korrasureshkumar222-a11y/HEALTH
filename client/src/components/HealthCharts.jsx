import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getLocale, formatNumber } from '../utils/formatDate.js'

const RANGE_OPTIONS = ['7d', '30d', '90d']
const SERIES_COLORS = {
  systolic: '#0072B2',
  diastolic: '#D55E00',
  value: '#6A3D9A',
}

function toChartData(points, metrics) {
  return points.map((point) => {
    const row = { ...point }
    for (const metric of metrics) {
      row[`${metric}Average`] = point[metric]?.average
      row[`${metric}Min`] = point[metric]?.min
      row[`${metric}Max`] = point[metric]?.max
    }
    return row
  })
}

function formatDate(value, locale) {
  return new Intl.DateTimeFormat(getLocale(locale), { month: 'short', day: 'numeric' }).format(new Date(value))
}

function formatMeasurement(value, locale) {
  return formatNumber(value, locale, { maximumFractionDigits: 2 })
}

function ChartTooltip({ active, payload, locale, labels, metrics }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-lg border border-slate-300 bg-white p-3 text-sm shadow-lg">
      <p className="font-bold">{formatDate(point.at, locale)}</p>
      {metrics.map((metric) => (
        <div key={metric} className="mt-1">
          <p className="font-semibold">{labels[metric]}</p>
          <p>{labels.average}: {formatMeasurement(point[`${metric}Average`], locale)}</p>
          <p>{labels.lowest}: {formatMeasurement(point[`${metric}Min`], locale)} · {labels.highest}: {formatMeasurement(point[`${metric}Max`], locale)}</p>
        </div>
      ))}
      <p className="mt-1 text-slate-700">{labels.dailyCount}: {formatNumber(point.count, locale)}</p>
    </div>
  )
}

function TrendPlot({ points, metrics, labels, locale, references = null }) {
  const data = toChartData(points, metrics)
  return (
    <div className="h-64 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 18, left: -12, bottom: 4 }}>
          <CartesianGrid stroke="#D7DEE7" strokeDasharray="3 3" />
          <XAxis dataKey="at" tickFormatter={(value) => formatDate(value, locale)} minTickGap={24} />
          <YAxis width={48} tickFormatter={(value) => formatMeasurement(value, locale)} />
          <Tooltip content={<ChartTooltip locale={locale} labels={labels} metrics={metrics} />} />
          <Legend />
          {references}
          {metrics.map((metric) => (
            <Line
              key={metric}
              type="monotone"
              dataKey={`${metric}Average`}
              name={labels[metric]}
              stroke={SERIES_COLORS[metric]}
              strokeWidth={3}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BPChart({ points, labels, locale }) {
  return (
    <TrendPlot
      points={points}
      metrics={['systolic', 'diastolic']}
      labels={labels}
      locale={locale}
      references={(
        <>
          <ReferenceArea y1={90} y2={129} fill="#E6F4EA" fillOpacity={0.8} />
          <ReferenceArea y1={60} y2={84} fill="#E6F4EA" fillOpacity={0.8} />
        </>
      )}
    />
  )
}

export function SugarChart({ points, labels, locale }) {
  return (
    <TrendPlot
      points={points}
      metrics={['value']}
      labels={labels}
      locale={locale}
      references={(
        <>
          <ReferenceLine y={70} stroke="#5B6573" strokeDasharray="5 4" />
          <ReferenceLine y={125} stroke="#5B6573" strokeDasharray="5 4" />
        </>
      )}
    />
  )
}

export function HeartRateChart({ points, labels, locale }) {
  return (
    <TrendPlot
      points={points}
      metrics={['value']}
      labels={labels}
      locale={locale}
      references={<ReferenceArea y1={60} y2={100} fill="#E6F4EA" fillOpacity={0.8} />}
    />
  )
}

export function WeightChart({ points, labels, locale }) {
  return <TrendPlot points={points} metrics={['value']} labels={labels} locale={locale} />
}

export function SpO2Chart({ points, labels, locale }) {
  return (
    <TrendPlot
      points={points}
      metrics={['value']}
      labels={labels}
      locale={locale}
      references={<ReferenceLine y={95} stroke="#5B6573" strokeDasharray="5 4" />}
    />
  )
}

function TemperatureChart({ points, labels, locale }) {
  return <TrendPlot points={points} metrics={['value']} labels={labels} locale={locale} />
}

function Summary({ summary, type, labels, locale }) {
  const metrics = type === 'bp' ? ['systolic', 'diastolic'] : ['value']
  const percent = summary.percentInRange == null
    ? labels.notAvailable
    : `${formatNumber(summary.percentInRange, locale, { maximumFractionDigits: 1 })}%`
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => {
        const stats = summary[metric]
        return (
          <div key={metric} className="rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-bold">{labels[metric]}</p>
            <p className="mt-1 text-sm">{labels.average}: {formatMeasurement(stats?.average, locale)}</p>
            <p className="text-sm">{labels.highest}: {formatMeasurement(stats?.highest, locale)} · {labels.lowest}: {formatMeasurement(stats?.lowest, locale)}</p>
          </div>
        )
      })}
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="text-sm font-bold">{labels.percentInRange}</p>
        <p className="mt-1 text-lg font-extrabold">{percent}</p>
        <p className="text-xs text-muted">{labels.readingCount}: {formatNumber(summary.totalReadings, locale)}</p>
      </div>
    </div>
  )
}

function DataTable({ points, type, labels, locale }) {
  const metrics = type === 'bp' ? ['systolic', 'diastolic'] : ['value']
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">{labels.dataTableCaption}</caption>
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-3 py-2">{labels.date}</th>
            {metrics.map((metric) => (
              <th scope="col" key={metric} className="px-3 py-2">{labels[metric]} ({labels.min}/{labels.averageShort}/{labels.max})</th>
            ))}
            <th scope="col" className="px-3 py-2">{labels.dailyCount}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {points.map((point) => (
            <tr key={point.at}>
              <th scope="row" className="whitespace-nowrap px-3 py-2 font-semibold">{formatDate(point.at, locale)}</th>
              {metrics.map((metric) => (
                <td key={metric} className="whitespace-nowrap px-3 py-2">
                  {formatMeasurement(point[metric]?.min, locale)} / {formatMeasurement(point[metric]?.average, locale)} / {formatMeasurement(point[metric]?.max, locale)}
                </td>
              ))}
              <td className="px-3 py-2">{formatNumber(point.count, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function HealthChartPanel({
  type,
  points = [],
  summary,
  range,
  onRangeChange,
  loading,
  error,
  labels,
  locale,
}) {
  const Chart = {
    bp: BPChart,
    sugar: SugarChart,
    heartRate: HeartRateChart,
    weight: WeightChart,
    spo2: SpO2Chart,
    temperature: TemperatureChart,
  }[type]

  return (
    <div className="mt-4">
      <fieldset>
        <legend className="text-sm font-semibold">{labels.range}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              onClick={() => onRangeChange(option)}
              className={`min-h-11 min-w-20 rounded-lg border px-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${range === option ? 'border-brand bg-blue-50 text-blue-950' : 'border-border bg-white'}`}
            >
              {labels[option]}
            </button>
          ))}
        </div>
      </fieldset>
      {loading && <p className="mt-4 rounded-xl bg-slate-50 p-4" role="status">{labels.loading}</p>}
      {!loading && error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900" role="alert">{error}</p>}
      {!loading && !error && points.length === 0 && <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-muted">{labels.empty}</p>}
      {!loading && !error && points.length > 0 && (
        <>
          <p className="sr-only" id="health-chart-description">{labels.chartDescription}</p>
          <figure className="mt-4" aria-describedby="health-chart-description">
            <figcaption className="sr-only">{labels.chartDescription}</figcaption>
            <Chart points={points} labels={labels} locale={locale} />
          </figure>
          {summary && <Summary summary={summary} type={type} labels={labels} locale={locale} />}
          <DataTable points={points} type={type} labels={labels} locale={locale} />
          <p className="mt-3 text-xs text-muted">{labels.referenceDisclaimer}</p>
        </>
      )}
    </div>
  )
}
