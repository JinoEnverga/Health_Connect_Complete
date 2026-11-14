import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Video, Clock, CheckCircle, XCircle, RefreshCw, Ticket, PlayCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { isActive, statusMeta, formatDay, estimateWindow } from '../../lib/queue'

const tabs = ['All', 'Upcoming', 'Completed', 'Cancelled']
const statusIcon = { upcoming: Clock, waiting: Ticket, in_progress: PlayCircle, completed: CheckCircle, cancelled: XCircle, no_show: XCircle }

// 'Upcoming' covers legacy slot bookings and live queue spots alike;
// 'Cancelled' also lists no-shows.
const inTab = (a, tab) =>
  tab === 'All' ? true
  : tab === 'Upcoming' ? isActive(a.status)
  : tab === 'Completed' ? a.status === 'completed'
  : ['cancelled', 'no_show'].includes(a.status)

export default function MyAppointments() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [appts, setAppts]     = useState([])
  const [active, setActive]   = useState('All')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [cancelling, setCancelling] = useState(null)

  useEffect(() => {
    if (user) load()
  }, [user])

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('appointments')
      .select(`*,
        doctor:profiles!appointments_doctor_id_fkey(first_name, last_name, doctor_profiles(specialization)),
        block:availability_blocks(avg_minutes_per_patient, now_serving)`)
      .eq('patient_id', user.id)
      .order('appointment_date', { ascending: false })
      .order('queue_number', { ascending: true, nullsFirst: true })
    if (err) setError(`Could not load appointments: ${err.message}`)
    setAppts(data || [])
    setLoading(false)
  }

  async function cancelSpot(a) {
    if (!confirm(`Cancel your queue spot #${a.queue_number}? Your place will be given up.`)) return
    setCancelling(a.id); setError('')
    const { error: err } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', a.id)
    setCancelling(null)
    if (err) { setError(`Could not cancel: ${err.message}`); return }
    load()
  }

  const filtered = appts.filter(a => inTab(a, active))
  const counts = Object.fromEntries(tabs.map(t => [t, appts.filter(a => inTab(a, t)).length]))

  const doctorName = a => a.doctor ? `Dr. ${a.doctor.first_name || ''} ${a.doctor.last_name || ''}`.trim() : 'Doctor'
  const specialization = a => a.doctor?.doctor_profiles?.specialization ?? a.doctor?.doctor_profiles?.[0]?.specialization

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

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

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
            const meta = statusMeta(a.status)
            const live = isActive(a.status)
            return (
              <div key={a.id} className="card flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${live ? 'bg-patient-100' : a.status === 'completed' ? 'bg-blue-100' : 'bg-red-100'}`}>
                  {a.queue_number
                    ? <span className={`font-bold text-sm ${live ? 'text-patient-600' : a.status === 'completed' ? 'text-blue-600' : 'text-red-500'}`}>#{a.queue_number}</span>
                    : <Icon className={`w-5 h-5 ${live ? 'text-patient-600' : a.status === 'completed' ? 'text-blue-600' : 'text-red-500'}`}/>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{doctorName(a)}</p>
                  <p className="text-patient-600 text-xs font-medium">{specialization(a)}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{formatDay(a.appointment_date, { year: 'numeric' })} · {a.time_slot}</p>
                  {a.status === 'waiting' && a.estimated_time && (
                    <p className="text-xs text-gray-700 mt-0.5">
                      Queue #{a.queue_number} · est. {estimateWindow(a.estimated_time, a.block?.avg_minutes_per_patient)}
                      {a.block?.now_serving ? ` · now serving #${a.block.now_serving}` : ''}
                    </p>
                  )}
                  {a.chief_complaint && <p className="text-gray-400 text-xs mt-0.5 truncate">{a.chief_complaint}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>
                  {live && (
                    <button onClick={() => navigate('/teleconsultation', { state: { appointment: a } })}
                      className="flex items-center gap-1 text-xs text-patient-600 font-semibold hover:underline">
                      <Video className="w-3 h-3"/> Join Call
                    </button>
                  )}
                  {a.status === 'waiting' && (
                    <button onClick={() => cancelSpot(a)} disabled={cancelling === a.id}
                      className="text-xs text-red-600 font-semibold hover:underline disabled:opacity-50">
                      {cancelling === a.id ? 'Cancelling...' : 'Cancel spot'}
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
