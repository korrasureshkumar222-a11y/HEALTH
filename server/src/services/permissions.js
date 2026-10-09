import mongoose from 'mongoose'
import Chw from '../models/Chw.js'
import Doctor from '../models/Doctor.js'
import Patient from '../models/Patient.js'

function idOf(value) {
  return value?._id?.toString() ?? value?.toString()
}

function normalizeLocation(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('en') : ''
}

export async function canRegisterPatientInVillage(user, location) {
  if (user?.role !== 'chw') return false
  const chw = await Chw.findOne({ user: idOf(user) }).select('assignedVillages').lean()
  return Boolean(chw?.assignedVillages?.some((assigned) => (
    normalizeLocation(assigned.village) === normalizeLocation(location.village)
    && (!assigned.mandal || normalizeLocation(assigned.mandal) === normalizeLocation(location.mandal))
    && (!assigned.district || normalizeLocation(assigned.district) === normalizeLocation(location.district))
  )))
}

export async function canAccessPatient(user, patientId) {
  const userId = idOf(user)
  if (!userId || !mongoose.isValidObjectId(patientId) || !user?.role) return false
  if (user.role === 'admin') return true

  const patient = await Patient.findById(patientId)
    .select('user assignedDoctor village mandal district status')
    .lean()
  if (!patient) return false
  if (patient.status !== 'active' && user.role !== 'admin') return false

  if (user.role === 'patient') {
    return idOf(patient.user) === userId
  }

  if (user.role === 'doctor') {
    const doctor = await Doctor.findOne({ user: userId }).select('_id').lean()
    return Boolean(doctor && idOf(patient.assignedDoctor) === idOf(doctor))
  }

  if (user.role === 'chw') {
    return canRegisterPatientInVillage(user, patient)
  }

  return false
}
