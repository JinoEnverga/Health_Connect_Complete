import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Calendar, Clock, User, CheckCircle, Star, Ticket, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { manilaToday, formatRange, formatDay, relativeDay, blockPhase, estimateWindow } from '../../lib/queue'

const DAYS_AHEAD = 30

export default function BookAppointment() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user }  = useAuth()
  const preDoc    = location.state?.doctor
  // From My Appointments: "Book Again" / "Reschedule" pass the doctor's id;
  // "Reschedule" also passes the appointment to cancel once the new one is booked.
  const preDocId     = location.state?.doctorId || null
  const rescheduleId = location.state?.rescheduleId || null
  const [rescheduled, setRescheduled] = useState(null) // null | 'done' | error message

  const [doctors, setDoctors]     = useState([])
  const [selected, setSelected]   = useState(preDoc || null)
  const [blocks, setBlocks]       = useState([])
  const [myBlockSpots, setMyBlockSpots] = useState({}) // block_id -> my queue_number
  const [blocksLoading, setBlocksLoading] = useState(false)
  const [blockId, setBlockId]     = useState(null)
  const [complaint, setComplaint] = useState('')
  const [loading, setLoading]     = useState(false)
  const [booked, setBooked]       = useState(null)
  const [error, setError]         = useState('')

  useEffect(() => {
    supabase.from('doctor_directory').select('*').eq('is_accepting_patients', true)
      .then(({ data }) => {
        setDoctors(data || [])
        if (preDocId) setSelected(prev => prev || (data || []).find(d => d.user_id === preDocId) || null)
      })
  }, [])

  const loadBlocks = useCallback(async () => {
    if (!selected?.user_id) { setBlocks([]); return }
    setBlocksLoading(true)
    const [blocksRes, mineRes] = await Promise.all([
      supabase.from('availability_blocks')
        .select('*')
        .eq('doctor_id', selected.user_id)
        .gte('date', manilaToday())
        .lte('date', manilaToday(DAYS_AHEAD))
        .order('date').order('start_time'),
      supabase.from('appointments')
        .select('block_id, queue_number')
        .eq('patient_id', user.id)
        .not('block_id', 'is', null)
        .in('status', ['waiting', 'in_progress']),
    ])
    if (blocksRes.error) setError(`Could not load availability: ${blocksRes.error.message}`)
    setBlocks((blocksRes.data || []).filter(b => blockPhase(b) !== 'past'))
    setMyBlockSpots(Object.fromEntries((mineRes.data || []).map(a => [a.block_id, a.queue_number])))
    setBlocksLoading(false)
  }, [selected?.user_id, user.id])

  useEffect(() => { loadBlocks() }, [loadBlocks])

  // Spots left update live while the patient is choosing.
  useEffect(() => {
    if (!selected?.user_id) return
    const channel = supabase.channel(`book-blocks-${selected.user_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'availability_blocks', filter: `doctor_id=eq.${selected.user_id}` }, loadBlocks)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selected?.user_id, loadBlocks])

  function selectDoctor(doc) {
    setSelected(doc)
    setBlockId(null)
    setError('')
  }

  const chosen = blocks.find(b => b.id === blockId) || null

  const grouped = useMemo(() => {
    const map = new Map()
    blocks.forEach(b => { if (!map.has(b.date)) map.set(b.date, []); map.get(b.date).push(b) })
    return [...map.entries()]
  }, [blocks])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!chosen) { setError('Please choose an availability block.'); return }
    setLoading(true); setError('')

    // The database assigns the queue number, estimated time, doctor and
    // date, and enforces capacity atomically — we only say which block.
    const { data: inserted, error: err } = await supabase
      .from('appointments')
      .insert({ patient_id: user.id, block_id: chosen.id, chief_complaint: complaint || null })
      .select('id')
      .single()

    if (err) {
      setError(err.message)
      setLoading(false)
      loadBlocks() // e.g. it just filled up — show the real counts
      return
    }

    const { data: appt } = await supabase
      .from('appointments')
      .select('id, queue_number, estimated_time, appointment_date')
      .eq('id', inserted.id)
      .single()
    // Rescheduling: the new spot is secured, now give up the old one.
    if (rescheduleId) {
      const { data: gone, error: cancelErr } = await supabase.from('appointments')
        .update({ status: 'cancelled' }).eq('id', rescheduleId).in('status', ['upcoming', 'waiting']).select('id')
      setRescheduled(cancelErr || !gone?.length
        ? 'Your new spot is booked, but the old appointment could not be cancelled automatically — please cancel it in My Appointments.'
        : 'done')
    }

    setBooked({ ...appt, block: chosen })
    setLoading(false)
  }

  if (booked) return (
    <div className="max-w-lg mx-auto">
      <div className="card flex flex-col items-center text-center py-10">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600"/>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">You're in the queue!</h2>
        <p className="text-gray-500 text-sm mb-6">Your estimated time updates live as the doctor sees each patient.</p>
        {rescheduled === 'done' && (
          <p className="text-sm text-patient-700 bg-patient-50 rounded-xl px-4 py-2 mb-4 w-full">Rescheduled — your previous appointment was cancelled.</p>
        )}
        {rescheduled && rescheduled !== 'done' && (
          <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-4 py-2 mb-4 w-full">{rescheduled}</p>
        )}
        <div className="grid grid-cols-2 gap-3 w-full mb-4">
          <div className="bg-patient-50 rounded-xl py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Queue number</p>
            <p className="text-4xl font-bold text-patient-600">#{booked.queue_number}</p>
          </div>
          <div className="bg-gray-50 rounded-xl py-4 px-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Estimated</p>
            <p className="text-base font-bold text-gray-800 mt-2">
              {estimateWindow(booked.estimated_time, booked.block.avg_minutes_per_patient)}
            </p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 w-full text-left mb-6 text-sm text-gray-600 space-y-1">
          <p><span className="font-semibold">Doctor:</span> Dr. {selected?.full_name}</p>
          <p><span className="font-semibold">Date:</span> {formatDay(booked.appointment_date, { year: 'numeric' })}</p>
          <p><span className="font-semibold">Clinic hours:</span> {formatRange(booked.block.start_time, booked.block.end_time)}</p>
        </div>
        <div className="flex gap-3 w-full">
          <button onClick={() => navigate('/dashboard')} className="btn-primary-patient flex-1">Track My Queue</button>
          <button onClick={() => navigate('/appointments')} className="btn-outline flex-1">My Appointments</button>
        </div>
      </div>
    </div>
  )

  const initials = selected?.full_name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{rescheduleId ? 'Reschedule Appointment' : 'Book Appointment'}</h1>
          <p className="text-gray-500 text-sm">Join a doctor's queue for an available time block</p>
        </div>
      </div>

      {rescheduleId && (
        <div className="bg-patient-50 border border-patient-100 text-patient-800 rounded-xl px-4 py-3 text-sm">
          Pick a new time block. Your current appointment stays booked until the new one is confirmed, then it&apos;s cancelled automatically.
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Select Doctor */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-patient-600"/> Select Doctor
          </h2>
          <select value={selected?.user_id || ''}
            onChange={e => {
              const doc = doctors.find(d => d.user_id === e.target.value)
              if (doc) selectDoctor(doc)
            }}
            className="input">
            <option value="">— Select a doctor —</option>
            {doctors.map(d => (
              <option key={d.user_id} value={d.user_id}>
                Dr. {d.full_name} — {d.specialization}
              </option>
            ))}
          </select>

          {selected && (
            <div className="mt-3 bg-patient-50 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-patient-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">
                {initials}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Dr. {selected.full_name}</p>
                <p className="text-patient-600 text-xs font-medium">{selected.specialization}</p>
                <p className="text-gray-500 text-xs flex items-center gap-2 mt-0.5">
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400"/>
                  {selected.average_rating != null ? Number(selected.average_rating).toFixed(1) : 'N/A'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Availability blocks */}
        {selected && (
          <div className="card">
            <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-patient-600"/> Choose a Time Block
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              You'll get a queue number and an estimated time within the block — no fixed slot to hit.
            </p>

            {blocksLoading && blocks.length === 0 ? (
              <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse"/>)}</div>
            ) : grouped.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-10 h-10 text-gray-300 mx-auto mb-2"/>
                <p className="font-semibold text-gray-500">No open availability in the next {DAYS_AHEAD} days</p>
                <p className="text-sm text-gray-400">Try another doctor or check back later.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {grouped.map(([date, dayBlocks]) => (
                  <div key={date}>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                      {relativeDay(date)}{relativeDay(date) !== formatDay(date) ? ` · ${formatDay(date)}` : ''}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {dayBlocks.map(b => {
                        const left = b.max_patients - b.booked_count
                        const mine = myBlockSpots[b.id]
                        const disabled = b.is_full || !!mine
                        const active = blockId === b.id
                        return (
                          <button key={b.id} type="button" disabled={disabled}
                            onClick={() => setBlockId(b.id)}
                            className={`text-left rounded-xl border-2 p-3 transition-all ${
                              active ? 'border-patient-500 bg-patient-50'
                              : disabled ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                              : 'border-gray-100 hover:border-patient-300 bg-white'
                            }`}>
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-gray-900 text-sm">{formatRange(b.start_time, b.end_time)}</p>
                              {blockPhase(b) === 'live' && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">LIVE</span>}
                            </div>
                            <p className={`text-xs mt-1 flex items-center gap-1 font-medium ${
                              mine ? 'text-patient-600' : b.is_full ? 'text-red-600' : left <= 2 ? 'text-orange-600' : 'text-green-700'
                            }`}>
                              <Users className="w-3 h-3"/>
                              {mine ? `You're #${mine} in this queue`
                                : b.is_full ? 'Full'
                                : `${left} of ${b.max_patients} spots left`}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-0.5">~{b.avg_minutes_per_patient} min per patient</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-4">Appointment Notes</h2>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Describe your concern <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea rows={3} maxLength={500}
            placeholder="e.g., Persistent headache for the past 3 days, mild fever..."
            value={complaint} onChange={e => setComplaint(e.target.value)}
            className="input resize-none text-sm"/>
          <p className="text-xs text-gray-400 mt-1 text-right">{complaint.length}/500 characters</p>
        </div>

        <button type="submit" disabled={loading || !chosen} className="btn-primary-patient w-full py-4 text-base disabled:opacity-50">
          {loading
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
            : <><Ticket className="w-5 h-5"/> {chosen ? `Join Queue · ${relativeDay(chosen.date)} ${formatRange(chosen.start_time, chosen.end_time)}` : 'Choose a time block'}</>}
        </button>
      </form>
    </div>
  )
}
