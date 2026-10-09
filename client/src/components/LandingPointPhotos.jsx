import { useState } from 'react'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getLandingPoint } from '../api/drone.js'
import { getApiErrorMessage } from '../api/client.js'

export default function LandingPointPhotos({ point }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [photos, setPhotos] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function togglePhotos() {
    if (expanded) {
      setExpanded(false)
      return
    }
    if (photos) {
      setExpanded(true)
      return
    }
    setLoading(true)
    try {
      const result = await getLandingPoint(point._id)
      setPhotos(result.landingPoint.photos ?? [])
      setError('')
      setExpanded(true)
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t('dronePhotosLoadFailed')))
    } finally {
      setLoading(false)
    }
  }

  if (!point.photoCount) return null

  return (
    <div className="mt-2">
      <button type="button" disabled={loading} onClick={togglePhotos} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-bold">
        <Camera size={16} aria-hidden="true" />
        {loading ? t('loading') : t(expanded ? 'droneHidePhotos' : 'droneViewPhotos', { count: point.photoCount })}
      </button>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-800">{error}</p>}
      {expanded && (
        <ul className="mt-2 flex gap-2">
          {photos.map((photo, index) => (
            <li key={`${point._id}-photo-${index}`}>
              <img src={photo} alt={t('dronePhotoPreview', { number: index + 1 })} className="size-20 rounded-lg border border-border object-cover" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
