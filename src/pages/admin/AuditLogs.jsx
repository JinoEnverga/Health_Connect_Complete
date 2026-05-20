import React, { useEffect, useState } from 'react'
import { ClipboardList, RefreshCw, Search, Calendar, User, FileText, Heart, Stethoscope } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const EVENT_TYPES = ['all', 'appointment', 'prescription', 'vitals', 'profile']

const eventIcon = {
  appointment:  Calendar,
  prescription: FileText,
  vitals:       Heart,
  profile:      User,
}

const eventColor = {
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
    const [apptRes, rxRes, vitalsRes] = await Promise.all([
      supabase.from('appointments')
        .select('id, status, created_at, profiles!appointments_patient_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false }).limit(15),
      supabase.from('prescriptions')
        .select('id, status, created_at, diagnosis, profiles!prescriptions_patient_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false }).limit(15),
      supabase.from('vitals')
        .select('id, created_at, patient_id, profiles!vitals_patient_id_fkey(first_name, last_name)')
        .order('created_at', { ascending: false }).limit(15),
    ])

    const combined = [
      ...(apptRes.data || []).map(a => ({
        id: `appt-${a.id}`, type: 'appointment',
        title: `Appointment ${a.status}`,
        user_name: a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : 'Patient',
        created_at: a.created_at,
      })),
      ...(rxRes.data || []).map(r => ({
        id: `rx-${r.id}`, type: 'prescription',
        title: `Prescription: ${r.diagnosis || 'Issued'}`,
        user_name: r.profiles ? `${r.profiles.first_name} ${r.profiles.last_name}` : 'Patient',
        created_at: r.created_at,
      })),
      ...(vitalsRes.data || []).map(v => ({
        id: `vital-${v.id}`, type: 'vitals',
        title: 'Vitals recorded',
        user_name: v.profiles ? `${v.profiles.first_name} ${v.profiles.last_name}` : 'Patient',
        created_at: v.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    setLogs(combined)
    setFiltered(combined)
    setLoading(false)
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
  }

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
        <input type="text" placeholder="Search logs..."
          value={query} onChange={e => setQuery(e.target.value)}
          className="input pl-9"/>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {EVENT_TYPES.map(t => (
          <button key={t} onClick={() => setTypeTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all capitalize ${
              typeTab === t
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {t === 'all' ? 'All Events' : t + 's'}
          </button>
        ))}
      </div>

      {/* Logs */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="card animate-pulse h-16 bg-gray-50"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center py-14 gap-3 text-center">
          <ClipboardList className="w-12 h-12 text-gray-300"/>
          <p className="font-semibold text-gray-500">No activity logs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(log => {
            const Icon  = eventIcon[log.type] || Stethoscope
            const color = eventColor[log.type] || 'text-gray-500 bg-gray-50'
            return (
              <div key={log.id} className="card flex items-center gap-3 p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-4 h-4"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{log.title}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3"/> {log.user_name}
                  </p>
                </div>
                <p className="text-xs text-gray-400 shrink-0 text-right">{formatDate(log.created_at)}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
