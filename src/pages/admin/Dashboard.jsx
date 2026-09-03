import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Shield, Stethoscope,
  ChevronRight, Megaphone, ClipboardList, RefreshCw, ShieldCheck
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

function StatCard({ icon: Icon, value, label, color, bg, onClick }) {
  return (
    <button onClick={onClick}
      className={`${bg} rounded-2xl p-5 flex flex-col items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all text-center border border-white/60`}>
      <Icon className={`w-7 h-7 ${color}`}/>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-sm font-medium text-gray-600">{label}</p>
    </button>
  )
}

function ManagementItem({ icon: Icon, iconBg, iconColor, title, subtitle, to }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(to)}
      className="card flex items-center gap-4 hover:shadow-md active:scale-[0.99] transition-all p-4 text-left w-full">
      <div className={`w-11 h-11 ${iconBg} rounded-xl flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`}/>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0"/>
    </button>
  )
}

export default function AdminDashboard() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [stats, setStats]   = useState({ patients: 0, bhws: 0, doctors: 0 })
  const [loading, setLoading] = useState(true)

  const firstName = profile?.first_name || 'Admin'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('role')
    const profiles = data || []
    setStats({
      patients: profiles.filter(p => p.role === 'patient').length,
      bhws:     profiles.filter(p => p.role === 'bhw').length,
      doctors:  profiles.filter(p => p.role === 'doctor').length,
    })
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-admin-800 to-admin-600 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-10">
          <ShieldCheck className="w-32 h-32"/>
        </div>
        <p className="text-green-200 text-sm font-medium">System Administrator</p>
        <h1 className="text-2xl font-bold mt-1">Welcome, {firstName}</h1>
        <p className="text-green-100 text-sm mt-0.5">Health Connect — System Administrator</p>
        <div className="flex gap-3 mt-4">
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

      {/* System Overview */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-3">
          <span className="text-gray-500">
            <svg className="w-5 h-5 inline" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 3h18v4H3zm0 6h8v12H3zm10 0h8v12h-8z"/>
            </svg>
          </span>
          System Overview
        </h2>
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse"/>)}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={Users}       value={stats.patients} label="Patients"
              color="text-doctor-600"  bg="bg-doctor-50"
              onClick={() => navigate('/admin/users')}
            />
            <StatCard
              icon={Shield}      value={stats.bhws}     label="BHWs"
              color="text-bhw-600"     bg="bg-bhw-50"
              onClick={() => navigate('/admin/users')}
            />
            <StatCard
              icon={Stethoscope} value={stats.doctors}  label="Doctors"
              color="text-blue-600"    bg="bg-blue-50"
              onClick={() => navigate('/admin/users')}
            />
          </div>
        )}
      </div>

      {/* Management */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-3">
          <ShieldCheck className="w-5 h-5 text-admin-600"/> Management
        </h2>
        <div className="space-y-3">
          <ManagementItem
            icon={Users}       iconBg="bg-bhw-100"    iconColor="text-bhw-600"
            title="User Management"  subtitle="View, activate, or deactivate"
            to="/admin/users"
          />
          <ManagementItem
            icon={Megaphone}   iconBg="bg-blue-100"   iconColor="text-blue-600"
            title="Announcements"    subtitle="Post system-wide announcements"
            to="/admin/announcements"
          />
          <ManagementItem
            icon={ClipboardList} iconBg="bg-orange-100" iconColor="text-orange-500"
            title="Audit Logs"       subtitle="View all system activity logs"
            to="/admin/audit-logs"
          />
        </div>
      </div>
    </div>
  )
}
