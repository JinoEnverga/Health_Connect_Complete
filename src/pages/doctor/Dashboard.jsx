import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, FileText, Users, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

function StatCard({ icon: Icon, value, label, sub, color, bg }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center shrink-0`}>
        <Icon className={`w-6 h-6 ${color}`}/>
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

export default function DoctorDashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats]         = useState({ upcoming: 0, rxIssued: 0, activeRx: 0, dispensed: 0 })
  const [appointments, setAppts]  = useState([])
  const [docProfile, setDocProf]  = useState(null)
  const [loading, setLoading]     = useState(true)

  const hour    = new Date().getHours()
  const greet   = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.first_name || 'Doctor'

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true)
    const [appts, rxData, dpData] = await Promise.all([
      supabase.from('appointments').select('*, profiles!appointments_patient_id_fkey(first_name, last_name)').eq('doctor_id', user.id).order('appointment_date', { ascending: true }),
      supabase.from('prescriptions').select('id, status').eq('doctor_id', user.id),
      supabase.from('doctor_profiles').select('*, profiles(first_name,last_name)').eq('user_id', user.id).single(),
    ])

    const allAppts = appts.data || []
    const allRx    = rxData.data || []
    setStats({
      upcoming:  allAppts.filter(a => a.status === 'upcoming').length,
      rxIssued:  allRx.length,
      activeRx:  allRx.filter(r => r.status === 'active').length,
      dispensed: allRx.filter(r => r.status === 'dispensed').length,
    })
    setAppts(allAppts.filter(a => a.status === 'upcoming').slice(0, 5))
    setDocProf(dpData.data)
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-doctor-800 to-doctor-600 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-6 top-4 opacity-10">
          <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>
        <p className="text-emerald-200 text-sm font-medium">{greet}</p>
        <h1 className="text-2xl font-bold mt-1">Dr. {firstName}</h1>
        <p className="text-emerald-100 text-sm mt-1">
          {docProfile?.specialization || 'General Practitioner'} · {docProfile?.clinic_name || 'Clinic'}
        </p>
        <div className="flex gap-3 mt-4">
          <button onClick={() => navigate('/doctor/prescribe')}
            className="flex items-center gap-2 bg-white text-doctor-700 font-semibold px-4 py-2 rounded-xl text-sm hover:bg-emerald-50 transition-all">
            <FileText className="w-4 h-4"/> Issue Prescription
          </button>
          <button onClick={() => navigate('/doctor/appointments')}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-all">
            <Calendar className="w-4 h-4"/> View Appointments
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Calendar}     value={stats.upcoming}  label="Upcoming Appts"  color="text-doctor-600"  bg="bg-doctor-50"/>
        <StatCard icon={FileText}     value={stats.rxIssued}  label="Rx Issued"       color="text-blue-600"    bg="bg-blue-50"/>
        <StatCard icon={Clock}        value={stats.activeRx}  label="Active Rx"       color="text-orange-600"  bg="bg-orange-50"/>
        <StatCard icon={CheckCircle}  value={stats.dispensed} label="Dispensed"       color="text-green-600"   bg="bg-green-50"/>
      </div>

      {/* Upcoming Appointments */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Upcoming Appointments</h2>
          <button onClick={() => navigate('/doctor/appointments')} className="text-doctor-600 text-sm font-medium hover:underline">
            View all →
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card animate-pulse h-20 bg-gray-50"/>)}</div>
        ) : appointments.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mb-3"/>
            <p className="font-semibold text-gray-500">No upcoming appointments</p>
            <p className="text-gray-400 text-sm mt-1">Patients will book appointments from their portal</p>
          </div>
        ) : (
          <div className="space-y-3">
            {appointments.map(a => {
              const pat = a.profiles
              const patName = pat ? `${pat.first_name} ${pat.last_name}` : 'Patient'
              const patInitials = [pat?.first_name?.[0], pat?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'P'
              return (
                <div key={a.id} className="card flex items-center gap-4">
                  <div className="w-10 h-10 bg-doctor-100 rounded-full flex items-center justify-center text-doctor-700 font-bold text-sm shrink-0">
                    {patInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{patName}</p>
                    <p className="text-gray-500 text-xs">{a.appointment_date} · {a.time_slot}</p>
                    {a.chief_complaint && <p className="text-gray-400 text-xs truncate mt-0.5">{a.chief_complaint}</p>}
                  </div>
                  <span className="badge-active shrink-0">Upcoming</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
