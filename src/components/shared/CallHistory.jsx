import React, { useCallback, useEffect, useState } from 'react'
import { PhoneCall, PhoneMissed, PhoneOff, PhoneIncoming, ChevronDown, History } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const STATUS = {
  ringing:   { label: 'Ringing',     cls: 'bg-amber-100 text-amber-700',     icon: PhoneIncoming },
  active:    { label: 'In progress', cls: 'bg-emerald-100 text-emerald-700', icon: PhoneCall },
  ended:     { label: 'Completed',   cls: 'bg-blue-100 text-blue-700',       icon: PhoneCall },
  cancelled: { label: 'Cancelled',   cls: 'bg-gray-100 text-gray-600',       icon: PhoneOff },
  missed:    { label: 'Missed',      cls: 'bg-red-100 text-red-700',         icon: PhoneMissed },
}

const EVENT_LABEL = {
  initiated: 'started the call',
  joined:    'joined',
  rejoined:  'rejoined',
  cancelled: 'cancelled before it was answered',
  ended:     'ended the call',
  missed:    'Call missed — no one joined',
  failed:    'had a connection problem',
}

const fmtDateTime = ts => new Date(ts).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
const fmtTime     = ts => new Date(ts).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit' })

export function formatDuration(sec) {
  if (sec == null) return ''
  const m = Math.floor(sec / 60), s = sec % 60
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

const fullName = p => p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : ''

/**
 * Call history (panel item #2): every call attempt with who started it,
 * whether it was answered, how it ended and how long it lasted, plus an
 * expandable timeline of join / cancel / end events with timestamps.
 * Updates live as calls happen.
 *
 * role: 'doctor' | 'patient' — which participant column `userId` is.
 */
export default function CallHistory({ role, userId, limit = 25 }) {
  const [calls, setCalls]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [open, setOpen]       = useState(null)
  const [events, setEvents]   = useState({}) // call_id -> events

  const column = role === 'doctor' ? 'doctor_id' : 'patient_id'

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('call_logs')
      .select(`*,
        doctor:profiles!call_logs_doctor_id_fkey(first_name, last_name),
        patient:profiles!call_logs_patient_id_fkey(first_name, last_name)`)
      .eq(column, userId)
      .order('initiated_at', { ascending: false })
      .limit(limit)
    if (err) setError(`Could not load call history: ${err.message}`)
    setCalls(data || [])
    setLoading(false)
  }, [column, userId, limit])

  const loadEvents = useCallback(async (callId) => {
    const { data } = await supabase
      .from('call_events').select('id, user_id, event, detail, created_at')
      .eq('call_id', callId).order('created_at').order('id')
    setEvents(e => ({ ...e, [callId]: data || [] }))
  }, [])

  useEffect(() => { if (userId) load() }, [userId, load])

  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel(`call-history-${role}-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs', filter: `${column}=eq.${userId}` }, () => {
        load()
        if (open) loadEvents(open)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, role, column, load, loadEvents, open])

  function toggle(callId) {
    if (open === callId) { setOpen(null); return }
    setOpen(callId)
    loadEvents(callId)
  }

  return (
    <div className="card">
      <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-gray-500"/> Call History
      </h2>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse"/>)}</div>
      ) : calls.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No calls yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {calls.map(c => {
            const st = STATUS[c.status] || STATUS.ended
            const Icon = st.icon
            const other = role === 'doctor' ? fullName(c.patient) || 'Patient' : `Dr. ${fullName(c.doctor)}`.trim()
            const nameOf = uid => uid === userId ? 'You'
              : uid === c.doctor_id ? `Dr. ${fullName(c.doctor)}`.trim()
              : uid === c.patient_id ? (fullName(c.patient) || 'Patient')
              : 'System'
            return (
              <div key={c.id} className="py-3">
                <button onClick={() => toggle(c.id)} className="w-full flex items-center gap-3 text-left">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${st.cls}`}>
                    <Icon className="w-4 h-4"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{other}</p>
                    <p className="text-xs text-gray-500">
                      {fmtDateTime(c.initiated_at)} · {c.initiated_by === userId ? 'You called' : 'Incoming'}
                      {c.status === 'ended' && c.duration_seconds != null ? ` · ${formatDuration(c.duration_seconds)}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open === c.id ? 'rotate-180' : ''}`}/>
                </button>

                {open === c.id && (
                  <ol className="mt-3 ml-4 border-l-2 border-gray-100 pl-4 space-y-2">
                    {(events[c.id] || []).map(e => (
                      <li key={e.id} className="text-xs">
                        <span className="text-gray-400 tabular-nums">{fmtTime(e.created_at)}</span>{' '}
                        <span className="text-gray-700">
                          {e.event === 'missed' ? EVENT_LABEL.missed : <><span className="font-semibold">{nameOf(e.user_id)}</span> {EVENT_LABEL[e.event] || e.event}</>}
                        </span>
                        {e.detail && e.event !== 'missed' && <span className="text-gray-400"> — {e.detail}</span>}
                      </li>
                    ))}
                    {!events[c.id] && <li className="text-xs text-gray-400">Loading timeline...</li>}
                  </ol>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
