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
import DoctorProfile       from './pages/doctor/DoctorProfile'

// Pharmacist
import VerifyRx            from './pages/verify/VerifyRx'

function ProtectedRoute({ children, role }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-10 w-10 border-4 border-patient-600 border-t-transparent"/></div>
  if (!user) return <Navigate to="/login" replace />
  if (role && profile?.role !== role) {
    return <Navigate to={profile?.role === 'doctor' ? '/doctor/dashboard' : '/dashboard'} replace />
  }
  return children
}

function RoleRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-10 w-10 border-4 border-patient-600 border-t-transparent"/></div>
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={profile?.role === 'doctor' ? '/doctor/dashboard' : '/dashboard'} replace />
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
          <Route path="/verify/rx/:token" element={<VerifyRx />} />

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
            <Route path="profile"       element={<DoctorProfile />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
