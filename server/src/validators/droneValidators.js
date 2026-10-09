import { z } from 'zod'
import { isLandingPhoto } from '../utils/landingPhoto.js'

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i)
const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.array(z.number().finite()).length(2)
    .refine(([longitude]) => longitude >= -180 && longitude <= 180)
    .refine(([, latitude]) => latitude >= -90 && latitude <= 90),
}).strict()

const landingChecklistSchema = z.object({
  clearArea: z.boolean(),
  minimumAreaConfirmed: z.boolean(),
  noOverheadWiresOrTrees: z.boolean(),
  awayFromCrowds: z.boolean(),
  contactAvailable: z.boolean(),
}).strict()

const landingPhotosSchema = z.array(z.union([
  z.string().url().max(2048).refine((photo) => photo.startsWith('https://') || photo.startsWith('http://')),
  z.string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
]).refine(isLandingPhoto, 'Each JPEG must be valid, compressed, and no larger than 80 KB.')).max(2)

export const landingPointIdSchema = z.object({ landingPointId: objectIdSchema }).strict()
export const droneMissionIdSchema = z.object({ missionId: objectIdSchema }).strict()

const landingPointFields = {
  village: z.string().trim().min(1).max(120),
  mandal: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  name: z.string().trim().min(1).max(160),
  location: pointSchema,
  surfaceType: z.enum(['open_ground', 'field', 'other']),
  obstructionsNotes: z.string().trim().max(2000).optional(),
  contactPerson: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(7).max(30),
  contactLanguage: z.enum(['en', 'te']).default('en'),
  photos: landingPhotosSchema.default([]),
  checklist: landingChecklistSchema.default({
    clearArea: false,
    minimumAreaConfirmed: false,
    noOverheadWiresOrTrees: false,
    awayFromCrowds: false,
    contactAvailable: false,
  }),
}

export const createLandingPointSchema = z.object(landingPointFields).strict()
export const updateLandingPointSchema = z.object({
  ...Object.fromEntries(Object.entries(landingPointFields).map(([key, schema]) => [
    key,
    schema.optional(),
  ])),
  photos: landingPhotosSchema.optional(),
  contactLanguage: z.enum(['en', 'te']).optional(),
  verified: z.boolean().optional(),
  isActive: z.boolean().optional(),
  noFly: z.boolean().optional(),
  noFlyReason: z.string().trim().max(500).optional(),
  checklist: landingChecklistSchema.optional(),
}).strict().refine((input) => Object.keys(input).length > 0, 'At least one field is required.')

export const landingPointListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  includeInactive: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
}).strict()

export const updateLandingChecklistSchema = z.object({
  checklist: landingChecklistSchema,
}).strict()

export const droneMissionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['requested', 'approved', 'dispatched', 'enRoute', 'arrived', 'delivered', 'aborted']).optional(),
  patientId: objectIdSchema.optional(),
}).strict()

export const createDroneMissionSchema = z.object({
  sosIncident: objectIdSchema.optional(),
  patientId: objectIdSchema.optional(),
  payload: z.array(z.enum(['medicine', 'AED', 'glucoseKit', 'firstAid', 'other'])).min(1).max(20),
}).strict().refine((input) => input.sosIncident || input.patientId, {
  message: 'An SOS incident or patient is required.',
  path: ['sosIncident'],
})

export const abortDroneMissionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict()

export const updateDroneMissionStatusSchema = z.object({
  status: z.enum(['enRoute', 'arrived', 'delivered']),
  note: z.string().trim().max(1000).optional(),
}).strict()
