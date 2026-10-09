import mongoose from 'mongoose'

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, required: true },
  note: String,
}, { _id: false })

const appointmentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  scheduledAt: { type: Date, required: true },
  durationMinutes: { type: Number, enum: [30, 60], default: 30 },
  mode: { type: String, enum: ['video', 'phone', 'inPerson'], required: true },
  healthCentre: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCentre' },
  reason: { type: String, maxlength: 1000 },
  status: { type: String, enum: ['requested', 'confirmed', 'completed', 'cancelled', 'no-show'], default: 'requested' },
  notes: { type: String, maxlength: 2000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reservedSlotKeys: { type: [String], default: [] },
  isActiveReservation: { type: Boolean, default: true, required: true },
  statusHistory: { type: [statusHistorySchema], default: [] },
}, { timestamps: true, versionKey: false })

appointmentSchema.index({ patient: 1, scheduledAt: 1 })
appointmentSchema.index({ doctor: 1, scheduledAt: 1, status: 1 })
appointmentSchema.index(
  { doctor: 1, reservedSlotKeys: 1 },
  { unique: true, partialFilterExpression: { isActiveReservation: true } },
)

export default mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema)
