import mongoose from 'mongoose'
import { isLandingPhoto } from '../utils/landingPhoto.js'

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], required: true },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: (coordinates) => coordinates.length === 2
        && Number.isFinite(coordinates[0])
        && Number.isFinite(coordinates[1])
        && coordinates[0] >= -180 && coordinates[0] <= 180
        && coordinates[1] >= -90 && coordinates[1] <= 90,
      message: 'Coordinates must be [longitude, latitude].',
    },
  },
}, { _id: false })

const landingPointSchema = new mongoose.Schema({
  village: { type: String, required: true, trim: true, maxlength: 120 },
  mandal: { type: String, trim: true, maxlength: 120 },
  district: { type: String, trim: true, maxlength: 120 },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  location: { type: pointSchema, required: true },
  surfaceType: { type: String, enum: ['open_ground', 'field', 'other'], required: true },
  obstructionsNotes: { type: String, maxlength: 2000 },
  contactPerson: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  contactLanguage: { type: String, enum: ['en', 'te'], default: 'en' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  photos: {
    type: [{ type: String, trim: true, maxlength: 110_000 }],
    default: [],
    validate: {
      validator: (photos) => photos.length <= 2 && photos.every(isLandingPhoto),
      message: 'Landing points accept up to two compressed JPEG photos.',
    },
  },
  checklist: {
    clearArea: { type: Boolean, default: false },
    minimumAreaConfirmed: { type: Boolean, default: false },
    noOverheadWiresOrTrees: { type: Boolean, default: false },
    awayFromCrowds: { type: Boolean, default: false },
    contactAvailable: { type: Boolean, default: false },
  },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
  reverifyAt: Date,
  isActive: { type: Boolean, default: false },
  noFly: { type: Boolean, default: false },
  noFlyReason: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true, versionKey: false })

landingPointSchema.index({ location: '2dsphere' })
landingPointSchema.index({ village: 1, isActive: 1 })
landingPointSchema.index({ isActive: 1, noFly: 1, verifiedAt: 1 })

landingPointSchema.pre('validate', function validateLandingSafety() {
  if (this.isActive && (
    !this.verifiedAt
    || !this.reverifyAt
    || this.reverifyAt <= new Date()
    || this.noFly
    || Object.values(this.checklist.toObject()).some((checked) => !checked)
  )) {
    this.invalidate('isActive', 'Active landing points must be verified, pass the full checklist, and not be no-fly.')
  }
})

export default mongoose.models.LandingPoint || mongoose.model('LandingPoint', landingPointSchema)
