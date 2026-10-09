import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  type: {
    type: String,
    enum: [
      'critical_alert',
      'warning_alert',
      'sos_update',
      'appointment_reminder',
      'medication_reminder',
      'prescription',
      'drone_update',
      'system',
    ],
    required: true,
  },
  title: { en: String, te: String },
  body: { en: String, te: String },
  channel: { type: String, enum: ['inApp', 'push', 'sms', 'email'], required: true },
  status: {
    type: String,
    enum: ['queued', 'sent', 'delivered', 'failed', 'read'],
    default: 'queued',
  },
  readAt: Date,
  providerMessageId: String,
  failureCode: String,
  data: { type: Map, of: mongoose.Schema.Types.Mixed },
  relatedResource: {
    kind: { type: String, enum: ['Alert', 'SosIncident', 'Appointment', 'Medication', 'DroneMission'] },
    id: mongoose.Schema.Types.ObjectId,
  },
  dedupeKey: { type: String, trim: true, unique: true, sparse: true },
}, { timestamps: true, versionKey: false })

notificationSchema.index({ user: 1, status: 1, createdAt: -1 })
notificationSchema.index({ user: 1, createdAt: -1 })

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema)
