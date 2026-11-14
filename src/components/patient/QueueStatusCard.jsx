import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ticket, Video, Clock, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { manilaToday, formatRange, relativeDay, estimateWindow, statusMeta, formatClock } from '../../lib/queue'

const SELECT = `
  id, status, queue_number, estimated_time, appointment_date, chief_complaint, block_id,
  block:availability_blocks(id, date, start_time, end_time, avg_minutes_per_patient, now_serving),
  doctor:profiles!appointments_doctor_id_fkey(first_name, last_name, doctor_profiles(specialization))
`

/**
 * Live queue position(s) for the signed-in patient: their queue number,
 * the doctor's "Now Serving" number, and their estimated arrival window.
 * Updates in real time as the doctor calls / completes patients.
 * Renders nothing when the patient has no active queue spot.
 */
export default function QueueStatusCard({ userId }) {
  const navigate = useNavigate()
  const [spots, setSpots]       = useState([])
  const [cancelling, setCancelling] = useState(null)
  const [error, setError]       = useState('')

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('appointments')
      .select(SELECT)
      .eq('patient_id', userId)
      .not('block_id', 'is', null)
      .in('status', ['waiting', 'in_progress'])
      .gte('appointment_date', manilaToday())
      .order('appointment_date')
      .order('estimated_time')
    if (err) { setError(`Could not load your queue status: ${err.message}`); return }
    setSpots(data || [])
  }, [userId])

  useEffect(() => { if (userId) load() }, [userId, load])

  // Realtime: my own appointment rows (estimate / status changes) and the
  // blocks I'm queued in ("Now Serving" changes). Plus a slow poll as a
  // fallback in case the realtime connection drops.
  const blockIds = spots.map(s => s.block_id).sort().join(',')
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel(`patient-queue-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `patient_id=eq.${userId}` }, load)
    blockIds.split(',').filter(Boolean).forEach(id => {
      channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'availability_blocks', filter: `id=eq.${id}` }, load)
    })
    channel.subscribe()
    const poll = setInterval(load, 60_000)
    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [userId, blockIds, load])

  async function cancel(spot) {
    if (!confirm(`Cancel your queue spot #${spot.queue_number}? Your place will be given up.`)) return
    setCancelling(spot.id); setError('')
    const { error: err } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', spot.id)
    setCancelling(null)
    if (err) { setError(`Could not cancel: ${err.message}`); return }
    load()
  }

  if (spots.length === 0 && !error) return null

  return (
    <div className="space-y-3">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {spots.map(s => {
        const b = s.block
        const doctor = s.doctor ? `Dr. ${s.doctor.first_name || ''} ${s.doctor.last_name || ''}`.trim() : 'Your doctor'
        const spec = s.doctor?.doctor_profiles?.[0]?.specialization ?? s.doctor?.doctor_profiles?.specialization
        const myTurn = s.status === 'in_progress'
        const isToday = b?.date === manilaToday()
        return (
          <div key={s.id} className={`card border-2 ${myTurn ? 'border-emerald-300 bg-emerald-50/40' : 'border-patient-100'}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="text-xs font-bold text-patient-600 uppercase tracking-wide flex items-center gap-1">
                  <Ticket className="w-3.5 h-3.5"/> Your Queue · {relativeDay(s.appointment_date)}
                </p>
                <p className="font-bold text-gray-900 mt-0.5">{doctor}</p>
                <p className="text-xs text-gray-500">{spec ? `${spec} · ` : ''}{b ? formatRange(b.start_time, b.end_time) : ''}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${statusMeta(s.status).cls}`}>
                {statusMeta(s.status).label}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white rounded-xl border border-gray-100 py-3">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Your number</p>
                <p className="text-3xl font-bold text-patient-600">#{s.queue_number}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 py-3">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Now serving</p>
                <p className="text-3xl font-bold text-gray-800">{b?.now_serving ? `#${b.now_serving}` : '—'}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 py-3 px-1">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Estimated</p>
                <p className="text-sm font-bold text-gray-800 mt-1.5 leading-tight">
                  {myTurn ? 'Now' : estimateWindow(s.estimated_time, b?.avg_minutes_per_patient)}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0"/>
              {myTurn
                ? 'The doctor is ready for you — join the video call now.'
                : !isToday
                  ? `Queue opens ${relativeDay(s.appointment_date)} at ${formatClock(b?.start_time)}. Your estimate updates live on the day.`
                  : b?.now_serving
                    ? 'Estimates update live as the doctor finishes each consultation.'
                    : 'The doctor hasn\'t started this queue yet. Estimates update live once they do.'}
            </p>

            <div className="flex gap-2 mt-4">
              {myTurn ? (
                <button onClick={() => navigate('/teleconsultation', { state: { appointment: s } })}
                  className="btn-primary-patient flex-1 py-2.5 text-sm">
                  <Video className="w-4 h-4"/> Join Video Call
                </button>
              ) : (
                <button onClick={() => cancel(s)} disabled={cancelling === s.id}
                  className="btn-outline text-sm py-2 text-red-600 disabled:opacity-50">
                  <XCircle className="w-4 h-4"/> {cancelling === s.id ? 'Cancelling...' : 'Cancel spot'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
