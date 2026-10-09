import cron from 'node-cron'
import {
  createMissedReadingAlerts,
  escalateDueAlerts,
  sendAppointmentReminders,
  sendMedicationReminders,
} from '../services/alertService.js'
import { removeExpiredRefreshTokens } from '../services/authService.js'
import { logger } from '../utils/logger.js'

let jobs = []
let running = false

function schedule(name, expression, task) {
  return cron.schedule(expression, async () => {
    try {
      const result = await task()
      logger.info({ event: 'job.completed', job: name, result }, 'Scheduled job completed.')
    } catch (error) {
      logger.error({
        event: 'job.failed',
        job: name,
        err: error,
        name: error.name,
      }, 'Scheduled job failed.')
    }
  }, { timezone: 'Asia/Kolkata' })
}

export function startAlertJobs() {
  if (running) return
  jobs = [
    schedule('Alert escalation', '* * * * *', escalateDueAlerts),
    schedule('Missed reading detector', '0 * * * *', createMissedReadingAlerts),
    schedule('Medication reminders', '* * * * *', sendMedicationReminders),
    schedule('Appointment reminders', '* * * * *', sendAppointmentReminders),
    schedule('Expired refresh token cleanup', '17 3 * * *', removeExpiredRefreshTokens),
  ]
  running = true
  logger.info({ event: 'jobs.started', count: jobs.length }, 'Scheduled jobs started.')
}

export function stopAlertJobs() {
  for (const job of jobs) job.stop()
  jobs = []
  running = false
}
