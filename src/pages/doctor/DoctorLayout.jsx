import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, FileText, ClipboardList,
  User, LogOut, Bell, Menu, CheckCircle, Video
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import TelemedicineLogo from '../../components/TelemedicineLogo'

const nav = [
  { to: '/doctor/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/doctor/appointments',  icon: Calendar,        label: 'Appointments' },
  { to: '/doctor/teleconsultation', icon: Video,        label: 'Teleconsultation' },
  { to: '/doctor/prescribe',     icon: FileText,        label: 'Issue Prescription' },
  { to: '/doctor/prescriptions', icon: ClipboardList,   label: 'All Prescriptions' },
  { to: '/doctor/profile',       icon: User,            label: 'My Profile' },
]

export default function DoctorLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join('') || 'D'
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Doctor'

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="sidebar-doctor h-full flex flex-col text-white w-60">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-emerald-500/30">
        <div className="flex items-center gap-3">
          <TelemedicineLogo className="w-9 h-9 shrink-0"/>
          <div>
            <div className="font-bold text-base leading-tight">Health</div>
            <div className="font-bold text-base leading-tight">Connect MD</div>
          </div>
        </div>
      </div>

      {/* Doctor badge */}
      <div className="px-4 py-4 border-b border-emerald-500/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="font-semibold text-sm truncate">{fullName}</p>
              <CheckCircle className="w-3.5 h-3.5 text-emerald-300 shrink-0"/>
            </div>
            <p className="text-emerald-200 text-xs">Licensed Doctor</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-emerald-300 text-xs font-semibold uppercase tracking-wider px-2 mb-2">DOCTOR PORTAL</p>
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-emerald-100 hover:bg-white/10 hover:text-white'
              }`
            }>
            <Icon className="w-4 h-4 shrink-0"/>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-5">
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-100 hover:bg-white/10 hover:text-white transition-all w-full">
          <LogOut className="w-4 h-4"/>
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)}/>
          <aside className="relative z-10 flex">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
            <Menu className="w-5 h-5 text-gray-600"/>
          </button>
          <span className="text-xs font-bold text-doctor-600 bg-doctor-50 px-3 py-1 rounded-full border border-doctor-100">
            Doctor Portal
          </span>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
              <Bell className="w-5 h-5 text-gray-600"/>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"/>
            </button>
            <div className="w-8 h-8 bg-doctor-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
