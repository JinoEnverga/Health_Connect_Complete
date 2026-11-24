import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayCircle, CheckCircle2, UserX, FileText, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { statusMeta } from '../../lib/queue'

const APPT_SELECT = '*, patient:profiles!appointments_patient_id_fkey(first_name, last_name)'

const minutesSince = ts => ts ? Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60_000)) : 0
const nameOf = a => a?.patient ? `${a.patient.first_name || ''} ${a.patient.last_name || ''}`.trim() || 'Patient' : 'Patient'

/**
 * The doctor's consultation controls inside the video call, so they don't
 * have to go back to the dashboard: Start / No-show / Complete, then Call Next
 * (opens the next patient's call) and Issue Prescription.
 *
 * Queue appointments (block_id set) follow the queue rules enforced by the
 * database (010_availability_queue.sql): waiting -> in_progress ->
 * completed | no_show. Older slot appointments can be marked completed or
 * no-show directly.
 *
 * Props:
 *   appointment   the appointment in this call room
 *   onEndCall     hang up the video call (null when no call is running)
 *   onOpenNext    (appointment) => void — switch the call room to that patient
 */
export default function CallQueueControls({ appointment, onEndCall, onOpenNext }) {
  const navigate = useNavigate()
  const [appt, setAppt]     = useState(appointment)
  const [next, setNext]     = useState(null)   // next waiting patient in the same block
  const [busyQueue, setBusyQueue] = useState(false) // someone else is in consultation in this block
  const [acting, setActing] = useState(false)
  const [error, setError]   = useState('')
  const [, setTick]         = useState(0)

  const isQueue = !!appointment.block_id

  const load = useCallback(async () => {
    const { data } = await supabase.from('appointments').select(APPT_SELECT).eq('id', appointment.id).maybeSingle()
    if (data) setAppt(data)
    if (!appointment.block_id) return
    const { data: rows } = await supabase.from('appointments').select(APPT_SELECT)
      .eq('block_id', appointment.block_id).in('status', ['waiting', 'in_progress']).order('queue_number')
    setBusyQueue((rows || []).some(r => r.status === 'in_progress' && r.id !== appointment.id))
    setNext((rows || []).find(r => r.status === 'waiting' && r.id !== appointment.id) || null)
  }, [appointment.id, appointment.block_id])

  useEffect(() => { load() }, [load])

  // Live: patient cancels, another tab changes the status, the queue moves.
  useEffect(() => {
    const filter = appointment.block_id ? `block_id=eq.${appointment.block_id}` : `id=eq.${appointment.id}`
    const channel = supabase.channel(`call-queue-${appointment.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [appointment.id, appointment.block_id, load])

  // Re-render each minute for "In consultation N min".
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  async function setStatus(status, fromStatus) {
    setActing(true); setError('')
    let q = supabase.from('appointments').update({ status }).eq('id', appt.id)
    if (fromStatus) q = q.eq('status', fromStatus) // don't act on a row that changed under us
    const { data, error: err } = await q.select(APPT_SELECT)
    setActing(false)
    if (err) { setError(err.message); return false }
    if (!data?.length) { setError("This appointment's status changed (the patient may have cancelled)."); load(); return false }
    setAppt(data[0])
    load()
    return true
  }

  async function finish(status, fromStatus) {
    const label = status === 'completed' ? 'Complete this consultation' : 'Mark this patient as a no-show'
    if (!window.confirm(`${label}${onEndCall ? ' and end the call' : ''}?`)) return
    if (await setStatus(status, fromStatus)) onEndCall?.()
  }

  async function callNext() {
    if (!next) return
    setActing(true); setError('')
    const { data, error: err } = await supabase.from('appointments')
      .update({ status: 'in_progress' }).eq('id', next.id).eq('status', 'waiting').select(APPT_SELECT)
    setActing(false)
    if (err) { setError(err.message); return }
    if (!data?.length) { setError('That patient is no longer waiting. The queue has been refreshed.'); load(); return }
    onOpenNext?.(data[0])
  }

  const meta = statusMeta(appt.status)
  const done = ['completed', 'no_show', 'cancelled'].includes(appt.status)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {isQueue && appt.queue_number != null && (
          <div className="w-11 h-11 bg-doctor-600 text-white rounded-xl flex items-center justify-center font-bold shrink-0">
            #{appt.queue_number}
          </div>
        )}
        <div className="flex-1 min-w-[10rem]">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            {nameOf(appt)}
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
          </p>
          <p className="text-xs text-gray-500">
            {appt.status === 'in_progress' ? `In consultation ${minutesSince(appt.started_at)} min`
              : done ? 'Consultation closed'
              : isQueue ? 'Not started yet' : appt.chief_complaint || 'Scheduled appointment'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Queue: start */}
          {isQueue && appt.status === 'waiting' && (
            <button onClick={() => setStatus('in_progress', 'waiting')} disabled={acting || busyQueue}
              title={busyQueue ? 'Complete the current consultation first' : undefined}
              className="btn-primary-doctor text-sm px-4 py-2 disabled:opacity-50">
              <PlayCircle className="w-4 h-4"/> Start Consultation
            </button>
          )}

          {/* In consultation (queue) or open slot appointment: finish */}
          {((isQueue && appt.status === 'in_progress') || (!isQueue && !done)) && (
            <>
              <button onClick={() => finish('no_show', isQueue ? 'in_progress' : null)} disabled={acting}
                className="btn-outline text-sm px-3 py-2 disabled:opacity-50">
                <UserX className="w-4 h-4"/> No-show
              </button>
              <button onClick={() => finish('completed', isQueue ? 'in_progress' : null)} disabled={acting}
                className="btn-primary-doctor text-sm px-4 py-2 disabled:opacity-50">
                <CheckCircle2 className="w-4 h-4"/> Complete Consultation
              </button>
            </>
          )}

          {/* After the consultation */}
          {appt.status === 'completed' && (
            <button onClick={() => navigate('/doctor/prescribe', { state: { patientId: appt.patient_id, appointmentId: appt.id } })}
              className="btn-outline text-sm px-3 py-2">
              <FileText className="w-4 h-4"/> Issue Prescription
            </button>
          )}
          {done && isQueue && next && !busyQueue && (
            <button onClick={callNext} disabled={acting}
              className="btn-primary-doctor text-sm px-4 py-2 disabled:opacity-50">
              Call Next · #{next.queue_number} {nameOf(next)} <ChevronRight className="w-4 h-4"/>
            </button>
          )}
        </div>
      </div>

      {done && isQueue && !next && (
        <p className="text-xs text-gray-500">No more patients waiting in this block.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
