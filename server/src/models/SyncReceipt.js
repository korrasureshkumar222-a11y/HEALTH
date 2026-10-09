import mongoose from 'mongoose'

const syncReceiptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  clientId: { type: String, required: true, trim: true, lowercase: true },
  type: { type: String, enum: ['reading', 'sos', 'patient.create', 'patient.update'], required: true },
  status: { type: String, enum: ['processing', 'retryable', 'completed'], required: true },
  clientTimestamp: Date,
  serverTimestamp: { type: Date, required: true },
  lockExpiresAt: Date,
  result: mongoose.Schema.Types.Mixed,
}, { timestamps: true, versionKey: false })

syncReceiptSchema.index({ user: 1, clientId: 1 }, { unique: true })
syncReceiptSchema.index({ status: 1, lockExpiresAt: 1 })

export default mongoose.models.SyncReceipt || mongoose.model('SyncReceipt', syncReceiptSchema)
