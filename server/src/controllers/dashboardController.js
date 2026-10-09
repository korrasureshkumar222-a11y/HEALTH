import { getChwDashboard, getChwPerformance } from '../services/chwService.js'
import { getDoctorDashboard, getPatientDashboard } from '../services/dashboardService.js'

export async function getDoctorDashboardData(request, response) {
  const dashboard = await getDoctorDashboard(request.user, request.query)
  response.status(200).json({
    success: true,
    message: 'Doctor dashboard retrieved.',
    data: dashboard,
  })
}

export async function getPatientDashboardData(request, response) {
  const dashboard = await getPatientDashboard(request.user)
  response.status(200).json({
    success: true,
    message: 'Patient dashboard retrieved.',
    data: dashboard,
  })
}

export async function getChwDashboardData(request, response) {
  const dashboard = await getChwDashboard(request.user)
  response.status(200).json({
    success: true,
    message: 'CHW dashboard retrieved.',
    data: dashboard,
  })
}

export async function getChwPerformanceData(request, response) {
  const summary = await getChwPerformance(request.user, request.query)
  response.status(200).json({
    success: true,
    message: 'CHW performance summary retrieved.',
    data: summary,
  })
}
