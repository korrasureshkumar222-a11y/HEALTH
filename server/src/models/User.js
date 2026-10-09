import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { env } from '../config/env.js'

const refreshTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, select: false },
  sessionId: { type: String, required: true },
  tokenId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  rotatedAt: Date,
  revokedAt: Date,
}, { _id: false })

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, unique: true, trim: true },
  email: { type: String, trim: true, lowercase: true, sparse: true },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['patient', 'doctor', 'chw', 'admin'],
    required: true,
  },
  language: { type: String, enum: ['en', 'te'], default: 'en' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  consent: {
    status: { type: String, enum: ['pending', 'accepted', 'withdrawn'], default: 'pending' },
    policyVersion: String,
    acceptedAt: Date,
    withdrawnAt: Date,
  },
  failedLoginCount: { type: Number, default: 0, min: 0, select: false },
  lockedUntil: { type: Date, select: false },
  refreshTokens: { type: [refreshTokenSchema], default: [] },
  fcmToken: { type: String, select: false, trim: true },
}, { timestamps: true, versionKey: false })

userSchema.index({ role: 1, isActive: 1 })

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('passwordHash')) return
  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(this.passwordHash)) return
  this.passwordHash = await bcrypt.hash(this.passwordHash, env.authBcryptRounds)
})

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash)
}

userSchema.set('toJSON', {
  transform(_document, result) {
    delete result.passwordHash
    delete result.refreshTokens
    delete result.fcmToken
    delete result.__v
    return result
  },
})

export default mongoose.models.User || mongoose.model('User', userSchema)
