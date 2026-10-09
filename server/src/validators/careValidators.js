import { z } from 'zod'

const patientId = z.string().regex(/^[a-f\d]{24}$/i)
const date = z.coerce.date()

export const patientNoteParamsSchema = z.object({
  patientId,
  noteId: patientId,
}).strict()

export const patientMedicationParamsSchema = z.object({
  patientId,
  medicationId: patientId,
}).strict()

export const noteListQuerySchema = z.object({
  kind: z.enum(['clinical', 'visit']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict()

export const medicationListQuerySchema = z.object({
  active: z.enum(['true', 'false']).optional(),
  from: date.optional(),
  to: date.optional(),
}).strict().refine(({ from, to }) => !from || !to || from <= to, {
  path: ['to'],
  message: 'End date must be on or after the start date.',
})

export const appointmentListQuerySchema = z.object({
  patientId: patientId.optional(),
  doctorId: patientId.optional(),
  status: z.enum(['requested', 'confirmed', 'completed', 'cancelled', 'no-show']).optional(),
  from: date.optional(),
  to: date.optional(),
  upcoming: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict().refine(({ from, to }) => !from || !to || from <= to, {
  path: ['to'],
  message: 'End date must be on or after the start date.',
})

export const createNoteSchema = z.object({
  kind: z.enum(['clinical', 'visit']).default('clinical'),
  body: z.string().trim().min(1).max(5000),
  visibility: z.enum(['careTeam', 'doctorOnly']).default('careTeam'),
  relatedRecordId: patientId.optional(),
}).strict()

export const updateNoteSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  editReason: z.string().trim().min(3).max(500),
}).strict()

export const createMedicationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  dose: z.string().trim().min(1).max(120),
  frequency: z.string().trim().min(1).max(120),
  timings: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(12),
  startDate: date,
  endDate: date.optional(),
  instructions: z.object({
    en: z.string().trim().max(1000).optional(),
    te: z.string().trim().max(1000).optional(),
  }).strict().optional(),
}).strict().refine((input) => !input.endDate || input.endDate >= input.startDate, {
  path: ['endDate'],
  message: 'End date must be on or after the start date.',
})

export const updateMedicationSchema = z.object({
  dose: z.string().trim().min(1).max(120).optional(),
  frequency: z.string().trim().min(1).max(120).optional(),
  timings: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(12).optional(),
  endDate: date.nullable().optional(),
  instructions: z.object({
    en: z.string().trim().max(1000).optional(),
    te: z.string().trim().max(1000).optional(),
  }).strict().optional(),
  active: z.boolean().optional(),
  reason: z.string().trim().min(3).max(500),
}).strict().refine((input) => Object.keys(input).some((key) => key !== 'reason'), {
  message: 'At least one medication field must be updated.',
})

const appointmentFields = z.object({
  doctorId: patientId.optional(),
  scheduledAt: date,
  durationMinutes: z.coerce.number().int().min(30).max(120).default(30)
    .refine((duration) => duration === 30 || duration === 60, 'Duration must be 30 or 60 minutes.'),
  mode: z.enum(['video', 'phone', 'inPerson']),
  healthCentreId: patientId.optional(),
  reason: z.string().trim().max(1000).optional(),
}).strict()

function futureAppointment(input) {
  return input.scheduledAt > new Date()
}

export const createAppointmentSchema = appointmentFields.refine(futureAppointment, {
  path: ['scheduledAt'],
  message: 'Appointment must be scheduled in the future.',
}).refine((input) => input.mode !== 'inPerson' || Boolean(input.healthCentreId), {
  path: ['healthCentreId'],
  message: 'A health centre is required for in-person appointments.',
})

export const appointmentCreateSchema = appointmentFields.extend({
  patientId: patientId.optional(),
}).strict().refine(futureAppointment, {
  path: ['scheduledAt'],
  message: 'Appointment must be scheduled in the future.',
}).refine((input) => input.mode !== 'inPerson' || Boolean(input.healthCentreId), {
  path: ['healthCentreId'],
  message: 'A health centre is required for in-person appointments.',
})

export const appointmentIdParamsSchema = z.object({
  appointmentId: patientId,
}).strict()

export const availabilityQuerySchema = z.object({
  doctorId: patientId,
  from: date,
  to: date,
}).strict().refine(({ from, to }) => (
  from < to && to.getTime() - from.getTime() <= 31 * 24 * 60 * 60_000
), {
  path: ['to'],
  message: 'Availability range must be positive and no longer than 31 days.',
})

export const doctorAvailabilitySchema = z.object({
  availability: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
    timezone: z.string().trim().min(1).max(80).default('Asia/Kolkata').refine((timezone) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
        return true
      } catch {
        return false
      }
    }, 'Timezone must be a valid IANA timezone.'),
  }).strict().refine(({ startTime, endTime }) => startTime < endTime, {
    path: ['endTime'],
    message: 'End time must be after start time.',
  })).max(28),
}).strict().refine(({ availability }) => {
  const seen = new Set()
  return availability.every(({ dayOfWeek, startTime, endTime }) => {
    const key = `${dayOfWeek}:${startTime}:${endTime}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}, 'Availability entries must not be duplicated.')

export const appointmentRescheduleSchema = z.object({
  scheduledAt: date,
  durationMinutes: z.coerce.number().int().min(30).max(120)
    .refine((duration) => duration === 30 || duration === 60, 'Duration must be 30 or 60 minutes.'),
}).strict().refine(({ scheduledAt }) => scheduledAt > new Date(), {
  path: ['scheduledAt'],
  message: 'Appointment must be scheduled in the future.',
})

export const appointmentStatusSchema = z.object({
  status: z.enum(['completed', 'no-show']),
  notes: z.string().trim().max(2000).optional(),
}).strict()
