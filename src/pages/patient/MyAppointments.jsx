import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Video, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const tabs = ['All', 'Upcoming', 'Completed', 'Cancelled']
const statusColor = { upcoming: 'badge-active', completed: 'bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full', cancelled: 'bg-red-100 text-red-700 text-xs font-semibold px-2 py-1 rounded-full', no_show: 'bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-1 rounded-full' }
const statusIcon = { upcoming: Clock, completed: CheckCircle, cancelled: XCircle, no_show: XCircle }

export default function MyAppointments() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [appts, setAppts]     = useState([])
  const [active, setActive]   = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) load()
  }, [user])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('appointment_details')
      .select('*')
      .eq('patient_id', user.id)
      .order('appointment_date', { ascending: false })
    setAppts(data || [])
    setLoading(false)
  }

  const filtered = active === 'All' ? appts : appts.filter(a => a.status === active.toLowerCase())
  const counts = tabs.reduce((acc, t) => ({
    ...acc,
    [t]: t === 'All' ? appts.length : appts.filter(a => a.status === t.toLowerCase()).length
  }), {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Appointments</h1>
          <p className="text-gray-500 text-sm mt-1">View and manage your scheduled consultations</p>
        </div>
        <button onClick={load} className="btn-outline">
          <RefreshCw className="w-4 h-4"/> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t} onClick={() => setActive(t)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${active === t ? 'bg-white shadow text-patient-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t} <span className="text-xs opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="card animate-pulse h-24 bg-gray-50"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Calendar className="w-12 h-12 text-gray-300 mb-3"/>
          <p className="font-semibold text-gray-500">No {active.toLowerCase()} appointments</p>
          {active !== 'Completed' && (
            <button onClick={() => navigate('/book-appointment')} className="btn-primary-patient mt-4 px-6 py-2.5 text-sm">
              Book an Appointment
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const Icon = statusIcon[a.status] || Clock
            return (
              <div key={a.id} className="card flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${a.status === 'upcoming' ? 'bg-patient-100' : a.status === 'completed' ? 'bg-blue-100' : 'bg-red-100'}`}>
                  <Icon className={`w-5 h-5 ${a.status === 'upcoming' ? 'text-patient-600' : a.status === 'completed' ? 'text-blue-600' : 'text-red-500'}`}/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{a.doctor_name ? `Dr. ${a.doctor_name}` : 'Doctor'}</p>
                  <p className="text-patient-600 text-xs font-medium">{a.doctor_specialization}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{a.appointment_date} · {a.time_slot}</p>
                  {a.chief_complaint && <p className="text-gray-400 text-xs mt-0.5 truncate">{a.chief_complaint}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={statusColor[a.status]}>{a.status.charAt(0).toUpperCase() + a.status.slice(1)}</span>
                  {a.status === 'upcoming' && (
                    <button onClick={() => navigate('/teleconsultation', { state: { appointment: a } })}
                      className="flex items-center gap-1 text-xs text-patient-600 font-semibold hover:underline">
                      <Video className="w-3 h-3"/> Join Call
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
