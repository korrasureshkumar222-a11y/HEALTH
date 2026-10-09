import { z } from 'zod'

const clientIdSchema = z.string().uuid().transform((value) => value.toLowerCase())
const patientIdSchema = z.string().regex(/^[a-f\d]{24}$/i)
export const syncItemSchema = z.object({
  clientId: clientIdSchema,
  type: z.enum(['reading', 'sos', 'patient.create', 'patient.update', 'visit.create']),
  clientTimestamp: z.coerce.date().optional(),
  payload: z.unknown().refine((value) => value !== undefined, 'Payload is required.'),
}).strict()

export const syncBatchSchema = z.object({
  items: z.array(z.unknown()).min(1).max(100),
}).strict()

export const patientUpdateSyncSchema = z.object({
  patientId: patientIdSchema,
  changes: z.record(z.string(), z.unknown()),
}).strict()
