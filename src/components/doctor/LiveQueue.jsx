import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListOrdered, PlayCircle, CheckCircle2, UserX, Video, Clock, CalendarPlus, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { manilaToday, formatRange, formatTimestamp, blockPhase, statusMeta } from '../../lib/queue'

// Pick which of today's blocks to show by default: the one happening now,
// else the next one today, else the latest one that still has people
// waiting, else the first.
function defaultBlock(blocks) {
  return blocks.find(b => blockPhase(b) === 'live')
      || blocks.find(b => blockPhase(b) === 'upcoming')
      || [...blocks].reverse().find(b => b.booked_count > 0)
      || blocks[0]
}

function minutesSince(ts) {
  return ts ? Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60_000)) : 0
}

export default function LiveQueue({ doctorId }) {
  const navigate = useNavigate()
  const [blocks, setBlocks]     = useState([])
  const [blockId, setBlockId]   = useState(null)
  const [queue, setQueue]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [acting, setActing]     = useState(null)
  const [error, setError]       = useState('')
  const [, setTick]             = useState(0) // re-render every minute for elapsed time
  const refreshing = useRef(false)

  const block = blocks.find(b => b.id === blockId) || null

  const loadBlocks = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('availability_blocks')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('date', manilaToday())
      .order('start_time')
    if (err) { setError(`Could not load today's blocks: ${err.message}`); return }
    setBlocks(data || [])
    setBlockId(prev => (prev && data?.some(b => b.id === prev)) ? prev : (defaultBlock(data || [])?.id ?? null))
  }, [doctorId])

  const loadQueue = useCallback(async (id) => {
    if (!id) { setQueue([]); return }
    const { data, error: err } = await supabase
      .from('appointments')
      .select('id, queue_number, status, estimated_time, started_at, completed_at, chief_complaint, patient_id, appointment_date, time_slot, patient:profiles!appointments_patient_id_fkey(first_name, last_name)')
      .eq('block_id', id)
      .order('queue_number')
    if (err) { setError(`Could not load the queue: ${err.message}`); return }
    setQueue(data || [])
  }, [])

  useEffect(() => {
    if (!doctorId) return
    setLoading(true)
    loadBlocks().finally(() => setLoading(false))
  }, [doctorId, loadBlocks])

  useEffect(() => { loadQueue(blockId) }, [blockId, loadQueue])

  // Live updates: any change to this block's appointments (bookings,
  // cancellations, status changes) or to the block itself.
  useEffect(() => {
    if (!blockId) return
    const channel = supabase
      .channel(`doctor-queue-${blockId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `block_id=eq.${blockId}` },
        () => loadQueue(blockId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'availability_blocks', filter: `id=eq.${blockId}` },
        () => loadBlocks())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [blockId, loadQueue, loadBlocks])

  const current = queue.find(a => a.status === 'in_progress') || null
  const waiting = queue.filter(a => a.status === 'waiting')
  const done    = queue.filter(a => ['completed', 'no_show', 'cancelled'].includes(a.status))
  const next    = waiting[0] || null

  // While a consultation runs past its expected length, nothing changes
  // status, so ask the server to push everyone's estimate back once a
  // minute. (The server does the math; patients get it via realtime.)
  useEffect(() => {
    const timer = setInterval(async () => {
      setTick(t => t + 1)
      if (!block || !current || refreshing.current) return
      if (minutesSince(current.started_at) < block.avg_minutes_per_patient) return
      refreshing.current = true
      await supabase.rpc('refresh_block_queue', { p_block_id: block.id })
      refreshing.current = false
      loadQueue(block.id)
    }, 60_000)
    return () => clearInterval(timer)
  }, [block, current, loadQueue])

  async function setStatus(appt, status, expectedStatus) {
    setActing(appt.id); setError('')
    const { data, error: err } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', appt.id)
      .eq('status', expectedStatus) // don't act on a row that changed under us
      .select('id')
    setActing(null)
    if (err) { setError(err.message); return }
    if (!data?.length) setError('That patient\'s status changed (they may have cancelled). The queue has been refreshed.')
    loadQueue(blockId)
  }

  const patientName = a => a.patient ? `${a.patient.first_name || ''} ${a.patient.last_name || ''}`.trim() || 'Patient' : 'Patient'

  if (loading) {
    return <div className="card animate-pulse h-40 bg-gray-50"/>
  }

  if (blocks.length === 0) {
    return (
      <div className="card flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
        <div className="w-12 h-12 bg-doctor-50 rounded-xl flex items-center justify-center shrink-0">
          <ListOrdered className="w-6 h-6 text-doctor-600"/>
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-900">No availability blocks today</p>
          <p className="text-sm text-gray-500">Open a time block so patients can join your queue.</p>
        </div>
        <button onClick={() => navigate('/doctor/availability')} className="btn-primary-doctor px-4 py-2 text-sm">
          <CalendarPlus className="w-4 h-4"/> Set Availability
        </button>
      </div>
    )
  }

  const overrunBy = current && block ? minutesSince(current.started_at) - block.avg_minutes_per_patient : 0

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-doctor-600"/> Today's Queue
        </h2>
        <div className="flex items-center gap-2">
          {blocks.length > 1 && (
            <select value={blockId || ''} onChange={e => setBlockId(e.target.value)} className="input-doctor text-sm py-1.5 w-auto">
              {blocks.map(b => (
                <option key={b.id} value={b.id}>
                  {formatRange(b.start_time, b.end_time)}{blockPhase(b) === 'live' ? ' (live)' : ''}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => { loadBlocks(); loadQueue(blockId) }} className="p-2 rounded-xl hover:bg-gray-100" title="Refresh">
            <RefreshCw className="w-4 h-4 text-gray-500"/>
          </button>
        </div>
      </div>

      {block && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> {formatRange(block.start_time, block.end_time)}</span>
          <span>{block.booked_count} of {block.max_patients} booked{block.is_full ? ' · Full' : ''}</span>
          <span>~{block.avg_minutes_per_patient} min / patient</span>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {/* Now serving */}
      <div className={`rounded-2xl p-4 border ${current ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100'}`}>
        {current ? (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-14 h-14 bg-doctor-600 text-white rounded-2xl flex flex-col items-center justify-center shrink-0">
              <span className="text-[10px] uppercase tracking-wide opacity-80">Now</span>
              <span className="text-xl font-bold leading-none">#{current.queue_number}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900">{patientName(current)}</p>
              <p className="text-xs text-gray-500 truncate">{current.chief_complaint || 'No concern noted'}</p>
              <p className={`text-xs mt-0.5 ${overrunBy > 0 ? 'text-orange-600 font-semibold' : 'text-gray-500'}`}>
                In consultation {minutesSince(current.started_at)} min
                {overrunBy > 0 ? ` · ${overrunBy} min over — later estimates are being pushed back` : ''}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => navigate('/doctor/teleconsultation', { state: { appointment: current } })}
                className="btn-outline text-sm px-3 py-2"><Video className="w-4 h-4"/> Video</button>
              <button onClick={() => setStatus(current, 'no_show', 'in_progress')} disabled={acting === current.id}
                className="btn-outline text-sm px-3 py-2 disabled:opacity-50"><UserX className="w-4 h-4"/> No-show</button>
              <button onClick={() => setStatus(current, 'completed', 'in_progress')} disabled={acting === current.id}
                className="btn-primary-doctor text-sm px-4 py-2 disabled:opacity-50">
                <CheckCircle2 className="w-4 h-4"/> Complete Consultation
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1">
              <p className="font-semibold text-gray-800">No one in consultation</p>
              <p className="text-sm text-gray-500">
                {next ? `Next up: #${next.queue_number} ${patientName(next)}` : 'No patients waiting in this block.'}
              </p>
            </div>
            {next && (
              <button onClick={() => setStatus(next, 'in_progress', 'waiting')} disabled={acting === next.id}
                className="btn-primary-doctor text-sm px-4 py-2 disabled:opacity-50">
                <PlayCircle className="w-4 h-4"/> Call Next · Start #{next.queue_number}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Waiting list */}
      {waiting.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Waiting ({waiting.length})</p>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {waiting.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 font-bold text-sm flex items-center justify-center shrink-0">
                  #{a.queue_number}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{patientName(a)}</p>
                  <p className="text-xs text-gray-400 truncate">{a.chief_complaint || 'No concern noted'}</p>
                </div>
                <span className="text-xs text-gray-500 shrink-0">est. {formatTimestamp(a.estimated_time)}</span>
                <button onClick={() => setStatus(a, 'no_show', 'waiting')} disabled={acting === a.id}
                  title="Mark as no-show"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <UserX className="w-4 h-4"/>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500 font-medium">Finished ({done.length})</summary>
          <div className="mt-2 space-y-1">
            {done.map(a => (
              <div key={a.id} className="flex items-center gap-3 text-gray-500">
                <span className="w-8 text-right font-semibold">#{a.queue_number}</span>
                <span className="flex-1">{patientName(a)}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusMeta(a.status).cls}`}>{statusMeta(a.status).label}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
