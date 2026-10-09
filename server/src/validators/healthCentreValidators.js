import { z } from 'zod'

const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.array(z.number().finite()).length(2)
    .refine(([longitude]) => longitude >= -180 && longitude <= 180)
    .refine(([, latitude]) => latitude >= -90 && latitude <= 90),
}).strict()

const healthCentreFields = {
  name: z.string().trim().min(1).max(160),
  type: z.enum(['PHC', 'CHC', 'districtHospital', 'private']),
  address: z.string().trim().min(1).max(500),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  services: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  hasAmbulance: z.boolean().default(false),
  hasLandingPoint: z.boolean().default(false),
  hasDrone: z.boolean().default(false),
  is24x7: z.boolean().default(false),
  location: pointSchema,
}

export const nearestHealthCentresQuerySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  type: healthCentreFields.type.optional(),
}).strict()

export const healthCentreListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: healthCentreFields.type.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
}).strict()

export const healthCentreIdSchema = z.object({
  centreId: z.string().regex(/^[a-f\d]{24}$/i),
}).strict()

export const createHealthCentreSchema = z.object(healthCentreFields).strict()

export const updateHealthCentreSchema = createHealthCentreSchema.partial().refine(
  (input) => Object.keys(input).length > 0,
  'At least one field is required.',
)
