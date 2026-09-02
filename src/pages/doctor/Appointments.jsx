import React, { useState, useEffect } from 'react'
import { Calendar, RefreshCw, Search, CheckCircle, XCircle, Clock, FileText, ChevronDown, Video } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

const TABS = ['All', 'Upcoming', 'Completed', 'Cancelled']

const STATUS_STYLE = {
  upcoming:  { cls: 'bg-green-100 text-green-700',  icon: Clock,        label: 'Upcoming'  },
  completed: { cls: 'bg-blue-100 text-blue-700',    icon: CheckCircle,  label: 'Completed' },
  cancelled: { cls: 'bg-red-100 text-red-700',      icon: XCircle,      label: 'Cancelled' },
  no_show:   { cls: 'bg-gray-100 text-gray-600',    icon: XCircle,      label: 'No Show'   },
}

export default function DoctorAppointments() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [appts,   setAppts]   = useState([])
  const [search,  setSearch]  = useState('')
  const [tab,     setTab]     = useState('All')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [notes, setNotes]      = useState({})

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select(`*, patient:patient_id(id, first_name, last_name, email, phone, avatar_url)`)
      .eq('doctor_id', user.id)
      .order('appointment_date', { ascending: false })
    setAppts(data || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    setUpdating(id)
    await supabase.from('appointments').update({ status }).eq('id', id)
    setAppts(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    setUpdating(null)
  }

  async function saveNotes(id) {
    setUpdating(id)
    await supabase.from('appointments').update({ doctor_notes: notes[id] }).eq('id', id)
    setAppts(prev => prev.map(a => a.id === id ? { ...a, doctor_notes: notes[id] } : a))
    setUpdating(null)
  }

  // Filter
  const filtered = appts
    .filter(a => tab === 'All' || a.status === tab.toLowerCase())
    .filter(a => {
      if (!search) return true
      const q = search.toLowerCase()
      const pat = a.patient
      return (
        `${pat?.first_name} ${pat?.last_name}`.toLowerCase().includes(q) ||
        (a.chief_complaint || '').toLowerCase().includes(q) ||
        (a.appointment_date || '').includes(q)
      )
    })

  const counts = TABS.reduce((acc, t) => ({
    ...acc,
    [t]: t === 'All' ? appts.length : appts.filter(a => a.status === t.toLowerCase()).length
  }), {})

  function patName(a)     { return a.patient ? `${a.patient.first_name} ${a.patient.last_name}` : 'Patient' }
  function patInitials(a) { return [a.patient?.first_name?.[0], a.patient?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'P' }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patient Appointments</h1>
          <p className="text-gray-500 text-sm mt-1">View and manage appointments booked by your patients</p>
        </div>
        <button onClick={load} className="btn-outline">
          <RefreshCw className="w-4 h-4"/> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
        <input
          placeholder="Search by patient name, date, or notes..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t ? 'bg-white shadow text-doctor-600' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t} <span className="text-xs opacity-70">{counts[t]}</span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="card animate-pulse h-24 bg-gray-50"/>)}</div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Calendar className="w-12 h-12 text-gray-300 mb-3"/>
          <p className="font-semibold text-gray-500">No {tab.toLowerCase()} appointments</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const s = STATUS_STYLE[a.status] || STATUS_STYLE.upcoming
            const Icon = s.icon
            const isExpanded = expanded === a.id

            return (
              <div key={a.id} className="card p-0 overflow-hidden">
                {/* Row */}
                <div className="flex items-center gap-4 p-4">
                  {/* Patient avatar */}
                  <div className="w-11 h-11 bg-doctor-100 rounded-full flex items-center justify-center text-doctor-700 font-bold text-sm shrink-0">
                    {patInitials(a)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{patName(a)}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{a.appointment_date} · {a.time_slot}</p>
                    {a.chief_complaint && (
                      <p className="text-gray-400 text-xs mt-0.5 truncate">{a.chief_complaint}</p>
                    )}
                  </div>

                  {/* Status badge */}
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${s.cls}`}>
                    {s.label}
                  </span>

                  {/* Expand toggle */}
                  <button onClick={() => setExpanded(isExpanded ? null : a.id)}
                    className="text-gray-400 hover:text-gray-600 shrink-0">
                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}/>
                  </button>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-4">
                    {/* Patient details */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div><p className="text-xs text-gray-400 mb-0.5">Email</p><p className="font-medium text-gray-700 truncate">{a.patient?.email || '—'}</p></div>
                      <div><p className="text-xs text-gray-400 mb-0.5">Phone</p><p className="font-medium text-gray-700">{a.patient?.phone || '—'}</p></div>
                      <div><p className="text-xs text-gray-400 mb-0.5">Fee</p><p className="font-medium text-gray-700">₱{a.consultation_fee || '—'}</p></div>
                    </div>

                    {/* Doctor notes */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Doctor's Notes</label>
                      <textarea rows={2}
                        placeholder="Add consultation notes, findings, or follow-up instructions..."
                        defaultValue={a.doctor_notes || ''}
                        onChange={e => setNotes(n => ({ ...n, [a.id]: e.target.value }))}
                        className="input-doctor resize-none text-sm w-full"/>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      {a.status === 'upcoming' && (
                        <>
                          <button onClick={() => navigate('/doctor/teleconsultation', { state: { appointment: a } })}
                            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all">
                            <Video className="w-3.5 h-3.5"/> Start Video Call
                          </button>
                          <button onClick={() => updateStatus(a.id, 'completed')} disabled={!!updating}
                            className="flex items-center gap-1.5 bg-doctor-600 hover:bg-doctor-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all">
                            <CheckCircle className="w-3.5 h-3.5"/> Mark Completed
                          </button>
                          <button onClick={() => updateStatus(a.id, 'cancelled')} disabled={!!updating}
                            className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all">
                            <XCircle className="w-3.5 h-3.5"/> Cancel
                          </button>
                          <button onClick={() => updateStatus(a.id, 'no_show')} disabled={!!updating}
                            className="flex items-center gap-1.5 bg-gray-400 hover:bg-gray-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all">
                            No Show
                          </button>
                        </>
                      )}
                      {notes[a.id] !== undefined && (
                        <button onClick={() => saveNotes(a.id)} disabled={!!updating}
                          className="flex items-center gap-1.5 border border-doctor-600 text-doctor-600 hover:bg-doctor-50 text-xs font-semibold px-4 py-2 rounded-xl transition-all">
                          {updating === a.id ? <div className="w-3 h-3 border-2 border-doctor-600 border-t-transparent rounded-full animate-spin"/> : null}
                          Save Notes
                        </button>
                      )}
                      <button onClick={() => navigate('/doctor/prescribe', { state: { patientEmail: a.patient?.email, appointmentId: a.id } })}
                        className="flex items-center gap-1.5 border border-gray-300 text-gray-600 hover:bg-gray-100 text-xs font-semibold px-4 py-2 rounded-xl transition-all ml-auto">
                        <FileText className="w-3.5 h-3.5"/> Issue Rx
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
