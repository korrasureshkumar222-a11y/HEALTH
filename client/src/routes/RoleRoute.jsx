import { Navigate } from 'react-router-dom'
import { usePermissions } from '../hooks/usePermissions.js'

export default function RoleRoute({ allowedRoles, children }) {
  const { hasRole } = usePermissions()

  if (!hasRole(...allowedRoles)) {
    return <Navigate to="/" replace />
  }

  return children
}
