import mongoose from 'mongoose'

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], required: true },
  coordinates: {
    type: [Number],
    required: true,
    validate: (coordinates) => coordinates.length === 2
      && coordinates[0] >= -180 && coordinates[0] <= 180
      && coordinates[1] >= -90 && coordinates[1] <= 90,
  },
}, { _id: false })

const visitLogSchema = new mongoose.Schema({
  chw: { type: mongoose.Schema.Types.ObjectId, ref: 'Chw', required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  clientId: {
    type: String,
    trim: true,
    lowercase: true,
    match: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  },
  date: { type: Date, required: true },
  status: { type: String, enum: ['planned', 'completed', 'missed'], default: 'completed', required: true },
  checklist: {
    type: [{ type: String, enum: ['vitals', 'medications', 'symptoms', 'education'] }],
    default: [],
  },
  notes: { type: String, trim: true, maxlength: 2000 },
  location: { type: pointSchema },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false })

visitLogSchema.index({ chw: 1, date: 1, status: 1 })
visitLogSchema.index({ patient: 1, date: -1 })
visitLogSchema.index({ clientId: 1 }, { unique: true, sparse: true })

export default mongoose.models.VisitLog || mongoose.model('VisitLog', visitLogSchema)
