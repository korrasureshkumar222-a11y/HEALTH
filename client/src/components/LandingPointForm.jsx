import { useState } from 'react'
import { Camera, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { compressLandingPhoto } from '../utils/compressLandingPhoto.js'

const emptyChecklist = {
  clearArea: false,
  minimumAreaConfirmed: false,
  noOverheadWiresOrTrees: false,
  awayFromCrowds: false,
  contactAvailable: false,
}

const checklistItems = [
  ['clearArea', 'droneChecklistClearArea'],
  ['minimumAreaConfirmed', 'droneChecklistMinimumArea'],
  ['noOverheadWiresOrTrees', 'droneChecklistNoObstructions'],
  ['awayFromCrowds', 'droneChecklistAwayFromCrowds'],
  ['contactAvailable', 'droneChecklistContactAvailable'],
]

export default function LandingPointForm({ onSubmit, assignedVillages }) {
  const { t } = useTranslation()
  const isVillageRestricted = Array.isArray(assignedVillages)
  const villages = assignedVillages ?? []
  const [busy, setBusy] = useState(false)
  const [photos, setPhotos] = useState([])
  const [form, setForm] = useState({
    village: '',
    mandal: '',
    district: '',
    name: '',
    surfaceType: 'open_ground',
    contactPerson: '',
    phone: '',
    contactLanguage: 'en',
    longitude: '',
    latitude: '',
    obstructionsNotes: '',
    checklist: { ...emptyChecklist },
  })

  async function captureGps() {
    if (!navigator.geolocation) {
      toast.error(t('droneGpsUnavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setForm((previous) => ({
        ...previous,
        longitude: String(coords.longitude),
        latitude: String(coords.latitude),
      })),
      () => toast.error(t('droneGpsUnavailable')),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  async function selectPhotos(event) {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (selected.length > 2) {
      toast.error(t('dronePhotoLimit'))
      return
    }
    try {
      const compressed = await Promise.all(selected.map(compressLandingPhoto))
      setPhotos(compressed)
    } catch {
      toast.error(t('dronePhotoCompressionFailed'))
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const saved = await onSubmit({
        ...form,
        village: form.village.trim(),
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim(),
        phone: form.phone.trim(),
        obstructionsNotes: form.obstructionsNotes.trim(),
        photos,
        location: {
          type: 'Point',
          coordinates: [Number(form.longitude), Number(form.latitude)],
        },
      })
      if (saved === false) return
      setForm({
        village: '',
        mandal: '',
        district: '',
        name: '',
        surfaceType: 'open_ground',
        contactPerson: '',
        phone: '',
        contactLanguage: 'en',
        longitude: '',
        latitude: '',
        obstructionsNotes: '',
        checklist: { ...emptyChecklist },
      })
      setPhotos([])
    } finally {
      setBusy(false)
    }
  }

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="h-fit space-y-3 rounded-2xl border border-border bg-white p-5">
      <h2 className="text-xl font-extrabold">{t('droneAddLandingPoint')}</h2>
      <label className="block text-sm font-bold">{t('droneVillage')}
        {isVillageRestricted ? (
          <select
            required
            value={form.village ? String(villages.findIndex(({ village, mandal, district }) => (
              village === form.village && mandal === form.mandal && district === form.district
            ))) : ''}
            onChange={(event) => {
              const selected = villages[Number(event.target.value)]
              setForm((previous) => ({
                ...previous,
                village: selected?.village ?? '',
                mandal: selected?.mandal ?? '',
                district: selected?.district ?? '',
              }))
            }}
            className="mt-1 min-h-12 w-full rounded-xl border border-border bg-white px-3"
          >
            <option value="">{t('droneSelectAssignedVillage')}</option>
            {villages.map(({ village, mandal, district }, index) => (
              <option key={`${district ?? ''}|${mandal ?? ''}|${village}|${index}`} value={index}>
                {[village, mandal, district].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        ) : (
          <input required maxLength="120" value={form.village} onChange={(event) => updateField('village', event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-border px-3" />
        )}
      </label>
      {!isVillageRestricted && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold">{t('mandal')}
            <input maxLength="120" value={form.mandal} onChange={(event) => updateField('mandal', event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-border px-3" />
          </label>
          <label className="text-sm font-bold">{t('district')}
            <input maxLength="120" value={form.district} onChange={(event) => updateField('district', event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-border px-3" />
          </label>
        </div>
      )}
      <label className="block text-sm font-bold">{t('dronePointName')}
        <input required maxLength="160" value={form.name} onChange={(event) => updateField('name', event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-border px-3" />
      </label>
      <label className="block text-sm font-bold">{t('droneSurfaceType')}
        <select value={form.surfaceType} onChange={(event) => updateField('surfaceType', event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-border bg-white px-3">
          <option value="open_ground">{t('droneSurfaceOpenGround')}</option>
          <option value="field">{t('droneSurfaceField')}</option>
          <option value="other">{t('droneSurfaceOther')}</option>
        </select>
      </label>
      <label className="block text-sm font-bold">{t('droneContactPerson')}
        <input required maxLength="120" value={form.contactPerson} onChange={(event) => updateField('contactPerson', event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-border px-3" />
      </label>
      <label className="block text-sm font-bold">{t('phoneNumber')}
        <input required inputMode="tel" maxLength="30" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-border px-3" />
      </label>
      <label className="block text-sm font-bold">{t('droneContactLanguage')}
        <select value={form.contactLanguage} onChange={(event) => updateField('contactLanguage', event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-border bg-white px-3">
          <option value="en">{t('languageEnglish')}</option>
          <option value="te">{t('languageTelugu')}</option>
        </select>
      </label>
      <button type="button" onClick={captureGps} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand px-3 font-bold text-brand">
        <MapPin size={18} aria-hidden="true" />{t('droneCaptureGps')}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-bold">{t('longitude')}
          <input required type="number" step="any" min="-180" max="180" value={form.longitude} onChange={(event) => updateField('longitude', event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-border px-3" />
        </label>
        <label className="text-sm font-bold">{t('latitude')}
          <input required type="number" step="any" min="-90" max="90" value={form.latitude} onChange={(event) => updateField('latitude', event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-border px-3" />
        </label>
      </div>
      <label className="block text-sm font-bold">{t('droneObstructionsNotes')}
        <textarea maxLength="2000" value={form.obstructionsNotes} onChange={(event) => updateField('obstructionsNotes', event.target.value)} className="mt-1 min-h-20 w-full rounded-xl border border-border p-3" />
      </label>
      <label className="block text-sm font-bold">
        <span className="inline-flex items-center gap-2"><Camera size={18} aria-hidden="true" />{t('droneSitePhotos')}</span>
        <span className="mt-1 block font-normal text-muted">{t('dronePhotoCompressionHint')}</span>
        <input type="file" accept="image/*" multiple onChange={selectPhotos} className="mt-2 block min-h-12 w-full rounded-xl border border-border p-2 text-sm" />
      </label>
      {photos.length > 0 && (
        <ul className="flex gap-3" aria-label={t('droneSitePhotos')}>
          {photos.map((photo, index) => (
            <li key={photo}>
              <img src={photo} alt={t('dronePhotoPreview', { number: index + 1 })} className="size-20 rounded-lg border border-border object-cover" />
            </li>
          ))}
        </ul>
      )}
      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-bold">{t('droneSiteChecklist')}</legend>
        <div className="grid gap-2">
          {checklistItems.map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.checklist[key]}
                onChange={(event) => setForm((previous) => ({
                  ...previous,
                  checklist: { ...previous.checklist, [key]: event.target.checked },
                }))}
                className="size-5 accent-green-700"
              />
              {t(label)}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs leading-5 text-muted">{t('droneVerificationRequired')}</p>
      <button type="submit" disabled={busy || (isVillageRestricted && villages.length === 0)} className="min-h-12 w-full rounded-xl bg-brand px-4 font-extrabold text-white disabled:opacity-50">
        {busy ? t('saving') : t('droneSaveLandingPoint')}
      </button>
    </form>
  )
}
