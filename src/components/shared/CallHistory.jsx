import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneCall, PhoneMissed, PhoneOff, PhoneIncoming, ChevronDown, ChevronLeft, ChevronRight, History, Search, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDateTime, formatTimeOnly } from '../../lib/queue'

const STATUS = {
  ringing:   { label: 'Ringing',     cls: 'bg-amber-100 text-amber-700',     icon: PhoneIncoming },
  active:    { label: 'In progress', cls: 'bg-emerald-100 text-emerald-700', icon: PhoneCall },
  ended:     { label: 'Completed',   cls: 'bg-blue-100 text-blue-700',       icon: PhoneCall },
  cancelled: { label: 'Cancelled',   cls: 'bg-gray-100 text-gray-600',       icon: PhoneOff },
  missed:    { label: 'Missed',      cls: 'bg-red-100 text-red-700',         icon: PhoneMissed },
}

// Filter tabs. "Cancelled" also covers missed calls (nobody answered).
const TABS = [
  { key: 'all',       label: 'All',       match: () => true },
  { key: 'completed', label: 'Completed', match: s => s === 'ended' },
  { key: 'cancelled', label: 'Cancelled', match: s => s === 'cancelled' || s === 'missed' },
]

const EVENT_LABEL = {
  initiated: 'started the call',
  joined:    'joined',
  rejoined:  'rejoined',
  cancelled: 'cancelled before it was answered',
  ended:     'ended the call',
  missed:    'Call missed — no one joined',
  failed:    'had a connection problem',
}

const PAGE_SIZE = 7

const fmtSeconds = ts => new Date(ts).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit' })

export function formatDuration(sec) {
  if (sec == null) return ''
  const m = Math.floor(sec / 60), s = sec % 60
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

const fullName = p => p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : ''

/**
 * Call history (panel item #2): every call attempt with who started it,
 * whether it was answered, how it ended and how long it lasted. Search by
 * name, filter by outcome, and expand a call for its exact times, timeline,
 * consultation notes (doctor) and an Issue Prescription shortcut (doctor).
 * Updates live as calls happen.
 *
 * role: 'doctor' | 'patient' — which participant column `userId` is.
 */
export default function CallHistory({ role, userId, limit = 50 }) {
  const navigate = useNavigate()
  const [calls, setCalls]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [open, setOpen]       = useState(null)
  const [events, setEvents]   = useState({}) // call_id -> events
  const [query, setQuery]     = useState('')
  const [tab, setTab]         = useState('all')
  const [page, setPage]       = useState(0)

  const isDoctor = role === 'doctor'
  const column = isDoctor ? 'doctor_id' : 'patient_id'

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('call_logs')
      .select(`*,
        doctor:profiles!call_logs_doctor_id_fkey(first_name, last_name),
        patient:profiles!call_logs_patient_id_fkey(first_name, last_name, email),
        appointment:appointments!call_logs_appointment_id_fkey(chief_complaint, doctor_notes, appointment_date, status)`)
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

  const otherName = c => isDoctor ? fullName(c.patient) || 'Patient' : `Dr. ${fullName(c.doctor)}`.trim()

  const shown = useMemo(() => {
    const t = TABS.find(x => x.key === tab) || TABS[0]
    const q = query.trim().toLowerCase()
    return calls.filter(c => t.match(c.status) && (!q || otherName(c).toLowerCase().includes(q)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, tab, query])

  // Paginate so a long history never stretches the page.
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const current   = Math.min(page, pageCount - 1)
  const pageItems = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  useEffect(() => { setPage(0) }, [tab, query])

  function issuePrescription(c) {
    const qs = new URLSearchParams({ patientId: c.patient_id, appointmentId: c.appointment_id })
    if (c.patient?.email) qs.set('patientEmail', c.patient.email)
    navigate(`/doctor/prescribe?${qs}`)
  }

  return (
    <div className="card">
      {/* Header: title, search, filter tabs */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="font-bold text-gray-900 flex items-center gap-2 mr-auto">
          <History className="w-4 h-4 text-gray-500"/> Call History
          {!loading && <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{calls.length}</span>}
        </h2>
        <div className="relative w-full sm:w-44">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400"/>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name..."
            className="w-full text-sm bg-gray-50 border border-gray-100 rounded-lg pl-8 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"/>
        </div>
      </div>
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-3">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {loading ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse"/>)}</div>
      ) : shown.length === 0 ? (
        <div className="py-8 text-center">
          <History className="w-8 h-8 text-gray-200 mx-auto mb-2"/>
          <p className="text-sm text-gray-500 font-medium">
            {calls.length === 0 ? 'No calls yet' : 'No calls match your search'}
          </p>
          {calls.length === 0 && <p className="text-xs text-gray-400 mt-0.5">Completed and missed calls will appear here.</p>}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {pageItems.map(c => {
            const st = STATUS[c.status] || STATUS.ended
            const Icon = st.icon
            const nameOf = uid => uid === userId ? 'You'
              : uid === c.doctor_id ? `Dr. ${fullName(c.doctor)}`.trim()
              : uid === c.patient_id ? (fullName(c.patient) || 'Patient')
              : 'System'
            const isOpen = open === c.id
            return (
              <div key={c.id} className="py-2.5">
                <button onClick={() => toggle(c.id)} aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 text-left rounded-lg hover:bg-gray-50 -mx-1 px-1 py-0.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${st.cls}`}>
                    <Icon className="w-4 h-4"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{otherName(c)}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {formatDateTime(c.initiated_at)} · {c.initiated_by === userId ? 'You called' : 'Incoming'}
                      {c.status === 'ended' && c.duration_seconds != null ? ` · ${formatDuration(c.duration_seconds)}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}/>
                </button>

                {isOpen && (
                  <div className="mt-2 ml-12 bg-gray-50 rounded-xl p-3 space-y-3 text-xs">
                    {/* Exact times */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div><p className="text-gray-400">Started</p><p className="font-medium text-gray-700">{formatTimeOnly(c.initiated_at)}</p></div>
                      <div><p className="text-gray-400">Answered</p><p className="font-medium text-gray-700">{c.answered_at ? formatTimeOnly(c.answered_at) : '—'}</p></div>
                      <div><p className="text-gray-400">Ended</p><p className="font-medium text-gray-700">{c.ended_at ? formatTimeOnly(c.ended_at) : '—'}</p></div>
                      <div><p className="text-gray-400">Duration</p><p className="font-medium text-gray-700">{c.duration_seconds != null ? formatDuration(c.duration_seconds) : '—'}</p></div>
                    </div>

                    {c.appointment?.chief_complaint && (
                      <p><span className="text-gray-400">Reason for visit:</span> <span className="text-gray-700">{c.appointment.chief_complaint}</span></p>
                    )}
                    {isDoctor && (
                      <div>
                        <p className="text-gray-400">Consultation notes</p>
                        <p className="text-gray-700 whitespace-pre-line">{c.appointment?.doctor_notes || 'No notes for this appointment.'}</p>
                      </div>
                    )}

                    {/* Timeline */}
                    <div>
                      <p className="text-gray-400 mb-1">Timeline</p>
                      <ol className="border-l-2 border-gray-200 pl-3 space-y-1">
                        {(events[c.id] || []).map(e => (
                          <li key={e.id}>
                            <span className="text-gray-400 tabular-nums">{fmtSeconds(e.created_at)}</span>{' '}
                            <span className="text-gray-700">
                              {e.event === 'missed' ? EVENT_LABEL.missed : <><span className="font-semibold">{nameOf(e.user_id)}</span> {EVENT_LABEL[e.event] || e.event}</>}
                            </span>
                            {e.detail && e.event !== 'missed' && <span className="text-gray-400"> — {e.detail}</span>}
                          </li>
                        ))}
                        {!events[c.id] && <li className="text-gray-400">Loading timeline...</li>}
                      </ol>
                    </div>

                    {isDoctor && (
                      <button onClick={() => issuePrescription(c)}
                        className="btn-primary-doctor text-xs px-3 py-1.5">
                        <FileText className="w-3.5 h-3.5"/> Issue Prescription
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && shown.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-3 mt-1 border-t border-gray-100">
          <button onClick={() => { setPage(current - 1); setOpen(null) }} disabled={current === 0}
            className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
            <ChevronLeft className="w-3.5 h-3.5"/> Previous
          </button>
          <span className="text-xs text-gray-500">
            {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, shown.length)} of {shown.length}
          </span>
          <button onClick={() => { setPage(current + 1); setOpen(null) }} disabled={current >= pageCount - 1}
            className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
            Next <ChevronRight className="w-3.5 h-3.5"/>
          </button>
        </div>
      )}
    </div>
  )
}
