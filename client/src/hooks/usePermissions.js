import { useAuth } from '../context/useAuth.js'

const permissionsByRole = {
  patient: ['read_own_data', 'record_own_readings'],
  doctor: ['read_assigned_patients', 'review_patient_alerts'],
  chw: ['read_village_patients', 'record_patient_readings'],
  admin: ['read_all_patients', 'manage_assignments', 'manage_users'],
}

export function usePermissions() {
  const { user } = useAuth()
  const permissions = permissionsByRole[user?.role] ?? []
  const hasRole = (...roles) => Boolean(user?.role && roles.includes(user.role))
  const can = (permission) => permissions.includes(permission)

  return {
    role: user?.role ?? null,
    permissions,
    hasRole,
    can,
    canViewPatients: can('read_assigned_patients')
      || can('read_village_patients')
      || can('read_all_patients'),
    canRecordReadings: can('record_own_readings')
      || can('record_patient_readings'),
    canManageAssignments: can('manage_assignments'),
    canManageUsers: can('manage_users'),
  }
}
