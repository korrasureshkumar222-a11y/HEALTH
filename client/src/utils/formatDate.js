export function getLocale(language = 'en') {
  return language === 'te' || language?.startsWith('te')
    ? 'te-IN'
    : 'en-IN'
}

export function formatNumber(value, language = 'en', options = {}) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat(getLocale(language), options).format(number)
}

export function formatDateTime(value, language = 'en') {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat(getLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
