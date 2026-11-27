import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// A doorbell not heard for this long means the patient has gone (they ring
// every ~8 s while waiting). Shared rule with the mobile app.
const STALE_MS = 40_000

/**
 * "<patient> is waiting · Join" for the doctor, anywhere in the portal.
 * Listens on the Realtime broadcast topic 'doorbell-<doctor id>' that the
 * mobile app (and the web patient waiting room) ring:
 *   'patient_waiting' { appointment_id, doctor_id, patient_id, patient_name? }
 *   'patient_left'    { appointment_id, ... }
 */
export default function DoorbellBanner({ doctorId }) {
  const navigate = useNavigate()
  const [waiting, setWaiting]     = useState({}) // appointment_id -> { name, at }
  const [dismissed, setDismissed] = useState(() => new Set())
  const [, setTick]               = useState(0)

  useEffect(() => {
    if (!doctorId) return
    const ch = supabase.channel(`doorbell-${doctorId}`)
      .on('broadcast', { event: 'patient_waiting' }, ({ payload }) => {
        if (!payload?.appointment_id) return
        setWaiting(w => ({ ...w, [payload.appointment_id]: { name: payload.patient_name || 'A patient', at: Date.now() } }))
      })
      .on('broadcast', { event: 'patient_left' }, ({ payload }) => {
        if (!payload?.appointment_id) return
        setWaiting(w => { const n = { ...w }; delete n[payload.appointment_id]; return n })
        setDismissed(d => { const n = new Set(d); n.delete(payload.appointment_id); return n })
      })
      .subscribe()
    // Re-check staleness every few seconds.
    const t = setInterval(() => setTick(x => x + 1), 5000)
    return () => { clearInterval(t); supabase.removeChannel(ch) }
  }, [doctorId])

  const now = Date.now()
  const entry = Object.entries(waiting)
    .filter(([id, w]) => now - w.at < STALE_MS && !dismissed.has(id))
    .sort((a, b) => a[1].at - b[1].at)[0]
  if (!entry) return null
  const [appointmentId, w] = entry

  function join() {
    setDismissed(d => new Set(d).add(appointmentId))
    navigate('/doctor/teleconsultation', { state: { appointment: { id: appointmentId } } })
  }

  return (
    <div role="alert" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center shrink-0 animate-pulse">
          <BellRing className="w-5 h-5"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{w.name} is waiting</p>
          <p className="text-xs text-gray-400">In the consultation room</p>
        </div>
        <button onClick={join} className="bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold px-4 py-2 rounded-xl shrink-0">
          Join
        </button>
        <button onClick={() => setDismissed(d => new Set(d).add(appointmentId))} aria-label="Dismiss"
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 shrink-0">
          <X className="w-4 h-4"/>
        </button>
      </div>
    </div>
  )
}
