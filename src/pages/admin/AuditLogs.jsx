import React, { useEffect, useState } from 'react'
import { ClipboardList, RefreshCw, Search, Calendar, User, FileText, Heart, Stethoscope, PhoneCall, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDuration } from '../../components/shared/CallHistory'
import { displayName } from '../../lib/names'

const EVENT_TYPES = ['all', 'activity', 'call', 'appointment', 'prescription', 'vitals', 'profile']
const TYPE_LABEL = {
  all: 'All Events', activity: 'Activities', call: 'Calls', appointment: 'Appointments',
  prescription: 'Prescriptions', vitals: 'Vitals', profile: 'Profiles',
}
const PAGE_SIZE = 10

// Readable titles for the shared audit_logs table (written by the mobile app's
// AuditService as e.g. 'VIEW_PRESCRIPTION' · 'prescriptions').
const ACTION_LABEL = {
  USER_LOGIN: 'Signed in',
  SKIN_ANALYSIS: 'Skin Analysis',
  VIEW_PRESCRIPTION: 'Viewed Prescription',
  VIEW_MEDICAL_HISTORY: 'Viewed Medical History',
  UPDATE_DOCTOR_AVAILABILITY: 'Updated Doctor Availability',
}
const TABLE_LABEL = {
  ai_scan_results: 'AI Scan Results', prescriptions: 'Prescriptions', appointments: 'Appointments',
  doctor_profiles: 'Doctor Profiles', patient_profiles: 'Patient Profiles', profiles: 'Profiles',
  vitals: 'Vitals', users: 'Accounts',
}
const VERB = { VIEW: 'Viewed', UPDATE: 'Updated', CREATE: 'Created', DELETE: 'Deleted', ADD: 'Added', REMOVE: 'Removed', ISSUE: 'Issued' }
const titleCase = s => s.toLowerCase().split(/[_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
function humanAction(action = '', table = '') {
  const a = String(action).toUpperCase()
  let label = ACTION_LABEL[a]
  if (!label) {
    const [first, ...rest] = a.split('_')
    label = VERB[first] && rest.length ? `${VERB[first]} ${titleCase(rest.join('_'))}` : titleCase(a)
  }
  // Sign-ins are logged against the accounts table; the label says it all.
  const t = table && a !== 'USER_LOGIN' ? (TABLE_LABEL[table] || titleCase(table)) : ''
  // Skip the table when the label already says it (e.g. "Viewed Prescription · Prescriptions").
  const redundant = t && label.toLowerCase().includes(t.toLowerCase().replace(/s$/, ''))
  return t && !redundant ? `${label} · ${t}` : label
}

const eventIcon = {
  activity:     ClipboardList,
  call:         PhoneCall,
  appointment:  Calendar,
  prescription: FileText,
  vitals:       Heart,
  profile:      User,
}

const eventColor = {
  activity:     'text-gray-700 bg-gray-100',
  call:         'text-emerald-600 bg-emerald-50',
  appointment:  'text-orange-500 bg-orange-50',
  prescription: 'text-purple-600 bg-purple-50',
  vitals:       'text-red-500 bg-red-50',
  profile:      'text-blue-500 bg-blue-50',
}

export default function AuditLogs() {
  const [logs, setLogs]         = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading]   = useState(true)
  const [query, setQuery]       = useState('')
  const [typeTab, setTypeTab]   = useState('all')

  useEffect(() => { load() }, [])

  useEffect(() => {
    let list = logs
    if (typeTab !== 'all') list = list.filter(l => l.type === typeTab)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(l =>
        (l.title || '').toLowerCase().includes(q) ||
        (l.user_name || '').toLowerCase().includes(q)
      )
    }
    setFiltered(list)
  }, [query, typeTab, logs])

  async function load() {
    setLoading(true)
    const [callRes, apptRes, rxRes, vitalsRes, printRes, auditRes] = await Promise.all([
      supabase.from('call_logs')
        .select(`id, status, initiated_at, duration_seconds, end_reason,
          doctor:profiles!call_logs_doctor_id_fkey(first_name, last_name),
          patient:profiles!call_logs_patient_id_fkey(first_name, last_name)`)
        .order('initiated_at', { ascending: false }).limit(30),
      supabase.from('appointments')
        .select('id, status, created_at, profiles!appointments_patient_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false }).limit(15),
      supabase.from('prescriptions')
        .select('id, status, created_at, diagnosis, profiles!prescriptions_patient_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false }).limit(15),
      supabase.from('vitals')
        .select('id, created_at, patient_id, profiles!vitals_patient_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false }).limit(15),
      supabase.from('prescription_print_log')
        .select('id, event, copy_number, max_prints, copy_label, reason, created_at, actor:profiles!prescription_print_log_actor_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false }).limit(30),
      // Shared with the mobile app (AuditService): user_id, action, table_name, record_id.
      supabase.from('audit_logs')
        .select('id, user_id, action, table_name, record_id, created_at')
        .order('created_at', { ascending: false }).limit(50),
    ])

    // audit_logs.user_id points at auth.users, so look the names up separately.
    const auditIds = [...new Set((auditRes.data || []).map(a => a.user_id).filter(Boolean))]
    const { data: auditUsers } = auditIds.length
      ? await supabase.from('profiles').select('id, first_name, last_name, role').in('id', auditIds)
      : { data: [] }
    const auditName = Object.fromEntries((auditUsers || []).map(u => [u.id, displayName(u, u.role)]))

    const callTitle = c => ({
      ringing:   'Call ringing',
      active:    'Call in progress',
      ended:     `Call completed${c.duration_seconds != null ? ` (${formatDuration(c.duration_seconds)})` : ''}`,
      cancelled: 'Call cancelled before answer',
      missed:    'Call missed',
    }[c.status] || `Call ${c.status}`)
    const nm = p => p ? displayName(p, '') : ''

    const combined = [
      ...(auditRes.data || []).map(a => ({
        id: `audit-${a.id}`, type: 'activity',
        title: humanAction(a.action, a.table_name),
        user_name: auditName[a.user_id] || 'Unknown user',
        created_at: a.created_at,
      })),
      ...(callRes.data || []).map(c => ({
        id: `call-${c.id}`, type: 'call',
        title: callTitle(c),
        user_name: `Dr. ${nm(c.doctor) || '—'} ↔ ${nm(c.patient) || 'Patient'}`,
        created_at: c.initiated_at,
      })),
      ...(apptRes.data || []).map(a => ({
        id: `appt-${a.id}`, type: 'appointment',
        title: `Appointment ${a.status}`,
        user_name: displayName(a.profiles, 'Patient'),
        created_at: a.created_at,
      })),
      ...(rxRes.data || []).map(r => ({
        id: `rx-${r.id}`, type: 'prescription',
        title: `Prescription: ${r.diagnosis || 'Issued'}`,
        user_name: displayName(r.profiles, 'Patient'),
        created_at: r.created_at,
      })),
      ...(printRes.data || []).map(l => ({
        id: `rxprint-${l.id}`, type: 'prescription',
        title: l.event === 'printed'
          ? `Prescription printed — copy ${l.copy_number} of ${l.max_prints} (${l.copy_label})`
          : `Prescription reprint authorized — ${l.reason}`,
        user_name: l.event === 'printed' ? (nm(l.actor) || 'Patient') : `Dr. ${nm(l.actor) || '—'}`,
        created_at: l.created_at,
      })),
      ...(vitalsRes.data || []).map(v => ({
        id: `vital-${v.id}`, type: 'vitals',
        title: 'Vitals recorded',
        user_name: displayName(v.profiles, 'Patient'),
        created_at: v.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    setLogs(combined)
    setFiltered(combined)
    setLoading(false)
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [query, typeTab])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current   = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const countOf   = t => t === 'all' ? logs.length : logs.filter(l => l.type === t).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">All system activity</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition-all">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
        <input type="text" placeholder="Search by event or person..."
          value={query} onChange={e => setQuery(e.target.value)}
          className="input pl-9"/>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {EVENT_TYPES.map(t => (
          <button key={t} onClick={() => setTypeTab(t)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              typeTab === t
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {TYPE_LABEL[t]}
            {!loading && <span className={`text-xs px-1.5 rounded-full ${typeTab === t ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{countOf(t)}</span>}
          </button>
        ))}
      </div>

      {/* Logs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {loading ? (
        <div className="divide-y divide-gray-100">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 animate-pulse bg-gray-50/60"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-14 gap-3 text-center">
          <ClipboardList className="w-12 h-12 text-gray-300"/>
          <p className="font-semibold text-gray-500">No activity logs found</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {pageItems.map(log => {
            const Icon  = eventIcon[log.type] || Stethoscope
            const color = eventColor[log.type] || 'text-gray-500 bg-gray-50'
            return (
              <div key={log.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-4 h-4"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{log.title}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3"/> {log.user_name}
                  </p>
                </div>
                <p className="text-xs text-gray-400 shrink-0 text-right tabular-nums">{formatDate(log.created_at)}</p>
              </div>
            )
          })}
        </div>
      )}

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-gray-100">
          <button onClick={() => setPage(current - 1)} disabled={current === 0}
            className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
            <ChevronLeft className="w-3.5 h-3.5"/> Previous
          </button>
          <span className="text-xs text-gray-500">
            {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <button onClick={() => setPage(current + 1)} disabled={current >= pageCount - 1}
            className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
            Next <ChevronRight className="w-3.5 h-3.5"/>
          </button>
        </div>
      )}
      </div>
    </div>
  )
}
