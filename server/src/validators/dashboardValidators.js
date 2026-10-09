import { z } from 'zod'

export const doctorDashboardQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  village: z.string().trim().max(120).optional(),
  condition: z.enum(['diabetes', 'hypertension', 'cardiac', 'other']).optional(),
  status: z.enum(['critical', 'warning', 'missed', 'normal', 'unclassified']).optional(),
}).strict()
