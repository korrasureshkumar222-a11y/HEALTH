import { z } from 'zod'

const dateRangeFields = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict()

const validRange = ({ from, to }) => !from || !to || new Date(from) <= new Date(to)
const rangeIssue = {
  path: ['to'], message: 'The end date must be on or after the start date.',
}

export const reportRangeSchema = dateRangeFields.refine(validRange, rangeIssue)
export const reportPdfSchema = dateRangeFields.extend({
  language: z.enum(['en', 'te']).optional(),
}).refine(validRange, rangeIssue)
export const readingExportSchema = dateRangeFields.extend({
  type: z.enum(['bp', 'sugar', 'heartRate', 'weight', 'spo2', 'temperature']).optional(),
}).refine(validRange, rangeIssue)
