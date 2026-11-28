import React, { useState, useEffect, useMemo } from 'react'
import {
  Calendar, RefreshCw, Search, CheckCircle, XCircle, FileText, ChevronDown, ChevronLeft, ChevronRight,
  Video, PlayCircle, BadgeCheck, Clock, Mail, Phone, StickyNote, UserX,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { isActive, statusMeta, formatDay, formatTimestamp, formatSlot, manilaToday } from '../../lib/queue'
import { postSystemMessage, SYSTEM, FEE_PREFIX, formatFee } from '../../lib/chatSystem'
import { displayName, initialsOf } from '../../lib/names'

const TABS = ['All', 'Upcoming', 'Completed', 'Cancelled']
const PAGE_SIZE = 8

// 'Upcoming' covers legacy slot bookings and live queue spots alike;
// 'Cancelled' also lists no-shows (shown as "Missed").
const inTab = (a, tab) =>
  tab === 'All' ? true
  : tab === 'Upcoming' ? isActive(a.status)
  : tab === 'Completed' ? a.status === 'completed'
  : ['cancelled', 'no_show'].includes(a.status)

// '9:00 AM' / '09:00 AM' / '14:30' -> minutes after midnight (unknown = 0).
function slotMinutes(slot) {
  const m = String(slot || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m) return 0
  let h = Number(m[1]) % 12
  if (!m[3]) h = Number(m[1])
  else if (m[3].toUpperCase() === 'PM') h += 12
  return h * 60 + Number(m[2])
}

// Sortable 'YYYY-MM-DD HHHH' key; queue spots use their estimated time.
function when(a) {
  const mins = a.estimated_time
    ? Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date(a.estimated_time)).split(':').reduce((h, m) => h * 60 + Number(m)))
    : slotMinutes(a.time_slot)
  return `${a.appointment_date || ''} ${String(mins).padStart(4, '0')}`
}

const soonestFirst = (x, y) => when(x).localeCompare(when(y))
const latestFirst  = (x, y) => when(y).localeCompare(when(x))
// All tab: active bookings first (soonest first), then completed, then
// cancelled / missed (each most recent first).
const GROUP = a => isActive(a.status) ? 0 : a.status === 'completed' ? 1 : 2

function sortFor(tab, list) {
  const out = [...list]
  if (tab === 'Upcoming') return out.sort(soonestFirst)
  if (tab !== 'All') return out.sort(latestFirst)
  return out.sort((x, y) => GROUP(x) - GROUP(y) || (GROUP(x) === 0 ? soonestFirst(x, y) : latestFirst(x, y)))
}

const btn = 'flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all disabled:opacity-50'

export default function DoctorAppointments() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [appts,   setAppts]   = useState([])
  const [search,  setSearch]  = useState('')
  const [tab,     setTab]     = useState('All')
  const [page,    setPage]    = useState(0)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [notesOpen, setNotesOpen] = useState(() => new Set()) // completed rows with "View Notes" open
  const [notes, setNotes]      = useState({})
  const [actionError, setActionError] = useState('')
  const [accepted, setAccepted] = useState(() => new Set()) // appointment ids with the fee line posted
  const [accepting, setAccepting] = useState(null)

  useEffect(() => { if (user) load() }, [user])
  useEffect(() => { setPage(0); setExpanded(null) }, [tab, search])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select(`*, patient:patient_id(id, first_name, last_name, email, phone, avatar_url)`)
      .eq('doctor_id', user.id)
      .order('appointment_date', { ascending: false })
    setAppts(data || [])
    setLoading(false)
    loadAccepted(data || [])
  }

  // "Accepted" = the doctor's 'Booking accepted · Consultation fee: …' line
  // exists in the appointment's chat (shared rule with the mobile app; no
  // column records it).
  async function loadAccepted(list) {
    const open = list.filter(a => isActive(a.status)).map(a => a.id)
    if (!open.length) { setAccepted(new Set()); return }
    const { data: sessions } = await supabase.from('consultation_sessions')
      .select('id, appointment_id').in('appointment_id', open)
    if (!sessions?.length) { setAccepted(new Set()); return }
    const { data: lines } = await supabase.from('chat_logs')
      .select('session_id').in('session_id', sessions.map(s => s.id))
      .eq('message_type', 'system').eq('sender_id', user.id).like('content', `${FEE_PREFIX}%`)
    const done = new Set((lines || []).map(l => l.session_id))
    setAccepted(new Set(sessions.filter(s => done.has(s.id)).map(s => s.appointment_id)))
  }

  async function accept(a) {
    setAccepting(a.id); setActionError('')
    const { data: dp } = await supabase.from('doctor_profiles')
      .select('consultation_fee, currency').eq('user_id', user.id).maybeSingle()
    const ok = await postSystemMessage(a.id, user.id, FEE_PREFIX + formatFee(dp?.consultation_fee, dp?.currency))
    setAccepting(null)
    if (ok) setAccepted(prev => new Set(prev).add(a.id))
    else loadAccepted(appts) // posted moments ago already, or failed — re-check
  }

  async function updateStatus(id, status) {
    const appt = appts.find(a => a.id === id)
    // Shared rule with mobile: an appointment dated in the future can't be completed.
    if (status === 'completed' && appt && appt.appointment_date > manilaToday()) {
      setActionError("This appointment is on a future date, so it can't be marked completed yet.")
      return
    }
    if (status === 'cancelled' && !window.confirm(`Cancel ${displayName(appt?.patient, 'this patient')}'s appointment? The patient will see it as cancelled.`)) return
    if (status === 'no_show' && !window.confirm(`Mark ${displayName(appt?.patient, 'this patient')} as missed (no-show)?`)) return
    setUpdating(id); setActionError('')
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) setActionError(`Could not update the appointment: ${error.message}`)
    else {
      setAppts(prev => prev.map(a => a.id === id ? { ...a, status } : a))
      if (status === 'completed') postSystemMessage(id, user.id, SYSTEM.consultationEnded)
    }
    setUpdating(null)
  }

  async function saveNotes(id) {
    setUpdating(id); setActionError('')
    const { error } = await supabase.from('appointments').update({ doctor_notes: notes[id] }).eq('id', id)
    if (error) setActionError(`Could not save notes: ${error.message}`)
    else {
      setAppts(prev => prev.map(a => a.id === id ? { ...a, doctor_notes: notes[id] } : a))
      setNotes(n => { const { [id]: _, ...rest } = n; return rest })
    }
    setUpdating(null)
  }

  function toggleNotes(id) {
    setNotesOpen(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // Visit type (no column for it): a follow-up when this patient already had a
  // completed visit with you before this one, otherwise a check-up.
  const visitType = useMemo(() => {
    const done = {}
    appts.filter(a => a.status === 'completed').forEach(a => {
      const k = when(a)
      if (!done[a.patient_id] || k < done[a.patient_id]) done[a.patient_id] = k
    })
    return Object.fromEntries(appts.map(a => [a.id, done[a.patient_id] && done[a.patient_id] < when(a) ? 'Follow-up' : 'Check-up']))
  }, [appts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sortFor(tab, appts.filter(a => inTab(a, tab)).filter(a => !q ||
      displayName(a.patient, '').toLowerCase().includes(q) ||
      (a.patient?.email || '').toLowerCase().includes(q) ||
      (a.chief_complaint || '').toLowerCase().includes(q) ||
      (a.doctor_notes || '').toLowerCase().includes(q) ||
      (a.appointment_date || '').includes(q) ||
      formatDay(a.appointment_date, { year: 'numeric' }).toLowerCase().includes(q)))
  }, [appts, tab, search])

  const counts = Object.fromEntries(TABS.map(t => [t, appts.filter(a => inTab(a, t)).length]))

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current   = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  const timeOf = a => a.status === 'waiting' && a.estimated_time
    ? `est. ${formatTimestamp(a.estimated_time)}`
    : formatSlot(a.time_slot) || '—'

  function renderDrawer(a) {
    const future = a.appointment_date > manilaToday()
    const showNotes = a.status !== 'completed' || notesOpen.has(a.id)
    const busy = !!updating
    return (
      <div className="bg-gray-50 border-t border-gray-100 px-4 sm:px-5 py-4 space-y-4">
        {/* Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0"/>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">Date &amp; time</p>
              <p className="font-medium text-gray-800">{formatDay(a.appointment_date, { year: 'numeric' })} · {timeOf(a)}</p>
              {a.queue_number ? <p className="text-xs text-gray-500">Queue #{a.queue_number}</p> : null}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Mail className="w-4 h-4 text-gray-400 mt-0.5 shrink-0"/>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">Email</p>
              <p className="font-medium text-gray-800 truncate">{a.patient?.email || '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Phone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0"/>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">Phone</p>
              <p className="font-medium text-gray-800">{a.patient?.phone || '—'}</p>
            </div>
          </div>
        </div>

        {/* Patient's note */}
        <div className="bg-white border border-gray-100 rounded-xl px-3.5 py-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">Patient's note</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{a.chief_complaint || <span className="text-gray-400">No note from the patient.</span>}</p>
        </div>

        {/* Doctor's notes */}
        {showNotes && (
          <div>
            <label htmlFor={`notes-${a.id}`} className="block text-xs font-semibold text-gray-600 mb-1.5">Doctor's notes</label>
            <textarea id={`notes-${a.id}`} rows={2}
              placeholder="Add consultation notes, findings, or follow-up instructions..."
              defaultValue={a.doctor_notes || ''}
              onChange={e => setNotes(n => ({ ...n, [a.id]: e.target.value }))}
              className="input-doctor resize-none text-sm w-full"/>
            {notes[a.id] !== undefined && notes[a.id] !== (a.doctor_notes || '') && (
              <button onClick={() => saveNotes(a.id)} disabled={busy}
                className={`${btn} mt-2 border border-doctor-600 text-doctor-600 hover:bg-doctor-50`}>
                {updating === a.id && <span className="w-3 h-3 border-2 border-doctor-600 border-t-transparent rounded-full animate-spin"/>}
                Save Notes
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Booking accepted = fee line posted in the chat (shared with mobile). */}
          {(a.status === 'upcoming' || a.status === 'waiting') && (
            accepted.has(a.id) ? (
              <span className={`${btn} text-emerald-700 bg-emerald-50 border border-emerald-200`}>
                <BadgeCheck className="w-3.5 h-3.5"/> Accepted
              </span>
            ) : (
              <button onClick={() => accept(a)} disabled={accepting === a.id}
                title="Posts the consultation fee in the chat"
                className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                <BadgeCheck className="w-3.5 h-3.5"/> {accepting === a.id ? 'Accepting...' : 'Accept Booking'}
              </button>
            )
          )}

          {/* Slot booking */}
          {a.status === 'upcoming' && (
            <>
              <button onClick={() => navigate('/doctor/teleconsultation', { state: { appointment: a } })}
                className={`${btn} bg-purple-600 hover:bg-purple-700 text-white`}>
                <Video className="w-3.5 h-3.5"/> Start Call
              </button>
              <button onClick={() => updateStatus(a.id, 'completed')} disabled={busy || future}
                title={future ? 'Available on the appointment day' : undefined}
                className={`${btn} bg-doctor-600 hover:bg-doctor-700 text-white disabled:hover:bg-doctor-600`}>
                <CheckCircle className="w-3.5 h-3.5"/> Mark Completed
              </button>
              <button onClick={() => updateStatus(a.id, 'cancelled')} disabled={busy}
                className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>
                <XCircle className="w-3.5 h-3.5"/> Cancel
              </button>
              <button onClick={() => updateStatus(a.id, 'no_show')} disabled={busy}
                className={`${btn} text-gray-500 hover:bg-gray-100`}>
                <UserX className="w-3.5 h-3.5"/> No Show
              </button>
            </>
          )}

          {/* Queue spot: run from the Dashboard's live queue. The database
              enforces the allowed status changes either way. */}
          {a.block_id && (a.status === 'waiting' || a.status === 'in_progress') && (
            <>
              <button onClick={() => navigate('/doctor/dashboard')}
                className={`${btn} bg-doctor-600 hover:bg-doctor-700 text-white`}>
                <PlayCircle className="w-3.5 h-3.5"/> Open Live Queue
              </button>
              {a.status === 'in_progress' && (
                <button onClick={() => updateStatus(a.id, 'completed')} disabled={busy}
                  className={`${btn} bg-doctor-600 hover:bg-doctor-700 text-white`}>
                  <CheckCircle className="w-3.5 h-3.5"/> Complete Consultation
                </button>
              )}
              {a.status === 'waiting' && (
                <button onClick={() => updateStatus(a.id, 'cancelled')} disabled={busy}
                  className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>
                  <XCircle className="w-3.5 h-3.5"/> Cancel
                </button>
              )}
              <button onClick={() => updateStatus(a.id, 'no_show')} disabled={busy}
                className={`${btn} text-gray-500 hover:bg-gray-100`}>
                <UserX className="w-3.5 h-3.5"/> No Show
              </button>
            </>
          )}

          {a.status === 'completed' && (
            <>
              <button onClick={() => navigate('/doctor/prescribe', { state: { patientId: a.patient_id, patientEmail: a.patient?.email, appointmentId: a.id } })}
                className={`${btn} bg-doctor-600 hover:bg-doctor-700 text-white`}>
                <FileText className="w-3.5 h-3.5"/> Issue Prescription
              </button>
              <button onClick={() => toggleNotes(a.id)}
                className={`${btn} border border-gray-200 text-gray-600 hover:bg-white`}>
                <StickyNote className="w-3.5 h-3.5"/> {notesOpen.has(a.id) ? 'Hide Notes' : 'View Notes'}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patient Appointments</h1>
          <p className="text-gray-500 text-sm mt-1">View and manage appointments booked by your patients</p>
        </div>
        <button onClick={load} className="btn-outline">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/> Refresh
        </button>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-start justify-between gap-3">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} aria-label="Dismiss" className="text-red-400 hover:text-red-600"><XCircle className="w-4 h-4"/></button>
        </div>
      )}

      {/* Search + status tabs */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
          <input
            placeholder="Search by patient name, date, or notes..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="input-doctor pl-10"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t}
              <span className={`text-[11px] px-1.5 rounded-full ${tab === t ? 'bg-doctor-50 text-doctor-700' : 'bg-gray-200 text-gray-500'}`}>{counts[t]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 animate-pulse bg-gray-50/60"/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Calendar className="w-12 h-12 text-gray-200 mb-3"/>
            <p className="font-semibold text-gray-500">
              {search ? 'No appointments match your search' : tab === 'All' ? 'No appointments yet' : `No ${tab.toLowerCase()} appointments`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pageItems.map(a => {
              const s = statusMeta(a.status)
              const isExp = expanded === a.id
              const type = visitType[a.id]
              return (
                <div key={a.id}>
                  <button onClick={() => setExpanded(isExp ? null : a.id)} aria-expanded={isExp}
                    className={`w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 text-left transition-colors ${isExp ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <div className="w-9 h-9 bg-doctor-100 rounded-full flex items-center justify-center text-doctor-700 font-bold text-xs shrink-0">
                      {initialsOf(a.patient, 'P')}
                    </div>
                    <div className="w-40 sm:w-56 min-w-0 shrink-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{displayName(a.patient, 'Patient')}</p>
                      <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                        <Clock className="w-3 h-3 shrink-0"/>
                        {formatDay(a.appointment_date, { year: 'numeric' })} · {timeOf(a)}
                        {a.queue_number ? ` · #${a.queue_number}` : ''}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0 hidden md:flex items-center gap-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${type === 'Follow-up' ? 'bg-indigo-50 text-indigo-700' : 'bg-doctor-50 text-doctor-700'}`}>
                        {type}
                      </span>
                      {a.chief_complaint
                        ? <p className="text-xs text-gray-500 truncate">“{a.chief_complaint}”</p>
                        : <p className="text-xs text-gray-300 truncate">No patient note</p>}
                    </div>
                    <span className={`ml-auto md:ml-0 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${s.cls}`}>
                      {s.label}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExp ? 'rotate-180' : ''}`}/>
                  </button>
                  {isExp && renderDrawer(a)}
                </div>
              )
            })}
          </div>
        )}

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-gray-100">
            <button onClick={() => { setPage(current - 1); setExpanded(null) }} disabled={current === 0}
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
              <ChevronLeft className="w-3.5 h-3.5"/> Previous
            </button>
            <span className="text-xs text-gray-500">
              {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <button onClick={() => { setPage(current + 1); setExpanded(null) }} disabled={current >= pageCount - 1}
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
              Next <ChevronRight className="w-3.5 h-3.5"/>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
