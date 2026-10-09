import {
  createPatientNote,
  getPatientTimeline,
  listPatientAppointments,
  listPatientMedications,
  listPatientNotes,
  prescribeMedication,
  schedulePatientAppointment,
  updatePatientNote,
  updatePrescription,
} from '../services/careService.js'

export async function getNotes(request, response) {
  const data = await listPatientNotes(request.user, request.params.patientId, request.query)
  response.status(200).json({ success: true, message: 'Patient notes retrieved.', data })
}

export async function postNote(request, response) {
  const note = await createPatientNote(request.user, request.params.patientId, request.body)
  response.status(201).json({ success: true, message: 'Patient note created.', data: { note } })
}

export async function patchNote(request, response) {
  const note = await updatePatientNote(request.user, request.params.patientId, request.params.noteId, request.body)
  response.status(200).json({ success: true, message: 'Patient note updated.', data: { note } })
}

export async function getMedications(request, response) {
  const items = await listPatientMedications(request.params.patientId, request.query)
  response.status(200).json({ success: true, message: 'Patient medications retrieved.', data: { items } })
}

export async function postMedication(request, response) {
  const medication = await prescribeMedication(request.user, request.params.patientId, request.body)
  response.status(201).json({ success: true, message: 'Medication prescribed.', data: { medication } })
}

export async function patchMedication(request, response) {
  const medication = await updatePrescription(
    request.user,
    request.params.patientId,
    request.params.medicationId,
    request.body,
  )
  response.status(200).json({ success: true, message: 'Prescription updated.', data: { medication } })
}

export async function getAppointments(request, response) {
  const items = await listPatientAppointments(request.params.patientId, request.query)
  response.status(200).json({ success: true, message: 'Patient appointments retrieved.', data: { items } })
}

export async function postAppointment(request, response) {
  const appointment = await schedulePatientAppointment(request.user, request.params.patientId, request.body)
  response.status(201).json({ success: true, message: 'Appointment scheduled.', data: { appointment } })
}

export async function getTimeline(request, response) {
  const items = await getPatientTimeline(request.params.patientId)
  response.status(200).json({ success: true, message: 'Patient timeline retrieved.', data: { items } })
}
