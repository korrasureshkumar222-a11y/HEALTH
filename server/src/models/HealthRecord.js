import mongoose from 'mongoose'

const valuesSchema = new mongoose.Schema({
  systolic: { type: Number, min: 0, max: 400 },
  diastolic: { type: Number, min: 0, max: 300 },
  value: { type: Number, min: 0, max: 100000 },
  unit: { type: String, trim: true, maxlength: 24 },
  sugarContext: { type: String, enum: ['fasting', 'postMeal', 'random'] },
}, { _id: false, strict: 'throw' })

const healthRecordSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  type: {
    type: String,
    enum: ['bp', 'sugar', 'heartRate', 'weight', 'spo2', 'temperature'],
    required: true,
  },
  values: { type: valuesSchema, required: true },
  recordedAt: { type: Date, required: true },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required() { return this.source !== 'sms' },
  },
  source: { type: String, enum: ['self', 'chw', 'sms', 'device'], required: true },
  clientId: { type: String, lowercase: true, trim: true, match: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i },
  status: {
    type: String,
    enum: ['normal', 'warning', 'critical', 'unclassified'],
    required: true,
    default: 'unclassified',
  },
  classification: {
    rulesetVersion: { type: String, trim: true },
    classifiedAt: Date,
  },
  notes: { type: String, maxlength: 1000 },
}, { timestamps: true, versionKey: false })

healthRecordSchema.index({ patient: 1, recordedAt: -1, _id: -1 })
healthRecordSchema.index({ patient: 1, type: 1, recordedAt: -1 })
healthRecordSchema.index({ clientId: 1 }, { unique: true, sparse: true })

healthRecordSchema.pre('validate', function validateReadingValues() {
  const { type, values } = this
  if (!values) return

  if (type === 'bp') {
    if (values.systolic == null || values.diastolic == null || values.unit !== 'mmHg'
      || values.value != null || values.sugarContext != null) {
      this.invalidate('values', 'Blood pressure requires systolic, diastolic, and mmHg only.')
    }
    return
  }

  if (values.value == null || !values.unit || values.systolic != null || values.diastolic != null) {
    this.invalidate('values', 'This reading type requires a scalar value and unit.')
  }
  if (type === 'sugar' && !values.sugarContext) {
    this.invalidate('values.sugarContext', 'Glucose readings require fasting, postMeal, or random context.')
  }
  if (type !== 'sugar' && values.sugarContext != null) {
    this.invalidate('values.sugarContext', 'Sugar context is only valid for glucose readings.')
  }
})

export default mongoose.models.HealthRecord || mongoose.model('HealthRecord', healthRecordSchema)
