import mongoose from 'mongoose'

const healthCentreSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  type: {
    type: String,
    enum: ['PHC', 'CHC', 'districtHospital', 'private'],
    required: true,
  },
  address: { type: String, required: true, trim: true, maxlength: 500 },
  phone: { type: String, trim: true, maxlength: 30 },
  services: [{ type: String, trim: true, maxlength: 100 }],
  hasAmbulance: { type: Boolean, default: false },
  hasLandingPoint: { type: Boolean, default: false },
  hasDrone: { type: Boolean, default: false },
  is24x7: { type: Boolean, default: false },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
    },
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
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false })

healthCentreSchema.index({ location: '2dsphere' })
healthCentreSchema.index({ type: 1, isActive: 1 })

export default mongoose.models.HealthCentre || mongoose.model('HealthCentre', healthCentreSchema)
