import mongoose from 'mongoose'

const smsRateLimitSchema = new mongoose.Schema({
  phoneHash: { type: String, required: true, unique: true },
  count: { type: Number, required: true, min: 0 },
  windowStart: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false })

smsRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.models.SmsRateLimit || mongoose.model('SmsRateLimit', smsRateLimitSchema)
