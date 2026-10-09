import mongoose from 'mongoose'

const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorRole: { type: String, enum: ['patient', 'doctor', 'chw', 'admin'] },
  subjectHash: { type: String, select: false },
  action: {
    type: String,
    enum: [
      'patient.create', 'patient.update', 'patient.assign', 'patient.deactivate',
      'healthCentre.create', 'healthCentre.update', 'healthCentre.deactivate',
      'landingPoint.create', 'landingPoint.update', 'landingPoint.deactivate',
      'droneMission.request', 'droneMission.approve', 'droneMission.dispatch',
      'droneMission.abort', 'droneMission.enRoute', 'droneMission.arrived',
      'droneMission.delivered', 'reading.delete', 'alert.acknowledge',
      'alert.resolve', 'sos.status', 'report.summary.export',
      'report.readings.export', 'report.admin.export', 'login.success',
      'login.failure', 'auth.logout', 'auth.password.change',
      'auth.refresh.reuse', 'data.view', 'patient.list.view', 'user.role.change',
    ],
    required: true,
  },
  resourceType: {
    type: String,
    enum: [
      'Patient', 'HealthCentre', 'LandingPoint', 'DroneMission', 'HealthRecord',
      'Alert', 'SosIncident', 'SystemReport', 'User',
    ],
    required: true,
    default: 'Patient',
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required() { return !['SystemReport'].includes(this.resourceType) },
  },
  changedFields: [{ type: String, maxlength: 80 }],
  reason: { type: String, maxlength: 500 },
}, { timestamps: true, versionKey: false })

auditLogSchema.index({ actor: 1, createdAt: -1 })
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 })

export default mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema)
