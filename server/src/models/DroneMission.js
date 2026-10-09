import mongoose from 'mongoose'

const droneMissionSchema = new mongoose.Schema({
  sosIncident: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SosIncident',
    unique: true,
    sparse: true,
  },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  originHealthCentre: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCentre', required: true },
  landingPoint: { type: mongoose.Schema.Types.ObjectId, ref: 'LandingPoint', required: true },
  payload: {
    type: [{ type: String, enum: ['medicine', 'AED', 'glucoseKit', 'firstAid', 'other'] }],
    required: true,
    validate: (payload) => payload.length > 0 && payload.length <= 20,
  },
  status: {
    type: String,
    enum: ['requested', 'approved', 'dispatched', 'enRoute', 'arrived', 'delivered', 'aborted'],
    default: 'requested',
    required: true,
  },
  eta: { type: Date, required: true },
  distanceKm: { type: Number, required: true, min: 0 },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  provider: { type: String, enum: ['mock', 'http'], required: true },
  providerMissionId: String,
  dispatchClaimedAt: Date,
  timeline: {
    type: [{
      status: {
        type: String,
        enum: ['requested', 'approved', 'dispatched', 'enRoute', 'arrived', 'delivered', 'aborted'],
        required: true,
      },
      at: { type: Date, required: true },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      note: { type: String, trim: true, maxlength: 1000 },
    }],
    default: [],
    validate: (timeline) => timeline.length <= 100,
  },
  weatherCheck: {
    checkedAt: Date,
    safe: Boolean,
    provider: String,
    reason: String,
  },
}, { timestamps: true, versionKey: false })

droneMissionSchema.index({ status:  1, createdAt: -1 })
droneMissionSchema.index({ patient: 1, createdAt: -1 })
droneMissionSchema.index({ landingPoint: 1, status: 1 })

export default mongoose.models.DroneMission || mongoose.model('DroneMission', droneMissionSchema)
