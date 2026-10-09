import { z } from 'zod'

const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.array(z.number().finite()).length(2)
    .refine(([longitude]) => longitude >= -180 && longitude <= 180)
    .refine(([, latitude]) => latitude >= -90 && latitude <= 90),
}).strict()

const uuidSchema = z.string().uuid().transform((value) => value.toLowerCase())
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i)

export const createSosSchema = z.object({
  clientId: uuidSchema,
  location: pointSchema.optional(),
  patientId: objectIdSchema.optional(),
}).strict()

export const sosParamsSchema = z.object({ incidentId: objectIdSchema }).strict()

export const updateSosStatusSchema = z.object({
  status: z.enum(['doctorNotified', 'chwNotified', 'ambulanceRequested', 'droneRequested', 'resolved']),
  note: z.string().trim().min(3).max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === 'resolved' && !value.note) {
    context.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'A resolution note is required.',
    })
  }
})
