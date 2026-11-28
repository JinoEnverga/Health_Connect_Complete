import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Shield, Stethoscope, ChevronRight, Megaphone, ClipboardList, RefreshCw, ShieldCheck, UserCog, LayoutGrid } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const WEEK_MS = 7 * 86_400_000

const MANAGEMENT = [
  { icon: Users,         to: '/admin/users',         title: 'User Management', subtitle: 'Roles, search and account access', cls: 'bg-bhw-100 text-bhw-600' },
  { icon: Megaphone,     to: '/admin/announcements', title: 'Announcements',   subtitle: 'Post to the website and mobile app', cls: 'bg-blue-100 text-blue-600' },
  { icon: ClipboardList, to: '/admin/audit-logs',    title: 'Audit Logs',      subtitle: 'All system activity',               cls: 'bg-orange-100 text-orange-500' },
]

export default function AdminDashboard() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)

  const firstName = profile?.first_name || 'Admin'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('role, created_at, is_active')
    setUsers(data || [])
    setLoading(false)
  }

  const since = Date.now() - WEEK_MS
  const stat = role => {
    const list = role ? users.filter(u => u.role === role) : users
    return {
      count: list.length,
      newThisWeek: list.filter(u => u.created_at && new Date(u.created_at).getTime() >= since).length,
      blocked: list.filter(u => u.is_active === false).length,
    }
  }

  const CARDS = [
    { key: 'patient', label: 'Patients', icon: Users,       cls: 'bg-doctor-50 text-doctor-600' },
    { key: 'doctor',  label: 'Doctors',  icon: Stethoscope, cls: 'bg-blue-50 text-blue-600' },
    { key: 'bhw',     label: 'BHWs',     icon: Shield,      cls: 'bg-bhw-50 text-bhw-600' },
    { key: 'admin',   label: 'Admins',   icon: UserCog,     cls: 'bg-purple-50 text-purple-600' },
    { key: null,      label: 'Total Users', icon: LayoutGrid, cls: 'bg-gray-100 text-gray-700' },
  ]

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="bg-gradient-to-r from-admin-800 to-admin-600 rounded-2xl py-5 px-6 text-white relative overflow-hidden">
        <ShieldCheck className="absolute right-4 top-1/2 -translate-y-1/2 w-24 h-24 opacity-10"/>
        <p className="text-green-200 text-sm font-medium">System Administrator</p>
        <h1 className="text-2xl font-bold">Welcome, {firstName}</h1>
        <div className="flex flex-wrap gap-2 mt-3">
          <button onClick={() => navigate('/admin/users')}
            className="flex items-center gap-2 bg-white text-admin-700 font-semibold px-4 py-2 rounded-xl text-sm hover:bg-green-50 transition-all">
            <Users className="w-4 h-4"/> Manage Users
          </button>
          <button onClick={load}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-all">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/> Refresh
          </button>
        </div>
      </div>

      {/* System overview */}
      <div>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">System Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {CARDS.map(({ key, label, icon: Icon, cls }) => {
            const s = stat(key)
            return (
              <button key={label} onClick={() => navigate('/admin/users', { state: { role: key || 'all' } })}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3 hover:shadow-md transition-all text-left">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
                  <Icon className="w-5 h-5"/>
                </div>
                <div className="min-w-0">
                  {loading
                    ? <div className="h-7 w-10 bg-gray-100 rounded animate-pulse"/>
                    : <p className="text-2xl font-bold text-gray-900 leading-tight">{s.count}</p>}
                  <p className="text-xs font-medium text-gray-500">{label}</p>
                  {!loading && (
                    <p className={`text-[11px] font-semibold ${s.blocked ? 'text-red-600' : s.newThisWeek ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {s.blocked ? `${s.blocked} blocked` : s.newThisWeek ? `+${s.newThisWeek} this week` : 'No change this week'}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Management */}
      <div>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MANAGEMENT.map(({ icon: Icon, to, title, subtitle, cls }) => (
            <button key={to} onClick={() => navigate(to)}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md active:scale-[0.99] transition-all p-4 text-left w-full">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
                <Icon className="w-5 h-5"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{title}</p>
                <p className="text-sm text-gray-500 truncate">{subtitle}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0"/>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
