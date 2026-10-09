import mongoose from 'mongoose'

const noteRevisionSchema = new mongoose.Schema({
  body: { type: String, required: true, maxlength: 5000 },
  editedAt: { type: Date, required: true },
  editReason: { type: String, required: true, maxlength: 500 },
}, { _id: false })

const noteSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['doctor', 'chw'], required: true },
  kind: { type: String, enum: ['clinical', 'visit'], required: true },
  body: { type: String, required: true, maxlength: 5000 },
  visibility: { type: String, enum: ['careTeam', 'doctorOnly'], default: 'careTeam' },
  relatedRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'HealthRecord' },
  editedAt: Date,
  editReason: String,
  revisions: { type: [noteRevisionSchema], default: [] },
}, { timestamps: true, versionKey: false })

noteSchema.index({ patient:  1, createdAt: -1 })
noteSchema.index({ author: 1, createdAt: -1 })

export default mongoose.models.Note || mongoose.model('Note', noteSchema)
