import { z } from 'zod'

const uuidSchema = z.string().uuid().transform((uuid) => uuid.toLowerCase())
const patientIdSchema = z.string().regex(/^[a-f\d]{24}$/i)
const positiveMeasurement = z.number().finite().nonnegative()

const readingInputSchema = z.object({
  patientId: patientIdSchema.optional(),
  type: z.enum(['bp', 'sugar', 'heartRate', 'weight', 'spo2', 'temperature']),
  values: z.object({
    systolic: positiveMeasurement.optional(),
    diastolic: positiveMeasurement.optional(),
    value: positiveMeasurement.optional(),
    unit: z.string().trim().min(1).max(24),
    sugarContext: z.enum(['fasting', 'postMeal', 'random']).optional(),
  }).strict(),
  recordedAt: z.coerce.date(),
  clientId: uuidSchema,
  notes: z.string().trim().max(1000).optional(),
}).strict().superRefine((reading, context) => {
  const { type, values } = reading
  const issue = (path, message) => context.addIssue({
    code: 'custom',
    path,
    message,
  })

  if (type === 'bp') {
    if (values.systolic == null) issue(['values', 'systolic'], 'Systolic pressure is required.')
    if (values.diastolic == null) issue(['values', 'diastolic'], 'Diastolic pressure is required.')
    if (values.unit !== 'mmHg') issue(['values', 'unit'], 'Blood pressure must use mmHg.')
    if (values.value != null || values.sugarContext != null) {
      issue(['values'], 'Blood pressure cannot include scalar value or sugar context.')
    }
    return
  }

  if (values.value == null) issue(['values', 'value'], 'A scalar measurement value is required.')
  if (values.systolic != null || values.diastolic != null) {
    issue(['values'], 'Scalar measurements cannot include blood pressure fields.')
  }

  const units = {
    sugar: ['mg/dL'],
    heartRate: ['bpm'],
    weight: ['kg'],
    spo2: ['%'],
    temperature: ['°C', '°F'],
  }
  if (!units[type].includes(values.unit)) {
    issue(['values', 'unit'], `Unsupported unit for ${type} readings.`)
  }
  if (type === 'sugar' && !values.sugarContext) {
    issue(['values', 'sugarContext'], 'Choose fasting, postMeal, or random context.')
  }
  if (type !== 'sugar' && values.sugarContext != null) {
    issue(['values', 'sugarContext'], 'Sugar context is only valid for glucose readings.')
  }
})

export const createReadingSchema = readingInputSchema

export const bulkReadingsSchema = z.object({
  batchId: uuidSchema.optional(),
  items: z.array(z.unknown()).min(1).max(100),
}).strict()

export const readingListQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  type: z.enum(['bp', 'sugar', 'heartRate', 'weight', 'spo2', 'temperature']).optional(),
  status: z.enum(['normal', 'warning', 'critical', 'unclassified']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict().refine(
  ({ from, to }) => !from || !to || new Date(from) <= new Date(to),
  { path: ['to'], message: 'The end date must be on or after the start date.' },
)

export const readingSeriesQuerySchema = z.object({
  type: z.enum(['bp', 'sugar', 'heartRate', 'weight', 'spo2', 'temperature']),
  range: z.enum(['7d', '30d', '90d']).default('30d'),
}).strict()

export const deleteReadingSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict()
