import mongoose from 'mongoose'

const prescriptionRevisionSchema = new mongoose.Schema({
  dose: String,
  frequency: String,
  timings: [String],
  endDate: Date,
  instructions: {
    en: String,
    te: String,
  },
  active: Boolean,
  prescribedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, required: true },
  reason: { type: String, required: true, maxlength: 500 },
}, { _id: false })

const medicationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  dose: { type: String, required: true, trim: true, maxlength: 120 },
  frequency: { type: String, required: true, trim: true, maxlength: 120 },
  timings: { type: [{ type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ }], required: true, validate: (timings) => timings.length <= 12 },
  startDate: { type: Date, required: true },
  endDate: Date,
  prescribedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  instructions: { en: String, te: String },
  active: { type: Boolean, default: true },
  prescriptionHistory: { type: [prescriptionRevisionSchema], default: [] },
}, { timestamps: true, versionKey: false })

medicationSchema.index({ patient: 1, active: 1, startDate: -1 })
medicationSchema.index({ prescribedBy: 1, createdAt: -1 })

export default mongoose.models.Medication || mongoose.model('Medication', medicationSchema)
