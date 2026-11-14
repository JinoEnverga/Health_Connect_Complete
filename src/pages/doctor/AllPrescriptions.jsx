import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, Plus, ChevronDown, ChevronUp, RefreshCw, Pill, Printer, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import DigitalPrescription from '../../components/shared/DigitalPrescription'

const STATUS_STYLE = {
  active:    'bg-green-100 text-green-700',
  dispensed: 'bg-blue-100 text-blue-700',
  expired:   'bg-red-100 text-red-700',
  revoked:   'bg-gray-100 text-gray-500',
}

const fmtStamp = ts => new Date(ts).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })

/**
 * Patient's official-print status for one prescription, its print history,
 * and the doctor's reprint override (014_prescription_print_lock.sql).
 */
function PrintControl({ rx, onUpdated }) {
  const [log, setLog]         = useState(null)
  const [open, setOpen]       = useState(false)
  const [reason, setReason]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')

  const loadLog = useCallback(async () => {
    const { data } = await supabase.from('prescription_print_log')
      .select('id, event, copy_number, max_prints, copy_label, reason, created_at')
      .eq('prescription_id', rx.id).order('created_at', { ascending: false })
    setLog(data || [])
  }, [rx.id])

  // Reload whenever the counters change (patient printed / reprint granted).
  useEffect(() => { loadLog() }, [loadLog, rx.print_count, rx.max_prints])

  const expired = rx.expires_at && new Date(rx.expires_at) < new Date()
  const used = rx.print_count ?? 0, allowed = rx.max_prints ?? 1
  const canAuthorize = rx.status === 'active' && !expired && used >= allowed

  async function authorize(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    const { data, error } = await supabase.rpc('authorize_prescription_reprint', { p_prescription_id: rx.id, p_reason: reason })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onUpdated(rx.id, data)
    setOpen(false); setReason('')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-gray-700">
          <Printer className="w-4 h-4 text-gray-400"/>
          Patient official prints: <span className="font-semibold">{used} of {allowed}</span> used
          {rx.last_printed_at && <span className="text-xs text-gray-400">· last {fmtStamp(rx.last_printed_at)}</span>}
        </p>
        {canAuthorize && !open && (
          <button onClick={() => setOpen(true)}
            className="text-xs font-semibold text-doctor-600 border border-doctor-200 hover:border-doctor-400 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5"/> Authorize reprint
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={authorize} className="space-y-2">
          <label className="text-xs font-medium text-gray-600">Reason for reprint (logged)</label>
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} autoFocus required minLength={5}
            placeholder="e.g. Patient's printer jammed and the copy was unusable" className="input text-sm"/>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setOpen(false); setErr('') }} className="btn-outline text-xs">Cancel</button>
            <button type="submit" disabled={saving || reason.trim().length < 5} className="btn-primary-doctor text-xs px-3 py-1.5 disabled:opacity-50">
              {saving ? 'Authorizing...' : 'Allow 1 more print'}
            </button>
          </div>
        </form>
      )}

      {log?.length > 0 && (
        <ul className="text-xs text-gray-500 space-y-0.5 border-t border-gray-100 pt-2">
          {log.map(l => (
            <li key={l.id}>
              <span className="tabular-nums text-gray-400">{fmtStamp(l.created_at)}</span>{' '}
              {l.event === 'printed'
                ? <>Patient printed copy {l.copy_number} of {l.max_prints} ({l.copy_label})</>
                : <>You authorized a reprint — <span className="italic">{l.reason}</span></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AllPrescriptions() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [rxList,   setRxList]   = useState([])
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [medCache, setMedCache] = useState({})
  const [fileUrlCache, setFileUrlCache] = useState({})
  const [revoking, setRevoking] = useState(null)
  const [actionError, setActionError] = useState('')
  const [doctorInfo, setDoctorInfo] = useState(null) // letterhead for the Rx document

  useEffect(() => { if (user) load() }, [user])

  useEffect(() => {
    if (!user) return
    supabase.from('doctor_profiles')
      .select('specialization, license_number, clinic_name, clinic_address, clinic_phone')
      .eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setDoctorInfo(data || {}))
  }, [user])

  // Follow print counters live (patient prints, reprints granted elsewhere).
  useEffect(() => {
    if (!user) return
    const channel = supabase.channel(`rx-doctor-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'prescriptions', filter: `doctor_id=eq.${user.id}` },
        ({ new: row }) => patchRx(row.id, row))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  function patchRx(id, fields) {
    setRxList(list => list.map(r => r.id === id ? { ...r, ...fields, patient: r.patient } : r))
  }

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('prescriptions')
      .select('*, patient:patient_id(first_name, last_name, email)')
      .eq('doctor_id', user.id)
      .order('issued_at', { ascending: false })
    setRxList(data || [])
    setLoading(false)
  }

  async function loadMeds(rxId) {
    if (medCache[rxId]) return
    const { data } = await supabase
      .from('prescription_medications')
      .select('*').eq('prescription_id', rxId).order('sort_order')
    setMedCache(c => ({ ...c, [rxId]: data || [] }))
  }

  async function loadFile(rx) {
    if (!rx.file_path || fileUrlCache[rx.id]) return
    const { data } = await supabase.storage.from('prescription-files').createSignedUrl(rx.file_path, 120)
    if (data?.signedUrl) setFileUrlCache(c => ({ ...c, [rx.id]: data.signedUrl }))
  }

  async function revoke(rxId) {
    if (!confirm('Revoke this prescription? The patient will no longer be able to use it.')) return
    setRevoking(rxId); setActionError('')
    const { error } = await supabase.from('prescriptions').update({ status: 'revoked' }).eq('id', rxId)
    if (error) setActionError(`Could not revoke the prescription: ${error.message}`)
    else setRxList(prev => prev.map(r => r.id === rxId ? { ...r, status: 'revoked' } : r))
    setRevoking(null)
  }

  function toggleExpand(rx) {
    if (expanded === rx.id) { setExpanded(null); return }
    setExpanded(rx.id)
    if (rx.file_path) loadFile(rx); else loadMeds(rx.id)
  }

  const filtered = rxList.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    const name = `${r.patient?.first_name} ${r.patient?.last_name}`.toLowerCase()
    return name.includes(q) || r.diagnosis?.toLowerCase().includes(q) || r.patient?.email?.toLowerCase().includes(q)
  })

  function patName(r)     { return r.patient ? `${r.patient.first_name} ${r.patient.last_name}` : 'Patient' }
  function patInitials(r) { return [r.patient?.first_name?.[0], r.patient?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'P' }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Prescriptions</h1>
          <p className="text-gray-500 text-sm mt-1">Every prescription you have issued</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-outline"><RefreshCw className="w-4 h-4"/></button>
          <button onClick={() => navigate('/doctor/prescribe')} className="btn-primary-doctor px-5 py-2.5 text-sm">
            <Plus className="w-4 h-4"/> New Rx
          </button>
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{actionError}</div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
        <input placeholder="Search by patient or diagnosis..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="input pl-10"/>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="card animate-pulse h-20 bg-gray-50"/>)}</div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <FileText className="w-14 h-14 text-gray-200 mb-3"/>
          <p className="font-semibold text-gray-500">No prescriptions found</p>
          <button onClick={() => navigate('/doctor/prescribe')} className="btn-primary-doctor mt-4 px-6 py-2.5 text-sm">
            Issue First Prescription
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(rx => {
            const isExp = expanded === rx.id
            const meds  = medCache[rx.id]

            return (
              <div key={rx.id} className="card p-0 overflow-hidden">
                {/* Row */}
                <div className="flex items-center gap-4 p-4">
                  {/* Patient avatar */}
                  <div className="w-10 h-10 bg-doctor-100 rounded-full flex items-center justify-center text-doctor-700 font-bold text-sm shrink-0">
                    {patInitials(rx)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{patName(rx)}</p>
                    <p className="text-gray-500 text-xs truncate">{rx.diagnosis}</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {new Date(rx.issued_at).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' })}
                    </p>
                  </div>

                  {/* Status */}
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLE[rx.status] || STATUS_STYLE.active}`}>
                    {rx.status.charAt(0).toUpperCase() + rx.status.slice(1)}
                  </span>

                  {/* Expand */}
                  <button onClick={() => toggleExpand(rx)} className="text-gray-400 hover:text-gray-600 shrink-0">
                    {isExp ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                  </button>
                </div>

                {/* Expanded */}
                {isExp && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-3">
                    {rx.file_path ? (
                      <>
                        {/* Legacy: issued before prescriptions became digital records */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                          <div><p className="text-xs text-gray-400">Patient Email</p><p className="font-medium text-gray-700 truncate">{rx.patient?.email || '—'}</p></div>
                          <div><p className="text-xs text-gray-400">Issued</p><p className="font-medium text-gray-700">{new Date(rx.issued_at).toLocaleDateString('en-PH')}</p></div>
                          <div><p className="text-xs text-gray-400">Expires</p><p className="font-medium text-gray-700">{new Date(rx.expires_at).toLocaleDateString('en-PH')}</p></div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5"/> Uploaded prescription file (legacy)
                          </p>
                          {fileUrlCache[rx.id]
                            ? <a href={fileUrlCache[rx.id]} target="_blank" rel="noreferrer" download={rx.file_name}
                                className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-doctor-600 hover:border-doctor-300 transition-all">
                                <FileText className="w-4 h-4"/> {rx.file_name || 'View file'}
                              </a>
                            : <p className="text-gray-400 text-xs">Loading file...</p>}
                        </div>
                        {rx.additional_notes && (
                          <div className="bg-yellow-50 rounded-xl p-3 text-xs text-yellow-800">
                            <p className="font-semibold mb-0.5">Doctor's Notes:</p>
                            <p>{rx.additional_notes}</p>
                          </div>
                        )}
                      </>
                    ) : meds === undefined || doctorInfo === null ? (
                      <p className="text-gray-400 text-xs flex items-center gap-1"><Pill className="w-3.5 h-3.5"/> Loading prescription...</p>
                    ) : (
                      <>
                        <PrintControl rx={rx} onUpdated={patchRx}/>
                        <DigitalPrescription
                          mode="doctor"
                          rx={rx}
                          medications={meds}
                          doctor={{ first_name: profile?.first_name, last_name: profile?.last_name, ...doctorInfo }}
                          patient={rx.patient || {}}/>
                      </>
                    )}

                    {/* Actions */}
                    {rx.status === 'active' && (
                      <div className="flex justify-end">
                        <button onClick={() => revoke(rx.id)} disabled={revoking === rx.id}
                          className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-4 py-1.5 rounded-xl transition-all">
                          {revoking === rx.id ? 'Revoking...' : 'Revoke Prescription'}
                        </button>
                      </div>
                    )}
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
