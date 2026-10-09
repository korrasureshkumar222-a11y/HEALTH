import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './routes/ProtectedRoute.jsx'
import RoleRoute from './routes/RoleRoute.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import PlaceholderPage from './pages/PlaceholderPage.jsx'

const DroneDispatchPage = lazy(() => import('./pages/DroneDispatchPage.jsx'))
const ChwLandingPointsPage = lazy(() => import('./pages/ChwLandingPointsPage.jsx'))
const PatientDetailPage = lazy(() => import('./pages/PatientDetailPage.jsx'))
const PatientFormPage = lazy(() => import('./pages/PatientFormPage.jsx'))
const PatientListPage = lazy(() => import('./pages/PatientListPage.jsx'))
const AddReadingPage = lazy(() => import('./pages/AddReadingPage.jsx'))
const ReadingHistoryPage = lazy(() => import('./pages/ReadingHistoryPage.jsx'))
const PatientDashboardPage = lazy(() => import('./pages/PatientDashboardPage.jsx'))
const DoctorDashboardPage = lazy(() => import('./pages/DoctorDashboardPage.jsx'))
const AlertsPage = lazy(() => import('./pages/AlertsPage.jsx'))
const SosPage = lazy(() => import('./pages/SosPage.jsx'))
const ChwDashboardPage = lazy(() => import('./pages/ChwDashboardPage.jsx'))
const ChwQuickReadingPage = lazy(() => import('./pages/ChwQuickReadingPage.jsx'))
const ChwVisitsPage = lazy(() => import('./pages/ChwVisitsPage.jsx'))
const NearbyCentresPage = lazy(() => import('./pages/NearbyCentresPage.jsx'))
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage.jsx'))
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'))

function NotFoundPage() {
  return <PlaceholderPage titleKey="notFoundTitle" descriptionKey="notFoundDescription" />
}

function DronePageFallback() {
  const { t } = useTranslation()
  return (
    <div className="grid min-h-48 place-items-center p-6 text-center font-semibold text-muted" role="status" aria-busy="true">
      {t('loading')}
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<DronePageFallback />}>
      <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="patient" element={<RoleRoute allowedRoles={['patient']}><PatientDashboardPage /></RoleRoute>} />
        <Route path="patient/readings/new" element={<RoleRoute allowedRoles={['patient']}><AddReadingPage /></RoleRoute>} />
        <Route path="patient/history" element={<RoleRoute allowedRoles={['patient']}><ReadingHistoryPage /></RoleRoute>} />
        <Route path="patient/reports" element={<RoleRoute allowedRoles={['patient']}><ReportsPage /></RoleRoute>} />
        <Route path="patient/alerts" element={<RoleRoute allowedRoles={['patient']}><AlertsPage /></RoleRoute>} />
        <Route path="patient/medications" element={<RoleRoute allowedRoles={['patient']}><PlaceholderPage titleKey="medicationsTitle" descriptionKey="medicationsPhaseTwo" /></RoleRoute>} />
        <Route path="patient/appointments" element={<RoleRoute allowedRoles={['patient']}><AppointmentsPage /></RoleRoute>} />
        <Route path="patient/centres" element={<RoleRoute allowedRoles={['patient']}><NearbyCentresPage /></RoleRoute>} />
        <Route path="patient/sos" element={<RoleRoute allowedRoles={['patient']}><SosPage /></RoleRoute>} />
        <Route path="patient/profile" element={<Navigate to="/patients/me" replace />} />
        <Route path="doctor" element={<RoleRoute allowedRoles={['doctor']}><DoctorDashboardPage /></RoleRoute>} />
        <Route path="doctor/patients" element={<RoleRoute allowedRoles={['doctor']}><PatientListPage /></RoleRoute>} />
        <Route path="doctor/patients/:patientId" element={<RoleRoute allowedRoles={['doctor']}><PatientDetailPage /></RoleRoute>} />
        <Route path="doctor/alerts" element={<RoleRoute allowedRoles={['doctor']}><AlertsPage /></RoleRoute>} />
        <Route path="doctor/appointments" element={<RoleRoute allowedRoles={['doctor']}><AppointmentsPage /></RoleRoute>} />
        <Route path="chw" element={<RoleRoute allowedRoles={['chw']}><ChwDashboardPage /></RoleRoute>} />
        <Route path="chw/readings/new" element={<RoleRoute allowedRoles={['chw']}><ChwQuickReadingPage /></RoleRoute>} />
        <Route path="chw/patients" element={<RoleRoute allowedRoles={['chw']}><PatientListPage /></RoleRoute>} />
        <Route path="chw/visits" element={<RoleRoute allowedRoles={['chw']}><ChwVisitsPage /></RoleRoute>} />
        <Route path="chw/landing-points" element={<RoleRoute allowedRoles={['chw']}><Suspense fallback={<DronePageFallback />}><ChwLandingPointsPage /></Suspense></RoleRoute>} />
        <Route path="chw/alerts" element={<RoleRoute allowedRoles={['chw']}><AlertsPage /></RoleRoute>} />
        <Route path="chw/appointments" element={<RoleRoute allowedRoles={['chw']}><AppointmentsPage /></RoleRoute>} />
        <Route path="admin" element={<RoleRoute allowedRoles={['admin']}><PlaceholderPage titleKey="administrationTitle" descriptionKey="administrationDescription" /></RoleRoute>} />
        <Route path="admin/users" element={<RoleRoute allowedRoles={['admin']}><PlaceholderPage titleKey="userManagement" descriptionKey="userManagementDescription" /></RoleRoute>} />
        <Route path="admin/patients" element={<RoleRoute allowedRoles={['admin']}><PatientListPage /></RoleRoute>} />
        <Route path="admin/thresholds" element={<RoleRoute allowedRoles={['admin']}><PlaceholderPage titleKey="clinicalThresholds" descriptionKey="clinicalThresholdsDescription" /></RoleRoute>} />
        <Route path="admin/operations" element={<RoleRoute allowedRoles={['admin']}><Suspense fallback={<DronePageFallback />}><DroneDispatchPage /></Suspense></RoleRoute>} />
        <Route path="admin/alerts" element={<RoleRoute allowedRoles={['admin']}><AlertsPage /></RoleRoute>} />
        <Route path="admin/reports" element={<RoleRoute allowedRoles={['admin']}><ReportsPage /></RoleRoute>} />
        <Route path="reports/patient/:patientId" element={<RoleRoute allowedRoles={['patient', 'doctor', 'chw', 'admin']}><ReportsPage /></RoleRoute>} />
        <Route path="patients/new" element={<RoleRoute allowedRoles={['chw', 'admin']}><PatientFormPage /></RoleRoute>} />
        <Route path="patients/me" element={<RoleRoute allowedRoles={['patient']}><PatientDetailPage /></RoleRoute>} />
        <Route path="patients/:patientId/edit" element={<RoleRoute allowedRoles={['patient', 'doctor', 'chw', 'admin']}><PatientFormPage /></RoleRoute>} />
        <Route path="patients/:patientId" element={<RoleRoute allowedRoles={['patient', 'doctor', 'chw', 'admin']}><PatientDetailPage /></RoleRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
