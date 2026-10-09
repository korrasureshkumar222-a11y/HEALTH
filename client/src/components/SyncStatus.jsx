import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { useAuth } from '../context/useAuth.js'
import useOnlineStatus from '../hooks/useOnlineStatus.js'
import {
  getLastSyncedAt,
  getPendingCount,
  subscribeSyncUpdates,
  triggerSync,
} from '../offline/syncManager.js'

export default function SyncStatus() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const isOnline = useOnlineStatus()
  const [pending, setPending] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    const [count, lastSynced] = await Promise.all([
      getPendingCount(user?.id),
      getLastSyncedAt(user?.id),
    ])
    setPending(count)
    setLastSyncedAt(lastSynced)
  }, [user?.id])

  useEffect(() => {
    // Pull the IndexedDB snapshot when connecting the view to the sync event source.
    // eslint-disable-next-line react/set-state-in-effect
    refresh().catch((error) => console.error('Could not load offline sync status.', error))
    return subscribeSyncUpdates(() => {
      refresh().catch((error) => console.error('Could not refresh offline sync status.', error))
    })
  }, [refresh])

  async function syncNow() {
    setSyncing(true)
    try {
      const result = await triggerSync(user.id)
      if (result.pending) toast.error(t('syncSomeFailed', { count: result.pending }))
      else toast.success(t('syncComplete'))
      await refresh()
    } catch {
      toast.error(t('syncFailed'))
    } finally {
      setSyncing(false)
    }
  }

  const dateLabel = lastSyncedAt
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage === 'te' ? 'te-IN' : 'en-IN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(lastSyncedAt))
    : t('syncNever')

  return (
    <section className="mx-auto mt-3 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm sm:px-6" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`font-bold ${isOnline ? 'text-green-800' : 'text-amber-900'}`}>
          {isOnline ? t('online') : t('offline')}
        </span>
        <span className="text-muted">{t('syncPendingCount', { count: pending })}</span>
        <span className="text-muted">{t('syncLastSynced', { date: dateLabel })}</span>
      </div>
      <button
        type="button"
        onClick={syncNow}
        disabled={!isOnline || syncing || pending === 0}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-brand px-3 font-bold text-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw size={17} className={syncing ? 'animate-spin' : ''} aria-hidden="true" />
        {syncing ? t('syncing') : t('syncNow')}
      </button>
    </section>
  )
}
