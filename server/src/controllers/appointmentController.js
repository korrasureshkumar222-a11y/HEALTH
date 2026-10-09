import {
  cancelAppointment,
  createAppointment,
  getAvailableSlots,
  getDoctorAvailability,
  listAppointments,
  listAvailableDoctors,
  rescheduleAppointment,
  updateAppointmentStatus,
  updateDoctorAvailability,
} from '../services/appointmentService.js'

export async function getAppointmentDoctors(_request, response) {
  const items = await listAvailableDoctors()
  response.status(200).json({ success: true, message: 'Available doctors retrieved.', data: { items } })
}

export async function getAvailability(request, response) {
  const data = await getAvailableSlots(request.query.doctorId, request.query.from, request.query.to)
  response.status(200).json({ success: true, message: 'Doctor availability retrieved.', data })
}

export async function putDoctorAvailability(request, response) {
  const availability = await updateDoctorAvailability(request.user, request.body.availability)
  response.status(200).json({ success: true, message: 'Doctor availability updated.', data: { availability } })
}

export async function getMyAvailability(request, response) {
  const data = await getDoctorAvailability(request.user)
  response.status(200).json({ success: true, message: 'Doctor availability retrieved.', data })
}

export async function getAppointments(request, response) {
  const data = await listAppointments(request.user, request.query)
  response.status(200).json({ success: true, message: 'Appointments retrieved.', data })
}

export async function postAppointment(request, response) {
  const appointment = await createAppointment(request.user, request.body)
  response.status(201).json({ success: true, message: 'Appointment request created.', data: { appointment } })
}

export async function confirmAppointment(request, response) {
  const appointment = await updateAppointmentStatus(request.user, request.params.appointmentId, 'confirmed')
  response.status(200).json({ success: true, message: 'Appointment confirmed.', data: { appointment } })
}

export async function updateAppointment(request, response) {
  const appointment = await updateAppointmentStatus(
    request.user,
    request.params.appointmentId,
    request.body.status,
    request.body.notes,
  )
  response.status(200).json({ success: true, message: 'Appointment status updated.', data: { appointment } })
}

export async function patchReschedule(request, response) {
  const appointment = await rescheduleAppointment(
    request.user,
    request.params.appointmentId,
    request.body,
  )
  response.status(200).json({ success: true, message: 'Appointment rescheduled.', data: { appointment } })
}

export async function patchCancel(request, response) {
  const appointment = await cancelAppointment(
    request.user,
    request.params.appointmentId,
    request.body.reason,
  )
  response.status(200).json({ success: true, message: 'Appointment cancelled.', data: { appointment } })
}
