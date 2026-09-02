import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'

// Auth
import Login    from './pages/auth/Login'
import Register from './pages/auth/Register'

// Patient
import PatientLayout       from './pages/patient/PatientLayout'
import PatientDashboard    from './pages/patient/Dashboard'
import FindDoctors         from './pages/patient/FindDoctors'
import BookAppointment     from './pages/patient/BookAppointment'
import MyAppointments      from './pages/patient/MyAppointments'
import Teleconsultation    from './pages/patient/Teleconsultation'
import Prescriptions       from './pages/patient/Prescriptions'
import AIScanner           from './pages/patient/AIScanner'
import PatientProfile      from './pages/patient/Profile'
import Vitals              from './pages/patient/Vitals'

// Doctor
import DoctorLayout        from './pages/doctor/DoctorLayout'
import DoctorDashboard     from './pages/doctor/Dashboard'
import DoctorAppointments  from './pages/doctor/Appointments'
import IssuePrescription   from './pages/doctor/IssuePrescription'
import AllPrescriptions    from './pages/doctor/AllPrescriptions'
import DoctorTeleconsultation from './pages/doctor/Teleconsultation'
import DoctorProfile       from './pages/doctor/DoctorProfile'

// BHW
import BHWLayout           from './pages/bhw/BHWLayout'
import BHWDashboard        from './pages/bhw/Dashboard'
import BHWPatients         from './pages/bhw/Patients'
import BHWRecordVitals     from './pages/bhw/RecordVitals'
import BHWRegisterPatient  from './pages/bhw/RegisterPatient'
import BHWScanPrescription from './pages/bhw/ScanPrescription'
import BHWMedicalHistory   from './pages/bhw/MedicalHistory'

// Admin
import AdminLayout         from './pages/admin/AdminLayout'
import AdminDashboard      from './pages/admin/Dashboard'
import UserManagement      from './pages/admin/UserManagement'
import Announcements       from './pages/admin/Announcements'
import AuditLogs           from './pages/admin/AuditLogs'

const roleHome = {
  patient: '/dashboard',
  doctor:  '/doctor/dashboard',
  bhw:     '/bhw/dashboard',
  admin:   '/admin/dashboard',
}

const Spinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-10 w-10 border-4 border-patient-600 border-t-transparent"/>
  </div>
)

function ProtectedRoute({ children, role }) {
  const { user, profile, loading, profileReady } = useAuth()
  if (loading || !profileReady) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (role && profile?.role !== role) {
    return <Navigate to={roleHome[profile?.role] || '/login'} replace />
  }
  return children
}

function RoleRedirect() {
  const { user, profile, loading, profileReady } = useAuth()
  if (loading || !profileReady) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={roleHome[profile?.role] || '/login'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/"        element={<RoleRedirect />} />
          <Route path="/login"   element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Patient Portal */}
          <Route path="/" element={<ProtectedRoute role="patient"><PatientLayout /></ProtectedRoute>}>
            <Route path="dashboard"        element={<PatientDashboard />} />
            <Route path="vitals"           element={<Vitals />} />
            <Route path="find-doctors"     element={<FindDoctors />} />
            <Route path="book-appointment" element={<BookAppointment />} />
            <Route path="appointments"     element={<MyAppointments />} />
            <Route path="teleconsultation" element={<Teleconsultation />} />
            <Route path="prescriptions"    element={<Prescriptions />} />
            <Route path="ai-scanner"       element={<AIScanner />} />
            <Route path="profile"          element={<PatientProfile />} />
          </Route>

          {/* Doctor Portal */}
          <Route path="/doctor" element={<ProtectedRoute role="doctor"><DoctorLayout /></ProtectedRoute>}>
            <Route path="dashboard"     element={<DoctorDashboard />} />
            <Route path="appointments"  element={<DoctorAppointments />} />
            <Route path="prescribe"     element={<IssuePrescription />} />
            <Route path="prescriptions" element={<AllPrescriptions />} />
            <Route path="teleconsultation" element={<DoctorTeleconsultation />} />
            <Route path="profile"       element={<DoctorProfile />} />
          </Route>

          {/* BHW Portal */}
          <Route path="/bhw" element={<ProtectedRoute role="bhw"><BHWLayout /></ProtectedRoute>}>
            <Route path="dashboard"         element={<BHWDashboard />} />
            <Route path="patients"          element={<BHWPatients />} />
            <Route path="record-vitals"     element={<BHWRecordVitals />} />
            <Route path="register-patient"  element={<BHWRegisterPatient />} />
            <Route path="scan-prescription" element={<BHWScanPrescription />} />
            <Route path="medical-history"   element={<BHWMedicalHistory />} />
          </Route>

          {/* Admin Portal */}
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
            <Route path="dashboard"     element={<AdminDashboard />} />
            <Route path="users"         element={<UserManagement />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="audit-logs"    element={<AuditLogs />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
