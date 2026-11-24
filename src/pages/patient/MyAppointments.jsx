import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, Video, RefreshCw, Plus, Search, ChevronLeft, ChevronRight, ChevronDown,
  CalendarClock, CalendarSync, X, Repeat,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { isActive, statusMeta, estimateWindow, manilaToday, formatDate, formatSlot, formatDateTime } from '../../lib/queue'

const TABS = ['All', 'Upcoming', 'Completed', 'Cancelled']
const PAGE_SIZE = 8

// 'Upcoming' covers slot bookings and live queue spots alike;
// 'Cancelled' also lists no-shows.
const inTab = (a, tab) =>
  tab === 'All' ? true
  : tab === 'Upcoming' ? isActive(a.status)
  : tab === 'Completed' ? a.status === 'completed'
  : ['cancelled', 'no_show'].includes(a.status)

// Minutes since midnight of the slot's start ('9:00 AM' / '1:00 PM – 4:00 PM').
function slotMinutes(slot) {
  const m = formatSlot(slot).match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return 0
  return ((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +m[2]
}
const when = a =>
  new Date(`${a.appointment_date}T00:00:00+08:00`).getTime() + slotMinutes(a.time_slot) * 60_000 + (a.queue_number || 0)

// Upcoming: soonest first. Completed / cancelled: most recent first.
// "All": upcoming ones on top, then the rest.
function sortAppointments(list) {
  const upcoming = list.filter(a => isActive(a.status)).sort((x, y) => when(x) - when(y))
  const past     = list.filter(a => !isActive(a.status)).sort((x, y) => when(y) - when(x))
  return [...upcoming, ...past]
}

const doctorName = a => a.doctor ? `Dr. ${a.doctor.first_name || ''} ${a.doctor.last_name || ''}`.trim() : 'Doctor'
const specialization = a => {
  const dp = Array.isArray(a.doctor?.doctor_profiles) ? a.doctor.doctor_profiles[0] : a.doctor?.doctor_profiles
  return dp?.specialization || 'General Consultation'
}
const initials = a => [a.doctor?.first_name?.[0], a.doctor?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'DR'

export default function MyAppointments() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [appts, setAppts]     = useState([])
  const [active, setActive]   = useState('All')
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(0)
  const [open, setOpen]       = useState(null) // expanded "View details" row
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [cancelling, setCancelling] = useState(null)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true); setError('')
    const { data, error: err } = await supabase
      .from('appointments')
      .select(`*,
        doctor:profiles!appointments_doctor_id_fkey(first_name, last_name, doctor_profiles(specialization)),
        block:availability_blocks(avg_minutes_per_patient, now_serving)`)
      .eq('patient_id', user.id)
    if (err) setError(`Could not load appointments: ${err.message}`)
    setAppts(data || [])
    setLoading(false)
  }

  async function cancel(a) {
    const what = a.queue_number ? `your queue spot #${a.queue_number}` : 'this appointment'
    if (!window.confirm(`Cancel ${what} with ${doctorName(a)} on ${formatDate(a.appointment_date)}? This can't be undone.`)) return
    setCancelling(a.id); setError('')
    const { data, error: err } = await supabase.from('appointments')
      .update({ status: 'cancelled' }).eq('id', a.id).in('status', ['upcoming', 'waiting']).select('id')
    setCancelling(null)
    if (err) { setError(`Could not cancel: ${err.message}`); return }
    if (!data?.length) setError("This appointment can't be cancelled anymore (it may already have started).")
    load()
  }

  // Book a new spot with the same doctor; the old one is cancelled only after
  // the new booking succeeds (see BookAppointment).
  function reschedule(a) {
    navigate('/book-appointment', { state: { doctorId: a.doctor_id, rescheduleId: a.id } })
  }
  function bookAgain(a) {
    navigate('/book-appointment', { state: { doctorId: a.doctor_id } })
  }

  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t, appts.filter(a => inTab(a, t)).length])), [appts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sortAppointments(appts.filter(a =>
      inTab(a, active) &&
      (!q || doctorName(a).toLowerCase().includes(q) || specialization(a).toLowerCase().includes(q))))
  }, [appts, active, search])

  useEffect(() => { setPage(0); setOpen(null) }, [active, search])

  const today     = manilaToday()
  const upNextId  = filtered.find(a => isActive(a.status) && a.appointment_date === today)?.id
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current   = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Appointments</h1>
          <p className="text-gray-500 text-sm mt-1">View and manage your scheduled consultations</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-outline"><RefreshCw className="w-4 h-4"/> Refresh</button>
          <button onClick={() => navigate('/find-doctors')} className="btn-primary-patient px-4 py-2 text-sm">
            <Plus className="w-4 h-4"/> Book Appointment
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {/* Search + tabs */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by doctor or specialty..." className="input pl-10"/>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setActive(t)}
              className={`text-sm font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${active === t ? 'bg-white shadow-sm text-patient-700' : 'text-gray-500 hover:text-gray-700'}`}>
              {t}
              <span className={`text-[11px] px-1.5 rounded-full ${active === t ? 'bg-patient-50 text-patient-700' : 'bg-gray-200 text-gray-500'}`}>{counts[t]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 animate-pulse bg-gray-50/60"/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <Calendar className="w-12 h-12 text-gray-200 mb-3"/>
            <p className="font-semibold text-gray-500">
              {appts.length === 0 ? 'No appointments yet' : search ? 'No appointments match your search' : `No ${active.toLowerCase()} appointments`}
            </p>
            {active !== 'Completed' && !search && (
              <button onClick={() => navigate('/find-doctors')} className="btn-primary-patient mt-4 px-6 py-2.5 text-sm">
                Book an Appointment
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pageItems.map(a => {
              const meta     = statusMeta(a.status)
              const live     = isActive(a.status)
              const isToday  = a.appointment_date === today
              const canJoin  = live && a.appointment_date <= today
              const canCancel = ['upcoming', 'waiting'].includes(a.status)
              const expanded = open === a.id
              return (
                <div key={a.id}>
                  <div className={`flex items-center gap-3 px-4 sm:px-5 py-3 ${live && !canJoin ? 'bg-white' : ''}`}>
                    <div className="w-10 h-10 bg-patient-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                      {initials(a)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm truncate">{doctorName(a)}</p>
                        {a.id === upNextId && <span className="text-[10px] font-bold uppercase tracking-wide bg-patient-100 text-patient-700 px-1.5 py-0.5 rounded">Up next</span>}
                        {live && isToday && a.id !== upNextId && <span className="text-[10px] font-bold uppercase tracking-wide bg-patient-50 text-patient-600 px-1.5 py-0.5 rounded">Today</span>}
                      </div>
                      <p className="text-xs text-patient-600 font-medium truncate">{specialization(a)}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {formatDate(a.appointment_date)}{a.time_slot ? ` · ${formatSlot(a.time_slot)}` : ''}
                        {a.status === 'waiting' && a.estimated_time
                          ? ` · Queue #${a.queue_number} · est. ${estimateWindow(a.estimated_time, a.block?.avg_minutes_per_patient)}${a.block?.now_serving ? ` · now serving #${a.block.now_serving}` : ''}`
                          : ''}
                        {a.chief_complaint ? <span className="text-gray-400"> · {a.chief_complaint}</span> : null}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`hidden sm:inline text-xs font-semibold px-2 py-1 rounded-full ${meta.cls}`}>{meta.label}</span>

                      {live && (canJoin ? (
                        <button onClick={() => navigate('/teleconsultation', { state: { appointment: a } })}
                          className="bg-patient-600 hover:bg-patient-700 text-white text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors">
                          <Video className="w-3.5 h-3.5"/> Join Call
                        </button>
                      ) : (
                        <span title="Available on the day of the appointment"
                          className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-not-allowed">
                          <CalendarClock className="w-3.5 h-3.5"/> Scheduled
                        </span>
                      ))}

                      {!live && (
                        <>
                          <button onClick={() => bookAgain(a)}
                            className="text-xs font-semibold text-patient-600 hover:bg-patient-50 px-2.5 py-2 rounded-xl flex items-center gap-1">
                            <Repeat className="w-3.5 h-3.5"/> <span className="hidden md:inline">Book Again</span>
                          </button>
                          <button onClick={() => setOpen(expanded ? null : a.id)} aria-expanded={expanded}
                            className="text-xs font-semibold text-gray-600 hover:bg-gray-100 px-2.5 py-2 rounded-xl flex items-center gap-1">
                            <span className="hidden md:inline">Details</span>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Secondary actions for upcoming appointments */}
                  {live && canCancel && (
                    <div className="flex justify-end gap-1 px-4 sm:px-5 pb-2 -mt-1">
                      <button onClick={() => reschedule(a)}
                        className="text-xs font-semibold text-gray-600 hover:text-patient-700 hover:bg-patient-50 px-2.5 py-1 rounded-lg flex items-center gap-1">
                        <CalendarSync className="w-3.5 h-3.5"/> Reschedule
                      </button>
                      <button onClick={() => cancel(a)} disabled={cancelling === a.id}
                        className="text-xs font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50">
                        <X className="w-3.5 h-3.5"/> {cancelling === a.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </div>
                  )}

                  {/* Details for past appointments */}
                  {expanded && (
                    <div className="bg-gray-50 border-t border-gray-100 px-4 sm:px-5 py-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div><p className="text-gray-400">Status</p><p className="font-medium text-gray-700">{meta.label}</p></div>
                      <div><p className="text-gray-400">Date</p><p className="font-medium text-gray-700">{formatDate(a.appointment_date)}</p></div>
                      <div><p className="text-gray-400">Time</p><p className="font-medium text-gray-700">{formatSlot(a.time_slot) || '—'}</p></div>
                      <div>
                        <p className="text-gray-400">{a.status === 'completed' ? 'Completed' : 'Queue'}</p>
                        <p className="font-medium text-gray-700">
                          {a.status === 'completed' && a.completed_at ? formatDateTime(a.completed_at) : a.queue_number ? `#${a.queue_number}` : '—'}
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-4">
                        <p className="text-gray-400">Reason for visit</p>
                        <p className="text-gray-700">{a.chief_complaint || '—'}</p>
                      </div>
                      {a.doctor_notes && (
                        <div className="col-span-2 sm:col-span-4">
                          <p className="text-gray-400">Doctor&apos;s notes</p>
                          <p className="text-gray-700 whitespace-pre-line">{a.doctor_notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-gray-100">
            <button onClick={() => { setPage(current - 1); setOpen(null) }} disabled={current === 0}
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
              <ChevronLeft className="w-3.5 h-3.5"/> Previous
            </button>
            <span className="text-xs text-gray-500">
              {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <button onClick={() => { setPage(current + 1); setOpen(null) }} disabled={current >= pageCount - 1}
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
              Next <ChevronRight className="w-3.5 h-3.5"/>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
