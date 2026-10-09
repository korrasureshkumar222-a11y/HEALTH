export function DashboardSkeleton({ label }) {
  return (
    <section className="mt-5" role="status" aria-label={label} aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="ui-card min-h-36 p-4">
            <div className="skeleton size-10 rounded-xl" aria-hidden="true" />
            <div className="skeleton mt-4 h-4 w-2/3 rounded" aria-hidden="true" />
            <div className="skeleton mt-3 h-7 w-1/2 rounded" aria-hidden="true" />
            <div className="skeleton mt-3 h-3 w-3/4 rounded" aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="ui-card h-36 p-4">
            <div className="skeleton h-5 w-1/2 rounded" aria-hidden="true" />
            <div className="skeleton mt-5 h-4 w-4/5 rounded" aria-hidden="true" />
            <div className="skeleton mt-3 h-4 w-2/3 rounded" aria-hidden="true" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function ListSkeleton({ label, rows = 4 }) {
  return (
    <div className="ui-card space-y-4 p-4" role="status" aria-label={label} aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
          <div className="skeleton size-11 shrink-0 rounded-full" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="skeleton h-4 w-2/5 rounded" aria-hidden="true" />
            <div className="skeleton mt-2 h-3 w-3/4 rounded" aria-hidden="true" />
          </div>
          <div className="skeleton h-8 w-20 rounded-full" aria-hidden="true" />
        </div>
      ))}
    </div>
  )
}
