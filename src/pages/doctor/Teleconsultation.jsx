import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Video, CalendarClock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import CallRoom from '../../components/shared/CallRoom'
import CallHistory from '../../components/shared/CallHistory'
import { ACTIVE_STATUSES, manilaToday, formatDate, formatTimeOnly, formatSlot } from '../../lib/queue'

// Minutes since midnight for a slot like '9:00 AM' (for sorting).
function slotMinutes(slot) {
  const m = formatSlot(slot).match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return 0
  return ((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +m[2]
}
const sortKey = a => a.estimated_time
  ? new Date(a.estimated_time).getTime()
  : new Date(`${a.appointment_date}T00:00:00+08:00`).getTime() + slotMinutes(a.time_slot) * 60_000

const initials = p => [p?.first_name?.[0], p?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'P'

// When the session is: queue spot -> its estimated time; slot booking -> its slot.
function whenLabel(a) {
  if (a.block_id && a.estimated_time) {
    return `${formatDate(a.appointment_date)} · ~${formatTimeOnly(a.estimated_time)}${a.queue_number ? ` · Queue #${a.queue_number}` : ''}`
  }
  return `${formatDate(a.appointment_date)}${a.time_slot ? ` · ${formatSlot(a.time_slot)}` : ''}`
}

/**
 * Upcoming sessions card. Today's (and overdue) sessions can be started;
 * future-dated ones show a muted "Scheduled" state until their day comes.
 */
function UpcomingSessions({ appointments, onStart }) {
  const today = manilaToday()
  const list = [...appointments].sort((x, y) => sortKey(x) - sortKey(y))
  const firstToday = list.find(a => a.appointment_date === today)

  return (
    <div className="card lg:sticky lg:top-6">
      <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
        <CalendarClock className="w-4 h-4 text-gray-500"/> Upcoming Sessions
        <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{list.length}</span>
      </h2>

      {list.length === 0 ? (
        <div className="py-10 text-center">
          <Video className="w-8 h-8 text-gray-200 mx-auto mb-2"/>
          <p className="text-sm text-gray-500 font-medium">No teleconsultations scheduled</p>
          <p className="text-xs text-gray-400 mt-0.5">Booked appointments will appear here.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {list.map(a => {
            const isToday  = a.appointment_date === today
            const isPast   = a.appointment_date < today
            const canStart = isToday || isPast
            const name = [a.patient?.first_name, a.patient?.last_name].filter(Boolean).join(' ') || 'Patient'
            return (
              <div key={a.id} className={`flex items-center gap-3 py-3 ${canStart ? '' : 'opacity-70'}`}>
                <div className="w-10 h-10 bg-doctor-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                  {initials(a.patient)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm truncate">{name}</p>
                    {a.id === firstToday?.id && <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Up next</span>}
                    {isToday && a.id !== firstToday?.id && <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">Today</span>}
                    {isPast && <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Overdue</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{a.chief_complaint || 'General consultation'}</p>
                  <p className="text-xs text-gray-400">{whenLabel(a)}</p>
                </div>
                {canStart ? (
                  <button onClick={() => onStart(a)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shrink-0 transition-colors">
                    <Video className="w-4 h-4"/> Start Call
                  </button>
                ) : (
                  <span title="You can start this call on the day of the appointment"
                    className="bg-gray-100 text-gray-500 text-sm font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shrink-0 cursor-not-allowed">
                    <CalendarClock className="w-4 h-4"/> Scheduled
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function DoctorTeleconsultation() {
  const { user } = useAuth()
  const location = useLocation()
  const preselectedId = location.state?.appointment?.id || null

  const [appointment, setAppointment] = useState(null)
  const [upcoming, setUpcoming]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState('')

  useEffect(() => { if (user) load() }, [user, preselectedId])

  async function load() {
    setLoading(true); setLoadError('')

    // Always load the upcoming list — even when a specific appointment was
    // passed in — so "back" from that call has somewhere useful to land
    // instead of an empty state, in case it was the wrong one.
    const { data: upcomingData } = await supabase
      .from('appointments')
      .select(`*, patient:profiles!appointments_patient_id_fkey(first_name, last_name)`)
      .eq('doctor_id', user.id)
      .in('status', ACTIVE_STATUSES)
      .order('appointment_date', { ascending: true })
    setUpcoming(upcomingData || [])

    if (preselectedId) {
      const found = (upcomingData || []).find(a => a.id === preselectedId)
      if (found) { setAppointment(found); setLoading(false); return }
      const { data, error } = await supabase
        .from('appointments')
        .select(`*, patient:profiles!appointments_patient_id_fkey(first_name, last_name)`)
        .eq('id', preselectedId)
        .eq('doctor_id', user.id)
        .single()
      if (error || !data) setLoadError('Could not load that appointment.')
      else setAppointment(data)
    }
    setLoading(false)
  }

  if (loading) return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Teleconsultation</h1></div>
      <div className="card animate-pulse h-64 bg-gray-50"/>
    </div>
  )

  if (!appointment) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teleconsultation</h1>
        <p className="text-gray-500 text-sm mt-1">Video consultation sessions</p>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{loadError}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <UpcomingSessions appointments={upcoming} onStart={setAppointment}/>
        <CallHistory role="doctor" userId={user.id}/>
      </div>
    </div>
  )

  // key: a fresh call room per patient when "Call Next" switches appointments.
  return <CallRoom key={appointment.id} appointment={appointment} user={user} isDoctor={true}
    onBack={() => setAppointment(null)} onOpenAppointment={setAppointment}/>
}
