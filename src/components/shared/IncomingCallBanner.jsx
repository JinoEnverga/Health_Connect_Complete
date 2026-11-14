import React, { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PhoneIncoming, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Matches the server's "missed" cutoff in log_call_event.
const RING_WINDOW_MS = 5 * 60_000

/**
 * "Dr. X is calling you — Join" bar, shown anywhere in the portal while the
 * other participant has a call ringing for one of your appointments.
 * Driven by call_logs over Realtime (see 012_call_history_and_chat.sql).
 *
 * role: 'doctor' | 'patient'
 */
export default function IncomingCallBanner({ role, userId }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [calls, setCalls]         = useState([])
  const [dismissed, setDismissed] = useState(() => new Set())

  const column  = role === 'doctor' ? 'doctor_id' : 'patient_id'
  const callUrl = role === 'doctor' ? '/doctor/teleconsultation' : '/teleconsultation'

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('call_logs')
      .select(`id, appointment_id, initiated_by, initiated_at, status,
        doctor:profiles!call_logs_doctor_id_fkey(first_name, last_name),
        patient:profiles!call_logs_patient_id_fkey(first_name, last_name)`)
      .eq(column, userId)
      .eq('status', 'ringing')
      .neq('initiated_by', userId)
      .gte('initiated_at', new Date(Date.now() - RING_WINDOW_MS).toISOString())
      .order('initiated_at', { ascending: false })
    setCalls(data || [])
  }, [column, userId])

  useEffect(() => {
    if (!userId) return
    load()
    const channel = supabase.channel(`incoming-calls-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs', filter: `${column}=eq.${userId}` }, load)
      .subscribe()
    // Drop calls that have rung past the window even if no event arrives.
    const tick = setInterval(load, 30_000)
    return () => { supabase.removeChannel(channel); clearInterval(tick) }
  }, [userId, column, load])

  const call = calls.find(c => !dismissed.has(c.id))
  if (!call) return null

  const caller = role === 'doctor'
    ? [call.patient?.first_name, call.patient?.last_name].filter(Boolean).join(' ') || 'Your patient'
    : `Dr. ${[call.doctor?.first_name, call.doctor?.last_name].filter(Boolean).join(' ')}`.trim()

  function join() {
    setDismissed(d => new Set(d).add(call.id))
    navigate(callUrl, { state: { appointment: { id: call.appointment_id } } })
  }

  return (
    <div role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shrink-0 animate-pulse">
          <PhoneIncoming className="w-5 h-5"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{caller} is calling you</p>
          <p className="text-xs text-gray-400">{pathname.startsWith(callUrl) ? 'Open the appointment to join' : 'Video consultation'}</p>
        </div>
        <button onClick={join} className="bg-green-500 hover:bg-green-400 text-white text-sm font-semibold px-4 py-2 rounded-xl shrink-0">
          Join
        </button>
        <button onClick={() => setDismissed(d => new Set(d).add(call.id))} aria-label="Dismiss"
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 shrink-0">
          <X className="w-4 h-4"/>
        </button>
      </div>
    </div>
  )
}
