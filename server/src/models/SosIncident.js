import mongoose from 'mongoose'

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], required: true },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: (coordinates) => coordinates.length === 2
        && coordinates[0] >= -180 && coordinates[0] <= 180
        && coordinates[1] >= -90 && coordinates[1] <= 90,
      message: 'Coordinates must be [longitude, latitude].',
    },
  },
}, { _id: false })

const sosIncidentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  triggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required() { return this.source !== 'sms' },
  },
  source: { type: String, enum: ['app', 'sms'], default: 'app', required: true },
  clientId: {
    type: String,
    trim: true,
    lowercase: true,
    match: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  },
  location: { type: pointSchema, required: true },
  status: {
    type: String,
    enum: ['triggered', 'doctorNotified', 'chwNotified', 'ambulanceRequested', 'droneRequested', 'resolved'],
    default: 'triggered',
    required: true,
  },
  timeline: {
    type: [{
      status: {
        type: String,
        enum: ['triggered', 'doctorNotified', 'chwNotified', 'ambulanceRequested', 'droneRequested', 'resolved'],
        required: true,
      },
      at: { type: Date, required: true },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      note: { type: String, trim: true, maxlength: 1000 },
    }],
    default: [],
    validate: (timeline) => timeline.length <= 100,
  },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
}, { timestamps: true, versionKey: false })

sosIncidentSchema.index({ location: '2dsphere' })
sosIncidentSchema.index({ patient: 1, createdAt: -1 })
sosIncidentSchema.index({ status: 1, createdAt: -1 })
sosIncidentSchema.index({ clientId: 1 }, { unique: true, sparse: true })

export default mongoose.models.SosIncident || mongoose.model('SosIncident', sosIncidentSchema)
