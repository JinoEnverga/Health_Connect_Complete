import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Calendar, Video, TrendingUp, Clock, CheckCircle, Users, Activity } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

function StatCard({ icon: Icon, value, label, sub, color }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center shrink-0`}>
        <Icon className="w-6 h-6 text-white"/>
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

function QuickAction({ icon: Icon, label, sub, color, onClick }) {
  return (
    <button onClick={onClick}
      className="card flex flex-col items-center gap-2 py-5 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer text-center">
      <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center`}>
        <Icon className="w-6 h-6 text-white"/>
      </div>
      <p className="font-semibold text-sm text-gray-800">{label}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </button>
  )
}

export default function PatientDashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ upcoming: 0, completed: 0, doctors: 0 })
  const [upcomingAppts, setUpcomingAppts] = useState([])
  const [latestVitals, setLatestVitals]   = useState(null)
  const [loading, setLoading] = useState(true)

  const hour  = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const emoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙'

  const firstName = profile?.first_name || 'there'

  useEffect(() => {
    async function load() {
      if (!user) return
      const [appts, doctors, vitals] = await Promise.all([
        supabase.from('appointments').select('*').eq('patient_id', user.id),
        supabase.from('doctor_profiles').select('id').eq('is_accepting_patients', true),
        supabase.from('vitals').select('*').eq('patient_id', user.id).order('measured_at', { ascending: false }).limit(1),
      ])
      const all = appts.data || []
      setStats({
        upcoming:  all.filter(a => a.status === 'upcoming').length,
        completed: all.filter(a => a.status === 'completed').length,
        doctors:   doctors.data?.length || 0,
      })
      setUpcomingAppts(all.filter(a => a.status === 'upcoming').slice(0, 3))
      setLatestVitals(vitals.data?.[0] || null)
      setLoading(false)
    }
    load()
  }, [user])

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className="bg-gradient-to-r from-patient-700 to-patient-500 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-10">
          <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/>
          </svg>
        </div>
        <p className="text-blue-200 text-sm font-medium">{greet} {emoji}</p>
        <h1 className="text-2xl font-bold mt-1">{firstName.charAt(0).toUpperCase() + firstName.slice(1)}</h1>
        <p className="text-blue-100 text-sm mt-1">Your health is our priority. Stay on top of your appointments and consultations.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Clock}        value={stats.upcoming}  label="Upcoming"       sub="Appointments"    color="bg-patient-500"/>
        <StatCard icon={CheckCircle}  value={stats.completed} label="Completed"      sub="All time"        color="bg-green-500"/>
        <StatCard icon={Users}        value={stats.doctors}   label="Doctors"        sub="Available now"   color="bg-purple-500"/>
        <StatCard icon={Activity}     value={latestVitals ? `${latestVitals.heart_rate||'—'} bpm` : '—'} label="Heart Rate" sub="Latest reading" color="bg-orange-500"/>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickAction icon={Search}   label="Find a Doctor"      sub="Search specialists"  color="bg-patient-500" onClick={() => navigate('/find-doctors')}/>
          <QuickAction icon={Calendar} label="Book Appointment"   sub="Schedule a visit"    color="bg-green-500"   onClick={() => navigate('/book-appointment')}/>
          <QuickAction icon={Video}    label="Start Teleconsult"  sub="Video consultation"  color="bg-purple-500"  onClick={() => navigate('/teleconsultation')}/>
          <QuickAction icon={Activity} label="Log Vitals"         sub="Track your health"   color="bg-orange-500"  onClick={() => navigate('/vitals')}/>
        </div>
      </div>

      {/* Upcoming Appointments */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Upcoming Appointments</h2>
          <button onClick={() => navigate('/appointments')} className="text-patient-600 text-sm font-medium hover:underline flex items-center gap-1">
            View all →
          </button>
        </div>

        {loading ? (
          <div className="card flex items-center justify-center py-10">
            <div className="animate-spin w-6 h-6 border-2 border-patient-600 border-t-transparent rounded-full"/>
          </div>
        ) : upcomingAppts.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mb-3"/>
            <p className="font-semibold text-gray-500">No upcoming appointments</p>
            <button onClick={() => navigate('/book-appointment')}
              className="mt-4 btn-primary-patient px-6 py-2.5 text-sm">
              Book an Appointment
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingAppts.map(a => (
              <div key={a.id} className="card flex items-center gap-4">
                <div className="w-10 h-10 bg-patient-100 rounded-xl flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5 text-patient-600"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{a.appointment_date}</p>
                  <p className="text-gray-500 text-xs">{a.time_slot} • {a.chief_complaint || 'Consultation'}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="badge-active">Upcoming</span>
                  <button onClick={() => navigate('/teleconsultation', { state: { appointment: a } })}
                    className="flex items-center gap-1 text-xs text-patient-600 font-semibold hover:underline">
                    <Video className="w-3 h-3"/> Join Call
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
