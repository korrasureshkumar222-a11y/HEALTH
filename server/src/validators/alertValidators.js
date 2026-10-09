import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i)

export const alertListQuerySchema = z.object({
  patientId: objectId.optional(),
  status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  type: z.enum(['critical_reading', 'warning_reading', 'missed_reading', 'sos', 'medication_missed']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict().refine(
  ({ from, to }) => !from || !to || new Date(from) <= new Date(to),
  { path: ['to'], message: 'The end date must be on or after the start date.' },
)

export const alertParamsSchema = z.object({ alertId: objectId }).strict()

export const acknowledgeAlertSchema = z.object({
  note: z.string().trim().max(1000).optional(),
}).strict()

export const resolveAlertSchema = z.object({
  resolutionNote: z.string().trim().min(3).max(1000),
}).strict()
