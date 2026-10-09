import { z } from 'zod'
import { env } from '../config/env.js'
import ApiError from '../utils/ApiError.js'

const metricSchema = z.object({
  critical: z.object({
    below: z.number().finite().optional(),
    atOrAbove: z.number().finite().optional(),
  }).strict().optional(),
  warning: z.object({
    below: z.number().finite().optional(),
    min: z.number().finite().optional(),
    atOrAbove: z.number().finite().optional(),
    max: z.number().finite().optional(),
  }).strict().optional(),
  normal: z.object({
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  }).strict().optional(),
}).strict().superRefine((thresholds, context) => {
  if (thresholds.normal?.min !== undefined
    && thresholds.normal.max !== undefined
    && thresholds.normal.min > thresholds.normal.max) {
    context.addIssue({ code: 'custom', path: ['normal'], message: 'Normal minimum must not exceed maximum.' })
  }
  if (thresholds.warning?.min !== undefined
    && thresholds.warning.below !== undefined
    && thresholds.warning.min >= thresholds.warning.below) {
    context.addIssue({ code: 'custom', path: ['warning'], message: 'Warning lower bound must be below its upper bound.' })
  }
  if (thresholds.warning?.atOrAbove !== undefined
    && thresholds.warning.max !== undefined
    && thresholds.warning.atOrAbove > thresholds.warning.max) {
    context.addIssue({ code: 'custom', path: ['warning'], message: 'Warning upper bound must not exceed its maximum.' })
  }
})

const thresholdsSchema = z.object({
  bp: z.object({ systolic: metricSchema.optional(), diastolic: metricSchema.optional() }).strict().optional(),
  sugar: z.object({ fasting: metricSchema }).strict().optional(),
  heartRate: metricSchema.optional(),
  spo2: metricSchema.optional(),
}).strict()

const defaultThresholds = Object.freeze({
  bp: {
    systolic: {
      critical: { below: 80, atOrAbove: 180 },
      warning: { below: 90, atOrAbove: 130 },
      normal: { min: 90, max: 129 },
    },
    diastolic: {
      critical: { below: 50, atOrAbove: 120 },
      warning: { below: 60, atOrAbove: 85 },
      normal: { min: 60, max: 84 },
    },
  },
  sugar: {
    fasting: {
      critical: { below: 54, atOrAbove: 250 },
      warning: { below: 70, atOrAbove: 126 },
      normal: { min: 70, max: 125 },
    },
  },
  heartRate: {
    critical: { below: 45, atOrAbove: 130 },
    warning: { below: 60, min: 50, atOrAbove: 101, max: 129 },
    normal: { min: 60, max: 100 },
  },
  spo2: {
    critical: { atOrAbove: undefined, below: 91 },
    warning: { below: 95, min: 91 },
    normal: { min: 95 },
  },
})

function mergeThresholds(base, overrides) {
  const result = structuredClone(base)
  for (const [metric, config] of Object.entries(overrides)) {
    if (metric === 'bp' || metric === 'sugar') {
      for (const [context, contextConfig] of Object.entries(config)) {
        result[metric][context] = {
          ...result[metric][context],
          ...contextConfig,
          critical: { ...result[metric][context].critical, ...contextConfig.critical },
          warning: { ...result[metric][context].warning, ...contextConfig.warning },
          normal: { ...result[metric][context].normal, ...contextConfig.normal },
        }
      }
    } else {
      result[metric] = {
        ...result[metric],
        ...config,
        critical: { ...result[metric].critical, ...config.critical },
        warning: { ...result[metric].warning, ...config.warning },
        normal: { ...result[metric].normal, ...config.normal },
      }
    }
  }
  return result
}

function configuredThresholds() {
  if (!env.readingThresholdsJson) return defaultThresholds
  let overrides
  try {
    overrides = JSON.parse(env.readingThresholdsJson)
  } catch (error) {
    throw new ApiError(500, `Reading threshold configuration is invalid JSON: ${error.message}`, 'INVALID_READING_THRESHOLDS')
  }
  const parsed = thresholdsSchema.safeParse(overrides)
  if (!parsed.success) {
    throw new ApiError(500, 'Reading threshold configuration has an invalid shape.', 'INVALID_READING_THRESHOLDS')
  }
  return mergeThresholds(defaultThresholds, parsed.data)
}

function parseOverrides(overrides) {
  const parsed = thresholdsSchema.safeParse(overrides)
  if (!parsed.success) {
    throw new ApiError(500, 'Reading threshold overrides have an invalid shape.', 'INVALID_READING_THRESHOLDS')
  }
  return parsed.data
}

function classifyMetric(value, thresholds) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unclassified'
  if (thresholds.critical?.below !== undefined && value < thresholds.critical.below) return 'critical'
  if (thresholds.critical?.atOrAbove !== undefined && value >= thresholds.critical.atOrAbove) return 'critical'
  if (thresholds.warning?.below !== undefined
    && value < thresholds.warning.below
    && (thresholds.warning.min === undefined || value >= thresholds.warning.min)) return 'warning'
  if (thresholds.warning?.atOrAbove !== undefined
    && value >= thresholds.warning.atOrAbove
    && (thresholds.warning.max === undefined || value <= thresholds.warning.max)) return 'warning'
  const withinNormal = (thresholds.normal?.min === undefined || value >= thresholds.normal.min)
    && (thresholds.normal?.max === undefined || value <= thresholds.normal.max)
  return withinNormal ? 'normal' : 'unclassified'
}

const statusRank = { normal: 0, unclassified: 1, warning: 2, critical: 3 }

function worstStatus(statuses) {
  return statuses.reduce(
    (worst, status) => statusRank[status] > statusRank[worst] ? status : worst,
    'normal',
  )
}

function unitMatches(type, unit) {
  const expectedUnits = {
    bp: ['mmHg'],
    sugar: ['mg/dL'],
    heartRate: ['bpm'],
    weight: ['kg'],
    spo2: ['%'],
    temperature: ['°C', '°F'],
  }
  return expectedUnits[type]?.includes(unit) ?? false
}

export function classifyReading(reading, options = {}) {
  const { type, values } = reading
  if (!unitMatches(type, values?.unit)) {
    throw new ApiError(400, `Unit is not supported for ${type} readings.`, 'INVALID_READING_UNIT')
  }

  const overrides = options.thresholds
    ? parseOverrides(options.thresholds)
    : parseOverrides(configuredThresholds())
  const thresholds = mergeThresholds(defaultThresholds, overrides)
  let status = 'unclassified'

  if (type === 'bp') {
    status = worstStatus([
      classifyMetric(values.systolic, thresholds.bp.systolic),
      classifyMetric(values.diastolic, thresholds.bp.diastolic),
    ])
  } else if (type === 'sugar' && values.sugarContext === 'fasting') {
    status = classifyMetric(values.value, thresholds.sugar.fasting)
  } else if (type === 'heartRate' || type === 'spo2') {
    status = classifyMetric(values.value, thresholds[type])
  }

  return {
    status,
    rulesetVersion: options.rulesetVersion ?? env.readingRulesetVersion,
    classifiedAt: new Date(),
  }
}

export { defaultThresholds }
