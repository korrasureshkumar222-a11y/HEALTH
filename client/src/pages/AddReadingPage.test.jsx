import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { offlineDb } from '../offline/db.js'
import { getPendingReadingCount } from '../offline/readingQueue.js'
import { createTestI18n, renderWithProviders } from '../test/renderWithProviders.jsx'

const mocks = vi.hoisted(() => ({
  isOnline: false,
  createReading: vi.fn(),
  requestBackgroundSync: vi.fn(),
  syncPendingItems: vi.fn(),
}))

vi.mock('../hooks/useOnlineStatus.js', () => ({ default: () => mocks.isOnline }))
vi.mock('../api/readings.js', () => ({ createReading: mocks.createReading }))
vi.mock('../offline/syncManager.js', () => ({
  requestBackgroundSync: mocks.requestBackgroundSync,
  syncPendingItems: mocks.syncPendingItems,
}))

const translations = {
  en: {
    readings: 'Readings',
    addReading: 'Add reading',
    addReadingDescription: 'Enter your latest health measurements.',
    measurementType: 'Measurement type',
    bloodPressure: 'Blood pressure',
    bloodSugar: 'Blood sugar',
    heartRate: 'Heart rate',
    weight: 'Weight',
    oxygenLevel: 'Oxygen level',
    enterMeasurementBelow: 'Enter measurement below',
    systolic: 'Systolic',
    diastolic: 'Diastolic',
    recordedAt: 'Date and time measured',
    readingDisclaimer: 'This reading does not replace medical advice.',
    readingPreviewCritical: 'Critical reading',
    readingPreviewDisclaimer: 'Contact your care team if you feel unwell.',
    measurementRequired: 'This measurement is required.',
    measurementMinimum: 'Enter at least {{min}}.',
    measurementMaximum: 'Enter no more than {{max}}.',
    saveReading: 'Save reading',
    savingReading: 'Saving reading',
    readingSavedOffline: 'Reading saved offline',
    readingQueuedDescription: 'It will sync when you are back online.',
    addAnotherReading: 'Add another reading',
    viewReadingHistory: 'View reading history',
  },
}

describe('AddReadingPage', () => {
  beforeEach(async () => {
    mocks.isOnline = false
    mocks.createReading.mockReset()
    mocks.requestBackgroundSync.mockReset().mockResolvedValue(undefined)
    mocks.syncPendingItems.mockReset().mockResolvedValue({ synced: 0 })
    await offlineDb.open()
    await offlineDb.pendingReadings.clear()
  })

  it('validates required vitals and queues a critical reading when offline', async () => {
    const [{ default: AddReadingPage }, i18n] = await Promise.all([
      import('./AddReadingPage.jsx'),
      createTestI18n(translations),
    ])
    renderWithProviders(<AddReadingPage />, {
      i18n,
      authValue: { user: { id: 'patient-user-1', role: 'patient' } },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }))
    expect(await screen.findAllByRole('alert')).toHaveLength(2)
    expect(mocks.createReading).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Systolic (mmHg)' }), {
      target: { value: '184' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Diastolic (mmHg)' }), {
      target: { value: '122' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }))

    expect(await screen.findByRole('heading', { name: 'Reading saved offline' })).toBeInTheDocument()
    await waitFor(async () => expect(await getPendingReadingCount('patient-user-1')).toBe(1))
    expect(mocks.requestBackgroundSync).toHaveBeenCalledOnce()
    expect(mocks.createReading).not.toHaveBeenCalled()
    const queued = await offlineDb.pendingReadings.toArray()
    expect(queued[0]).toMatchObject({
      type: 'bp',
      values: { systolic: 184, diastolic: 122 },
      status: 'pending',
      previewStatus: 'critical',
    })
    expect(queued[0].clientId).toBeTruthy()
  })
})
