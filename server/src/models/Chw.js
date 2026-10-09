import mongoose from 'mongoose'

const chwSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  assignedVillages: { type: [{
    village: { type: String, required: true, trim: true },
    mandal: { type: String, trim: true },
    district: { type: String, trim: true },
  }], default: [] },
  employeeId: { type: String, required: true, unique: true, trim: true },
  isVerified: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false })

chwSchema.index({ 'assignedVillages.district': 1, 'assignedVillages.mandal': 1, 'assignedVillages.village': 1 })

export default mongoose.models.Chw || mongoose.model('Chw', chwSchema)
