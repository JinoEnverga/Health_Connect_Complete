import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Search, Calendar, Video, FileText,
  Cpu, User, LogOut, Bell, Activity, ChevronRight, Menu, X
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import TelemedicineLogo from '../../components/TelemedicineLogo'
import BirthYearGate from '../../components/patient/BirthYearGate'

const nav = [
  { to: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/vitals',           icon: Activity,        label: 'My Vitals' },
  { to: '/find-doctors',     icon: Search,          label: 'Find Doctors' },
  { to: '/appointments',     icon: Calendar,        label: 'My Appointments' },
  { to: '/teleconsultation', icon: Video,           label: 'Teleconsultation' },
  { to: '/prescriptions',    icon: FileText,        label: 'E-Prescriptions',  badge: 'RX' },
  { to: '/ai-scanner',       icon: Cpu,             label: 'AI Scanner',       badge: 'AI' },
  { to: '/profile',          icon: User,            label: 'My Profile' },
]

export default function PatientLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join('') || 'U'
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'User'

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="sidebar-patient h-full flex flex-col text-white w-60">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-blue-500/30">
        <div className="flex items-center gap-3">
          <TelemedicineLogo className="w-9 h-9 shrink-0"/>
          <div>
            <div className="font-bold text-base leading-tight">Health</div>
            <div className="font-bold text-base leading-tight">Connect</div>
          </div>
        </div>
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-b border-blue-500/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{fullName}</p>
            <p className="text-blue-200 text-xs truncate">{profile?.email}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-blue-300 text-xs font-semibold uppercase tracking-wider px-2 mb-2">MENU</p>
        {nav.map(({ to, icon: Icon, label, badge }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white'
              }`
            }>
            <Icon className="w-4 h-4 shrink-0"/>
            <span className="flex-1">{label}</span>
            {badge && (
              <span className="text-xs font-bold bg-white/20 px-1.5 py-0.5 rounded-md">{badge}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-5">
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-blue-100 hover:bg-white/10 hover:text-white transition-all w-full">
          <LogOut className="w-4 h-4"/>
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <BirthYearGate />
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
          <div className="flex-1"/>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
              <Bell className="w-5 h-5 text-gray-600"/>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"/>
            </button>
            <div className="w-8 h-8 bg-patient-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
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
