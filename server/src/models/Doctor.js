import mongoose from 'mongoose'

const doctorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  specialization: { type: String, required: true, trim: true },
  registrationNo: { type: String, required: true, unique: true, trim: true },
  hospital: { type: String, trim: true },
  availability: [{
    dayOfWeek: { type: Number, min: 0, max: 6, required: true },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):(00|30)$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):(00|30)$/ },
    timezone: { type: String, default: 'Asia/Kolkata', required: true },
  }],
  isVerified: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false })

export default mongoose.models.Doctor || mongoose.model('Doctor', doctorSchema)
