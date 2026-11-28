import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Search, History, UserPlus, Users, Shield, Activity, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import AnnouncementsFeed from '../../components/shared/AnnouncementsFeed'
import { usePatients, patientName, patientInitials, barangayOf } from '../../components/bhw/patientUtils'
import { manilaToday } from '../../lib/queue'

const ACTIONS = [
  { icon: Heart,    label: 'Record Vitals',    to: '/bhw/record-vitals',    cls: 'bg-orange-50 border-orange-100 text-orange-600' },
  { icon: Search,   label: 'Search Patient',   to: '/bhw/patients',         cls: 'bg-bhw-50 border-bhw-100 text-bhw-700' },
  { icon: UserPlus, label: 'Register Patient', to: '/bhw/register-patient', cls: 'bg-blue-50 border-blue-100 text-blue-600' },
  { icon: History,  label: 'Medical History',  to: '/bhw/medical-history',  cls: 'bg-purple-50 border-purple-100 text-purple-600' },
]

export default function BHWDashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { patients, loading } = usePatients()
  const [vitalsToday, setVitalsToday] = useState(null)

  const hour  = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.first_name || 'BHW'

  // Vitals recorded since midnight (Philippine time).
  useEffect(() => {
    const since = new Date(`${manilaToday()}T00:00:00+08:00`).toISOString()
    supabase.from('vitals').select('id', { count: 'exact', head: true }).gte('measured_at', since)
      .then(({ count }) => setVitalsToday(count ?? 0))
  }, [])

  const recent = patients.slice(0, 6)
  const open = (path, p) => navigate(path, { state: { patientId: p.user_id, patientName: patientName(p.profiles) } })

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      <AnnouncementsFeed tone="bhw"/>

      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-bhw-800 to-bhw-600 rounded-2xl py-5 px-6 text-white relative overflow-hidden">
        <Shield className="absolute right-4 top-1/2 -translate-y-1/2 w-24 h-24 opacity-15"/>
        <p className="text-teal-200 text-sm font-medium">{greet}</p>
        <h1 className="text-2xl font-bold">Welcome, {firstName}!</h1>
        <p className="text-teal-100 text-sm">Barangay Health Worker</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-sm font-semibold px-3 py-1 rounded-full">
            <Users className="w-4 h-4"/> {loading ? '…' : patients.length} Registered Patient{patients.length === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-sm font-semibold px-3 py-1 rounded-full">
            <Activity className="w-4 h-4"/> {vitalsToday ?? '…'} Vitals Recorded Today
          </span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ACTIONS.map(({ icon: Icon, label, to, cls }) => (
          <button key={to} onClick={() => navigate(to)}
            className={`${cls} border rounded-2xl px-4 py-4 flex items-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all text-left`}>
            <Icon className="w-6 h-6 shrink-0"/>
            <span className="font-semibold text-sm">{label}</span>
          </button>
        ))}
      </div>

      {/* Recent patients */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-bhw-600"/> Recent Patients
          </h2>
          <button onClick={() => navigate('/bhw/patients')}
            className="text-bhw-600 text-sm font-semibold hover:underline flex items-center gap-0.5">
            View all patients <ChevronRight className="w-4 h-4"/>
          </button>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-100">{[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse bg-gray-50/60"/>)}</div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3 px-4">
            <Users className="w-10 h-10 text-gray-300"/>
            <p className="font-semibold text-gray-500">No patients registered yet</p>
            <button onClick={() => navigate('/bhw/register-patient')}
              className="flex items-center gap-2 bg-bhw-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-bhw-700">
              <UserPlus className="w-4 h-4"/> Register First Patient
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recent.map(p => (
              <div key={p.user_id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="w-9 h-9 bg-bhw-100 rounded-full flex items-center justify-center text-bhw-700 font-bold text-xs shrink-0">
                  {patientInitials(p.profiles)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{patientName(p.profiles)}</p>
                  <p className="text-gray-500 text-xs truncate">{p.profiles?.email || '—'}</p>
                </div>
                {barangayOf(p) && (
                  <span className="hidden sm:inline text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">Brgy. {barangayOf(p)}</span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => open('/bhw/record-vitals', p)}
                    className="flex items-center gap-1 text-orange-600 text-xs font-semibold bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-lg">
                    <Heart className="w-3.5 h-3.5"/> <span className="hidden md:inline">Vitals</span>
                  </button>
                  <button onClick={() => open('/bhw/medical-history', p)}
                    className="flex items-center gap-1 text-purple-600 text-xs font-semibold bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg">
                    <History className="w-3.5 h-3.5"/> <span className="hidden md:inline">History</span>
                  </button>
                  <button onClick={() => open('/bhw/medical-history', p)}
                    className="text-bhw-600 text-xs font-semibold hover:underline px-1.5">View →</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Register Patient button on phones */}
      <div className="fixed bottom-6 right-6 lg:hidden">
        <button onClick={() => navigate('/bhw/register-patient')}
          className="flex items-center gap-2 bg-bhw-600 text-white font-bold px-5 py-3.5 rounded-2xl shadow-lg hover:bg-bhw-700 active:scale-95 transition-all">
          <UserPlus className="w-5 h-5"/> Register Patient
        </button>
      </div>
    </div>
  )
}
