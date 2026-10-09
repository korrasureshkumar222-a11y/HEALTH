import mongoose from 'mongoose'

const alertSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  record: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthRecord' },
  sosIncident: { type: mongoose.Schema.Types.ObjectId, ref: 'SosIncident' },
  type: {
    type: String,
    enum: ['critical_reading', 'warning_reading', 'missed_reading', 'sos', 'medication_missed'],
    required: true,
  },
  severity: { type: String, enum: ['info', 'warning', 'critical'], required: true },
  message: {
    en: { type: String, required: true },
    te: { type: String, required: true },
  },
  status: { type: String, enum: ['open', 'acknowledged', 'resolved'], default: 'open' },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  acknowledgedAt: Date,
  acknowledgmentNote: { type: String, maxlength: 1000 },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
  resolutionNote: { type: String, maxlength: 1000 },
  dedupeKey: { type: String, required: true, unique: true, trim: true },
  escalation: {
    level: { type: Number, default: 0, min: 0 },
    lastEscalatedAt: Date,
    nextEscalationAt: Date,
  },
}, { timestamps: true, versionKey: false })

alertSchema.index({ patient: 1, status: 1, createdAt: -1 })
alertSchema.index({ severity: 1, status: 1, createdAt: -1 })

export default mongoose.models.Alert || mongoose.model('Alert', alertSchema)
