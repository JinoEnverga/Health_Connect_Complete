import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, FileText, Plus, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Pill, Printer,
  RotateCcw, CheckCircle2, Repeat, Ban,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import DigitalPrescription from '../../components/shared/DigitalPrescription'
import { formatDateTime } from '../../lib/queue'

const STATUS_STYLE = {
  active:    'bg-green-100 text-green-700',
  dispensed: 'bg-blue-100 text-blue-700',
  expired:   'bg-red-100 text-red-700',
  revoked:   'bg-gray-100 text-gray-500',
}

const PAGE_SIZE = 8

const TABS = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'Active' },
  { key: 'dispensed', label: 'Dispensed' },
]

const RX_SELECT = `*, patient:patient_id(first_name, last_name, email),
  prescription_medications(medicine_name, dosage, frequency, duration, quantity, refills_allowed, special_instructions, sort_order)`

const fmtStamp = ts => new Date(ts).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
const fmtDay = ts => new Date(ts).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
const medsOf = rx => [...(rx.prescription_medications || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
const patName = r => r.patient ? `${r.patient.first_name || ''} ${r.patient.last_name || ''}`.trim() || 'Patient' : 'Patient'
const patInitials = r => [r.patient?.first_name?.[0], r.patient?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'P'
const isExpired = rx => rx.status === 'active' && rx.expires_at && new Date(rx.expires_at) < new Date()

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

  const used = rx.print_count ?? 0, allowed = rx.max_prints ?? 1
  const canAuthorize = rx.status === 'active' && !isExpired(rx) && used >= allowed

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
            placeholder="e.g. Patient's printer jammed and the copy was unusable" className="input-doctor text-sm"/>
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

/** "Amoxicillin 500 mg · 1 capsule" + "+1 more" — the row's medication preview. */
function MedPreview({ rx }) {
  const meds = medsOf(rx)
  if (rx.file_path && meds.length === 0) {
    return <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">Uploaded file (legacy)</span>
  }
  if (meds.length === 0) return <span className="text-xs text-gray-400">No medications</span>
  const first = meds[0]
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Pill className="w-3.5 h-3.5 text-doctor-600 shrink-0"/>
      <span className="text-sm text-gray-700 truncate">
        <span className="font-medium">{first.medicine_name}</span>
        {first.dosage ? <span className="text-gray-500"> · {first.dosage}</span> : null}
      </span>
      {meds.length > 1 && (
        <span className="text-[11px] font-semibold bg-doctor-50 text-doctor-700 px-1.5 py-0.5 rounded-md shrink-0">+{meds.length - 1} more</span>
      )}
    </div>
  )
}

/** "Mark as Dispensed" form: who dispensed it and an optional note. */
function DispenseForm({ rx, onDone, onCancel }) {
  const [by, setBy]         = useState('')
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  async function submit(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    const { data, error } = await supabase.from('prescriptions')
      .update({
        status: 'dispensed', dispensed_at: new Date().toISOString(),
        dispensed_by_name: by.trim() || null, dispense_notes: note.trim() || null,
      })
      .eq('id', rx.id).eq('status', 'active')
      .select('*').maybeSingle()
    setSaving(false)
    if (error) { setErr(`Could not mark as dispensed: ${error.message}`); return }
    if (!data) { setErr('This prescription is no longer active.'); return }
    onDone(data)
  }

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <p className="text-sm font-semibold text-gray-800">Mark as dispensed</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={by} onChange={e => setBy(e.target.value)} maxLength={120}
          placeholder="Dispensed by (pharmacy / pharmacist)" className="input-doctor text-sm py-2"/>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={500}
          placeholder="Note (optional)" className="input-doctor text-sm py-2"/>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-outline text-xs px-3 py-1.5">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary-doctor text-xs px-3 py-1.5 disabled:opacity-50">
          <CheckCircle2 className="w-3.5 h-3.5"/> {saving ? 'Saving...' : 'Confirm dispensed'}
        </button>
      </div>
    </form>
  )
}

/** Expanded details for one prescription: medications, notes, print status, actions. */
function RxDrawer({ rx, doctor, onUpdated, onRenew }) {
  const docRef = useRef(null)
  const [fileUrl, setFileUrl]       = useState(null)
  const [dispensing, setDispensing] = useState(false)
  const [revoking, setRevoking]     = useState(false)
  const [err, setErr]               = useState('')
  const meds = medsOf(rx)
  const isLegacyFile = rx.file_path && meds.length === 0

  useEffect(() => {
    if (!rx.file_path) return
    supabase.storage.from('prescription-files').createSignedUrl(rx.file_path, 120)
      .then(({ data }) => setFileUrl(data?.signedUrl || null))
  }, [rx.file_path])

  async function revoke() {
    if (!window.confirm('Revoke this prescription? The patient will no longer be able to use it.')) return
    setRevoking(true); setErr('')
    const { error } = await supabase.from('prescriptions').update({ status: 'revoked' }).eq('id', rx.id)
    setRevoking(false)
    if (error) setErr(`Could not revoke the prescription: ${error.message}`)
    else onUpdated(rx.id, { status: 'revoked' })
  }

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-4 sm:px-5 py-4 space-y-3">
      {/* Summary line */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
        <span>Issued {formatDateTime(rx.issued_at)}</span>
        <span className={isExpired(rx) ? 'text-red-600 font-semibold' : ''}>
          {isExpired(rx) ? 'Expired' : 'Valid until'} {fmtDay(rx.expires_at)}
        </span>
        {rx.patient?.email && <span>{rx.patient.email}</span>}
        {rx.status === 'dispensed' && rx.dispensed_at && (
          <span className="text-blue-700">
            Dispensed {formatDateTime(rx.dispensed_at)}{rx.dispensed_by_name ? ` by ${rx.dispensed_by_name}` : ''}
          </span>
        )}
      </div>

      {isLegacyFile ? (
        <div className="bg-white border border-gray-200 rounded-xl p-3 text-sm">
          <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5"/> Uploaded prescription file (issued before digital prescriptions)
          </p>
          {fileUrl
            ? <a href={fileUrl} target="_blank" rel="noreferrer" download={rx.file_name}
                className="inline-flex items-center gap-2 text-doctor-600 font-semibold hover:underline">
                <FileText className="w-4 h-4"/> {rx.file_name || 'View file'}
              </a>
            : <p className="text-gray-400 text-xs">Loading file...</p>}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="font-medium px-3 py-2">Medication</th>
                <th className="font-medium px-3 py-2">Dosage</th>
                <th className="font-medium px-3 py-2">Frequency</th>
                <th className="font-medium px-3 py-2">Duration</th>
                <th className="font-medium px-3 py-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {meds.map((m, i) => (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-900">{m.medicine_name}</p>
                    {m.special_instructions && <p className="text-xs text-gray-500 italic">{m.special_instructions}</p>}
                    {m.refills_allowed > 0 && <p className="text-xs text-gray-400">Refills: {m.refills_allowed}</p>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{m.dosage}</td>
                  <td className="px-3 py-2 text-gray-700">{m.frequency}</td>
                  <td className="px-3 py-2 text-gray-700">{m.duration}</td>
                  <td className="px-3 py-2 text-gray-700 text-right">{m.quantity ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(rx.additional_notes || rx.dispense_notes) && (
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          {rx.additional_notes && (
            <div className="bg-yellow-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-yellow-800 mb-0.5">Doctor&apos;s notes</p>
              <p className="text-yellow-900 whitespace-pre-line">{rx.additional_notes}</p>
            </div>
          )}
          {rx.dispense_notes && (
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-800 mb-0.5">Dispensing note</p>
              <p className="text-blue-900 whitespace-pre-line">{rx.dispense_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Patient print lock status + reprint override */}
      {!isLegacyFile && <PrintControl rx={rx} onUpdated={onUpdated}/>}

      {dispensing && (
        <DispenseForm rx={rx}
          onCancel={() => setDispensing(false)}
          onDone={row => { setDispensing(false); onUpdated(rx.id, row) }}/>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!isLegacyFile && (
          <button onClick={() => docRef.current?.printFileCopy()} className="btn-outline text-xs px-3 py-1.5"
            title="Doctor's file copy — marked not valid for dispensing">
            <Printer className="w-3.5 h-3.5"/> Print / PDF
          </button>
        )}
        {rx.status === 'active' && !isExpired(rx) && !dispensing && (
          <button onClick={() => setDispensing(true)} className="btn-outline text-xs px-3 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5"/> Mark as Dispensed
          </button>
        )}
        {!isLegacyFile && (
          <button onClick={() => onRenew(rx)} className="btn-primary-doctor text-xs px-3 py-1.5">
            <Repeat className="w-3.5 h-3.5"/> Renew Rx
          </button>
        )}
        {rx.status === 'active' && (
          <button onClick={revoke} disabled={revoking}
            className="ml-auto text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-xl flex items-center gap-1.5 disabled:opacity-50">
            <Ban className="w-3.5 h-3.5"/> {revoking ? 'Revoking...' : 'Revoke'}
          </button>
        )}
      </div>

      {/* The printable document, kept off-screen; Print / PDF prints it. */}
      {!isLegacyFile && (
        <div className="hidden">
          <DigitalPrescription ref={docRef} mode="doctor" rx={rx} medications={meds} doctor={doctor} patient={rx.patient || {}}/>
        </div>
      )}
    </div>
  )
}

export default function AllPrescriptions() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [rxList,    setRxList]    = useState([])
  const [search,    setSearch]    = useState('')
  const [tab,       setTab]       = useState('all')
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState('')
  const [expanded,  setExpanded]  = useState(null)
  const [doctorInfo, setDoctorInfo] = useState({}) // letterhead for the Rx document

  useEffect(() => { if (user) load() }, [user])

  useEffect(() => {
    if (!user) return
    supabase.from('doctor_profiles')
      .select('specialization, license_number, clinic_name, clinic_address, clinic_phone')
      .eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setDoctorInfo(data || {}))
  }, [user])

  // Follow print counters / status live (patient prints, changes elsewhere).
  useEffect(() => {
    if (!user) return
    const channel = supabase.channel(`rx-doctor-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'prescriptions', filter: `doctor_id=eq.${user.id}` },
        ({ new: row }) => patchRx(row.id, row))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  function patchRx(id, fields) {
    setRxList(list => list.map(r => r.id === id
      ? { ...r, ...fields, patient: r.patient, prescription_medications: r.prescription_medications }
      : r))
  }

  async function load() {
    setLoading(true); setLoadError('')
    const { data, error } = await supabase
      .from('prescriptions')
      .select(RX_SELECT)
      .eq('doctor_id', user.id)
      .order('issued_at', { ascending: false })
    if (error) setLoadError(`Could not load prescriptions: ${error.message}`)
    setRxList(data || [])
    setLoading(false)
  }

  // Renew: open Issue Prescription pre-filled with this patient, diagnosis and medications.
  function renew(rx) {
    navigate('/doctor/prescribe', {
      state: {
        patientId: rx.patient_id,
        patientEmail: rx.patient?.email,
        renew: {
          diagnosis: rx.diagnosis,
          notes: rx.additional_notes,
          medications: medsOf(rx).map(m => ({
            medicine_name: m.medicine_name, dosage: m.dosage, frequency: m.frequency, duration: m.duration,
            quantity: m.quantity ?? '', refills_allowed: m.refills_allowed ?? 0, special_instructions: m.special_instructions || '',
          })),
        },
      },
    })
  }

  const counts = useMemo(() => ({
    all: rxList.length,
    active: rxList.filter(r => r.status === 'active').length,
    dispensed: rxList.filter(r => r.status === 'dispensed').length,
  }), [rxList])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rxList.filter(r => {
      if (tab !== 'all' && r.status !== tab) return false
      if (!q) return true
      const meds = medsOf(r).map(m => m.medicine_name).join(' ').toLowerCase()
      return patName(r).toLowerCase().includes(q) || r.diagnosis?.toLowerCase().includes(q)
        || r.patient?.email?.toLowerCase().includes(q) || meds.includes(q)
    })
  }, [rxList, tab, search])

  useEffect(() => { setPage(0); setExpanded(null) }, [tab, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current   = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const doctor    = { first_name: profile?.first_name, last_name: profile?.last_name, ...doctorInfo }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Prescriptions</h1>
          <p className="text-gray-500 text-sm mt-1">Every prescription you have issued</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-outline" aria-label="Refresh"><RefreshCw className="w-4 h-4"/></button>
          <button onClick={() => navigate('/doctor/prescribe')} className="btn-primary-doctor px-5 py-2.5 text-sm">
            <Plus className="w-4 h-4"/> New Rx
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{loadError}</div>
      )}

      {/* Search + status tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
          <input placeholder="Search by patient, diagnosis or medication..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="input-doctor pl-10"/>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
              <span className={`text-[11px] px-1.5 rounded-full ${tab === t.key ? 'bg-doctor-50 text-doctor-700' : 'bg-gray-200 text-gray-500'}`}>{counts[t.key]}</span>
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
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <FileText className="w-12 h-12 text-gray-200 mb-3"/>
            <p className="font-semibold text-gray-500">
              {rxList.length === 0 ? 'No prescriptions yet' : 'No prescriptions match'}
            </p>
            {rxList.length === 0 && (
              <button onClick={() => navigate('/doctor/prescribe')} className="btn-primary-doctor mt-4 px-6 py-2.5 text-sm">
                Issue First Prescription
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pageItems.map(rx => {
              const isExp = expanded === rx.id
              const status = isExpired(rx) ? 'expired' : rx.status
              return (
                <div key={rx.id}>
                  <button onClick={() => setExpanded(isExp ? null : rx.id)} aria-expanded={isExp}
                    className={`w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 text-left transition-colors ${isExp ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <div className="w-9 h-9 bg-doctor-100 rounded-full flex items-center justify-center text-doctor-700 font-bold text-xs shrink-0">
                      {patInitials(rx)}
                    </div>
                    <div className="w-40 sm:w-52 min-w-0 shrink-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{patName(rx)}</p>
                      <p className="text-xs text-gray-500 truncate">{rx.diagnosis || '—'} · {fmtDay(rx.issued_at)}</p>
                    </div>
                    <div className="flex-1 min-w-0 hidden md:block">
                      <MedPreview rx={rx}/>
                    </div>
                    <span className={`ml-auto md:ml-0 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLE[status] || STATUS_STYLE.active}`}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExp ? 'rotate-180' : ''}`}/>
                  </button>
                  {isExp && <RxDrawer rx={rx} doctor={doctor} onUpdated={patchRx} onRenew={renew}/>}
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
