import { z } from 'zod'

const objectId = z.string().regex(/^[a-f\d]{24}$/i)

export const patientIdParamsSchema = z.object({ patientId: objectId }).strict()
export const patientAndRecordParamsSchema = z.object({
  patientId: objectId,
  recordId: objectId,
}).strict()
export const patientIdAndAlertParamsSchema = z.object({
  patientId: objectId,
  alertId: objectId,
}).strict()
export const patientIdAndMedicationParamsSchema = z.object({
  patientId: objectId,
  medicationId: objectId,
}).strict()
export const emptyQuerySchema = z.object({}).strict()
export const emptyBodySchema = z.object({}).strict()
export const emptyParamsSchema = z.object({}).strict()
export const smsInboundSchema = z.record(z.string().min(1).max(100), z.string().max(2000))
  .superRefine((fields, context) => {
    if (!fields.From) context.addIssue({ code: 'custom', path: ['From'], message: 'Sender phone is required.' })
    if (typeof fields.Body !== 'string') context.addIssue({ code: 'custom', path: ['Body'], message: 'Message body is required.' })
    if (Object.keys(fields).length > 30) {
      context.addIssue({ code: 'custom', path: [], message: 'Too many SMS webhook fields.' })
    }
  })
