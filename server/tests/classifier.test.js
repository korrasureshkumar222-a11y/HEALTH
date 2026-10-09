import { classifyReading, defaultThresholds } from '../src/services/classifier.js'

function reading(type, values, options = {}) {
  return classifyReading({ type, values }, options).status
}

describe('reading classifier edge values', () => {
  test.each([
    [80, 60, 'warning'],
    [89, 59, 'warning'],
    [90, 60, 'normal'],
    [129, 84, 'normal'],
    [130, 85, 'warning'],
    [179, 119, 'warning'],
    [180, 84, 'critical'],
    [79, 84, 'critical'],
    [120, 120, 'critical'],
    [120, 49, 'critical'],
  ])('classifies BP %s/%s as %s', (systolic, diastolic, expected) => {
    expect(reading('bp', { systolic, diastolic, unit: 'mmHg' })).toBe(expected)
  })

  test.each([
    [53, 'critical'],
    [54, 'warning'],
    [69, 'warning'],
    [70, 'normal'],
    [125, 'normal'],
    [126, 'warning'],
    [249, 'warning'],
    [250, 'critical'],
  ])('classifies fasting glucose %s mg/dL as %s', (value, expected) => {
    expect(reading('sugar', { value, unit: 'mg/dL', sugarContext: 'fasting' })).toBe(expected)
  })

  test('leaves readings without approved classification rules unclassified', () => {
    expect(reading('sugar', { value: 160, unit: 'mg/dL', sugarContext: 'postMeal' })).toBe('unclassified')
    expect(reading('weight', { value: 64, unit: 'kg' })).toBe('unclassified')
    expect(reading('temperature', { value: 37, unit: '°C' })).toBe('unclassified')
  })

  test.each([
    [44, 'critical'],
    [45, 'unclassified'],
    [49, 'unclassified'],
    [59, 'warning'],
    [60, 'normal'],
    [100, 'normal'],
    [101, 'warning'],
    [129, 'warning'],
    [130, 'critical'],
  ])('classifies heart rate %s bpm as %s', (value, expected) => {
    expect(reading('heartRate', { value, unit: 'bpm' })).toBe(expected)
  })

  test.each([
    [90, 'critical'],
    [91, 'warning'],
    [94, 'warning'],
    [95, 'normal'],
    [100, 'normal'],
  ])('classifies SpO2 %s%% as %s', (value, expected) => {
    expect(reading('spo2', { value, unit: '%' })).toBe(expected)
  })

  test('supports configurable thresholds and records the configured ruleset version', () => {
    const result = classifyReading(
      { type: 'heartRate', values: { value: 111, unit: 'bpm' } },
      {
        rulesetVersion: 'clinic-2026-10',
        thresholds: {
          heartRate: {
            warning: { atOrAbove: 110 },
            critical: { atOrAbove: 140 },
          },
        },
      },
    )
    expect(result.status).toBe('warning')
    expect(result.rulesetVersion).toBe('clinic-2026-10')
    expect(result.classifiedAt).toBeInstanceOf(Date)
  })

  test('rejects unsupported measurement units and malformed threshold overrides', () => {
    expect(() => reading('heartRate', { value: 80, unit: 'mmHg' })).toThrow(
      expect.objectContaining({ code: 'INVALID_READING_UNIT' }),
    )
    expect(() => classifyReading(
      { type: 'heartRate', values: { value: 80, unit: 'bpm' } },
      { thresholds: { heartRate: { warning: { invalidKey: 1 } } } },
    )).toThrow(expect.objectContaining({ code: 'INVALID_READING_THRESHOLDS' }))
  })

  test('provides the illustrative defaults as a named configuration', () => {
    expect(defaultThresholds.bp.systolic.critical.atOrAbove).toBe(180)
  })
})
