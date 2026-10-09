import mongoose from 'mongoose'
import { decryptSensitiveField, encryptSensitiveField } from '../utils/fieldEncryption.js'

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

const patientConsentSchema = new mongoose.Schema({
  status: { type: String, enum: ['accepted', 'withdrawn'], required: true },
  policyVersion: { type: String, required: true, trim: true },
  acceptedAt: { type: Date, required: true },
  capturedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  method: { type: String, enum: ['self', 'chw', 'admin'], required: true },
}, { _id: false })

const patientSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
  clientId: {
    type: String,
    trim: true,
    lowercase: true,
    match: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  },
  name: { type: String, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, match: /^[6-9]\d{9}$/ },
  language: { type: String, enum: ['en', 'te'], default: 'en' },
  age: { type: Number, min: 0, max: 130 },
  gender: { type: String, enum: ['female', 'male', 'other', 'prefer_not_to_say'] },
  village: { type: String, required: true, trim: true },
  mandal: { type: String, trim: true },
  district: { type: String, trim: true },
  location: pointSchema,
  conditions: [{ type: String, enum: ['diabetes', 'hypertension', 'cardiac', 'other'] }],
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  },
  allergies: [{ name: { type: String, required: true }, notes: String }],
  emergencyContacts: {
    type: String,
    set: encryptSensitiveField,
    get: decryptSensitiveField,
  },
  assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  assignedChw: { type: mongoose.Schema.Types.ObjectId, ref: 'Chw' },
  nearestHealthCentre: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthCentre' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  consent: { type: patientConsentSchema, required: false },
}, { timestamps: true, versionKey: false })

patientSchema.index({ location: '2dsphere' })
patientSchema.index({ assignedDoctor: 1, status: 1 })
patientSchema.index({ assignedChw: 1, status: 1 })
patientSchema.index({ district: 1, mandal: 1, village: 1, status: 1 })
patientSchema.index({ phone: 1 }, { unique: true, sparse: true })
patientSchema.index({ clientId: 1 }, { unique: true, sparse: true })

function decryptLeanPatient(patient) {
  if (patient?.emergencyContacts) {
    patient.emergencyContacts = decryptSensitiveField(patient.emergencyContacts)
  }
}

patientSchema.post('find', function decryptLeanPatients(documents) {
  if (!this.mongooseOptions().lean) return
  documents.forEach(decryptLeanPatient)
})
patientSchema.post('findOne', function decryptLeanPatientResult(document) {
  if (this.mongooseOptions().lean) decryptLeanPatient(document)
})
patientSchema.set('toJSON', {
  transform(_document, result) {
    if (result.emergencyContacts) {
      result.emergencyContacts = decryptSensitiveField(result.emergencyContacts)
    }
    return result
  },
})

export default mongoose.models.Patient || mongoose.model('Patient', patientSchema)
