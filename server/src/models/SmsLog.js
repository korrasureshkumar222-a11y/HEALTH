import mongoose from 'mongoose'

const smsLogSchema = new mongoose.Schema({
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  fromPhoneHash: String,
  toPhoneHash: String,
  bodyRedacted: { type: String, required: true, maxlength: 2000 },
  messageType: {
    type: String,
    enum: ['alert', 'appointment_reminder', 'drone_update', 'otp', 'reading', 'sos', 'unknown'],
    required: true,
  },
  purpose: {
    type: String,
    enum: ['alert', 'appointment_reminder', 'drone_arrival', 'otp', 'inbound_reading', 'inbound_sos', 'inbound_unknown'],
    required: true,
  },
  provider: { type: String, enum: ['mock', 'http', 'twilio'], required: true },
  status: {
    type: String,
    enum: ['queued', 'processing', 'received', 'accepted', 'rejected', 'simulated', 'sent', 'failed', 'rate_limited'],
    required: true,
  },
  providerMessageId: String,
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  droneMission: { type: mongoose.Schema.Types.ObjectId, ref: 'DroneMission' },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  dedupeKey: String,
  signatureValid: Boolean,
  parsedPayload: { type: mongoose.Schema.Types.Mixed },
  receivedAt: Date,
  processedAt: Date,
  failureCode: String,
}, { timestamps: true, versionKey: false })

smsLogSchema.index({ droneMission: 1, createdAt: -1 })
smsLogSchema.index({ toPhoneHash: 1, createdAt: -1 })
smsLogSchema.index({ fromPhoneHash: 1, createdAt: -1 })
smsLogSchema.index({ patient: 1, createdAt: -1 })
smsLogSchema.index(
  { provider: 1, providerMessageId: 1 },
  { unique: true, partialFilterExpression: { providerMessageId: { $type: 'string' } } },
)
smsLogSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
)

export default mongoose.models.SmsLog || mongoose.model('SmsLog', smsLogSchema)
