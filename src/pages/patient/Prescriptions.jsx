import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Lock, ChevronDown, ChevronLeft, ChevronRight, Info, Download, Search, X, BadgeCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import DigitalPrescription from '../../components/shared/DigitalPrescription'

const STATUS_COLORS = {
  active:    'badge-active',
  dispensed: 'bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full',
  expired:   'bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-1 rounded-full',
  revoked:   'bg-gray-100 text-gray-500 text-xs font-semibold px-2 py-1 rounded-full',
}

// Client-side cooldown only — a fat-finger deterrent, not the real access
// boundary. The real boundary is Supabase Storage RLS on the patient's own
// folder (see supabase/sql/004_prescription_file_upload.sql) — this check
// just confirms it's really you before handing over a download link.
const PAGE_SIZE = 6
const TABS = ['all', 'active', 'dispensed', 'expired']
const HOWTO_KEY = 'hc-rx-howto-collapsed'

const fmtDay = ts => ts
  ? new Date(ts).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
  : '—'
const isPastDue = rx => !!rx.expires_at && new Date(rx.expires_at) < new Date()
// An active prescription past its expiry date shows as Expired.
const displayStatus = rx => (rx.status === 'active' && isPastDue(rx)) ? 'expired' : rx.status
const conditionOf = rx => {
  const d = (rx.diagnosis || '').trim()
  return !d || /^n\/?a$/i.test(d) ? 'General Prescription' : d
}
const doctorNameOf = rx => rx.doctor ? `Dr. ${rx.doctor.first_name || ''} ${rx.doctor.last_name || ''}`.trim() : 'Your doctor'

const MAX_ATTEMPTS = 5
const COOLDOWN_MS  = 30_000
const SIGNED_URL_SECONDS = 120

function RxCard({ rx, patient, onPrinted }) {
  const [expanded, setExpanded] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [details,  setDetails]  = useState(null) // { additional_notes, file_path, file_name, file_type, medications, downloadUrl }
  const [code,     setCode]     = useState('')
  const [checking, setChecking] = useState(false)
  const [error,    setError]    = useState('')
  const [attempts, setAttempts] = useState(0)
  const [locked,   setLocked]   = useState(false)
  const [needsBirthYear, setNeedsBirthYear] = useState(false)
  const cooldownTimer = useRef(null)

  useEffect(() => () => clearTimeout(cooldownTimer.current), [])

  async function checkCode(value) {
    setChecking(true); setError('')
    const { data, error: rpcError } = await supabase
      .rpc('get_own_prescription_details', { p_prescription_id: rx.id, p_birth_year: value })

    if (rpcError || !data) { setChecking(false); setError('Something went wrong. Please try again.'); setCode(''); return }

    if (!data.success) {
      setChecking(false)
      setCode('')
      // Not the patient's fault, and no birth year they could possibly
      // enter would fix it — don't burn an attempt or lock them out.
      if (data.code === 'no_birth_year_set') { setNeedsBirthYear(true); return }
      const next = attempts + 1
      setAttempts(next)
      if (next >= MAX_ATTEMPTS) {
        setLocked(true)
        setError(`Too many incorrect attempts. Try again in ${COOLDOWN_MS / 1000}s.`)
        cooldownTimer.current = setTimeout(() => { setLocked(false); setAttempts(0) }, COOLDOWN_MS)
      } else {
        setError(data.error || "That birth year doesn't match.")
      }
      return
    }

    // Pharmacist-marked page (Pharmacy Mode on the mobile app) wins over
    // everything else: never show the clean page of a dispensed prescription.
    let markedUrl = null
    if (rx.annotated_image_url) {
      const { data: signed } = await supabase.storage
        .from('prescriptions')
        .createSignedUrl(rx.annotated_image_url, SIGNED_URL_SECONDS)
      markedUrl = signed?.signedUrl || null
    }

    let downloadUrl = null
    if (data.prescription.file_path && !rx.annotated_image_url) {
      const { data: signed } = await supabase.storage
        .from('prescription-files')
        .createSignedUrl(data.prescription.file_path, SIGNED_URL_SECONDS)
      downloadUrl = signed?.signedUrl || null
    }

    setChecking(false)
    setDetails({ ...data.prescription, downloadUrl, markedUrl })
    setUnlocked(true)
    setAttempts(0)
  }

  function handleCodeChange(v) {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    setCode(digits)
    if (digits.length === 4 && !locked && !checking) checkCode(digits)
  }

  // Counts the print on the server first (one-time print lock, see
  // 014_prescription_print_lock.sql); throws the server's reason if refused.
  async function officialPrint() {
    const { data, error: rpcError } = await supabase
      .rpc('record_prescription_print', { p_prescription_id: rx.id })
    if (rpcError) throw new Error(rpcError.message)
    onPrinted(rx.id, { print_count: data.copy_number, max_prints: data.max_prints, last_printed_at: data.printed_at })
    return data
  }

  const isImage = details?.file_type?.startsWith('image/')

  const status = displayStatus(rx)

  return (
    <div>
      {/* Row */}
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3">
        <div className="w-9 h-9 bg-patient-100 rounded-xl flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-patient-600"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{conditionOf(rx)}</p>
          <p className="text-xs text-gray-500 truncate">
            {doctorNameOf(rx)} · Issued {fmtDay(rx.issued_at)} ·{' '}
            <span className={status === 'expired' ? 'text-amber-700' : ''}>
              {isPastDue(rx) ? 'Expired' : 'Expires'} {fmtDay(rx.expires_at)}
            </span>
          </p>
        </div>
        <span className={`shrink-0 ${STATUS_COLORS[status] || STATUS_COLORS.active}`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
        <button onClick={() => setExpanded(e => !e)} aria-expanded={expanded}
          className="shrink-0 flex items-center gap-1 text-sm font-semibold text-patient-600 hover:text-patient-700 px-2 py-1 rounded-lg hover:bg-patient-50 transition-colors">
          {expanded ? 'Hide' : 'View'}<span className="hidden sm:inline">&nbsp;Prescription</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
        </button>
      </div>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4">
          {!unlocked ? (
            needsBirthYear ? (
              <div className="bg-amber-50 border-2 border-dashed border-amber-200 rounded-xl p-5 text-center">
                <div className="w-12 h-12 bg-white border border-amber-200 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-5 h-5 text-amber-500"/>
                </div>
                <p className="text-sm font-semibold text-gray-700 mb-1">No birth year on file yet</p>
                <p className="text-xs text-gray-500 mb-4">Add your birth year to your profile, then come back to unlock this.</p>
                <Link to="/profile" className="btn-primary-patient inline-flex px-5 py-2 text-sm">Go to Profile</Link>
              </div>
            ) : (
              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-5 text-center">
                <div className="w-12 h-12 bg-white border border-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-5 h-5 text-gray-400"/>
                </div>
                <p className="text-sm font-semibold text-gray-700 mb-1">This document is locked</p>
                <p className="text-xs text-gray-500 mb-4">Enter your 4-digit Birth Year to unlock it.</p>
                <div className="flex justify-center items-center gap-2">
                  <input
                    inputMode="numeric" maxLength={4} placeholder="YYYY" autoFocus
                    disabled={locked || checking}
                    value={code}
                    onChange={e => handleCodeChange(e.target.value)}
                    className="input text-center w-28 tracking-widest disabled:opacity-50"/>
                  {checking && <div className="w-5 h-5 border-2 border-patient-600 border-t-transparent rounded-full animate-spin"/>}
                </div>
                {error && <p className="text-red-600 text-xs mt-2.5">{error}</p>}
              </div>
            )
          ) : (
            <div className="space-y-3">
              {rx.status === 'dispensed' && (
                <div className="bg-blue-50 border border-blue-100 text-blue-800 rounded-xl px-3 py-2 text-sm flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 shrink-0"/>
                  <span>
                    Dispensed{rx.dispensed_at ? ` on ${fmtDay(rx.dispensed_at)}` : ''}
                    {rx.dispensed_by_name ? ` by ${rx.dispensed_by_name}` : ''}
                    {rx.dispensed_by_license ? ` (PRC ${rx.dispensed_by_license})` : ''}
                  </span>
                </div>
              )}

              {rx.annotated_image_url ? (
                <div className="bg-white border border-gray-200 rounded-xl p-2">
                  <p className="text-xs font-semibold text-gray-600 mb-2 px-1">Pharmacist-marked page (final)</p>
                  {details.markedUrl
                    ? <img src={details.markedUrl} alt="Prescription marked by the pharmacist" className="max-h-[32rem] w-auto max-w-full mx-auto rounded-lg"/>
                    : <p className="text-gray-400 text-xs px-1 pb-1">This page could not be loaded. Please try again.</p>}
                </div>
              ) : (<>
              {details.file_path && (
                <div className="bg-gradient-to-r from-patient-50 to-blue-50 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white border border-patient-200 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-patient-600"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{details.file_name || 'Prescription file'}</p>
                    <p className="text-xs text-gray-500">Photo of your doctor&apos;s prescription</p>
                  </div>
                  {details.downloadUrl
                    ? <a href={details.downloadUrl} download={details.file_name} target="_blank" rel="noreferrer"
                        className="btn-primary-patient px-4 py-2 text-sm shrink-0 flex items-center gap-1.5">
                        <Download className="w-4 h-4"/> Download
                      </a>
                    : <span className="text-xs text-gray-400 shrink-0">Unavailable</span>}
                </div>
              )}

              {isImage && details.downloadUrl && (
                <div className="flex justify-center bg-gray-50 rounded-xl border border-gray-200 p-2">
                  <img src={details.downloadUrl} alt="Prescription"
                    className="max-h-80 w-auto max-w-full object-contain rounded-lg"/>
                </div>
              )}

              {/* Structured digital prescription (all new prescriptions). Older
                  ones that were only an uploaded file show the file above. */}
              {details.medications?.length > 0 && (
                <DigitalPrescription
                  mode="patient"
                  rx={{ ...details, ...rx }}
                  medications={details.medications}
                  doctor={doctorLetterhead(rx.doctor)}
                  patient={patient}
                  onOfficialPrint={officialPrint}/>
              )}

              {details.file_path && details.additional_notes && !(details.medications?.length > 0) && (
                <div className="bg-yellow-50 rounded-xl p-3 text-xs text-yellow-800">
                  <p className="font-semibold mb-0.5">Doctor's Notes:</p>
                  <p>{details.additional_notes}</p>
                </div>
              )}

              {!details.file_path && !(details.medications?.length > 0) && (
                <p className="text-gray-400 text-sm">No medications on record for this prescription.</p>
              )}
              </>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// doctor_profiles is embedded through profiles; PostgREST returns it as an
// object (one-to-one) — accept an array too, to be safe.
function doctorLetterhead(doc) {
  if (!doc) return {}
  const dp = Array.isArray(doc.doctor_profiles) ? doc.doctor_profiles[0] : doc.doctor_profiles
  return { first_name: doc.first_name, last_name: doc.last_name, ...(dp || {}) }
}

export default function Prescriptions() {
  const { user, profile } = useAuth()
  const [rxList,  setRxList]  = useState([])
  const [loading, setLoading] = useState(true)

  // Print counters change through the print lock; follow them live so the
  // button state is the same in every open tab and device.
  useEffect(() => {
    if (!user) return
    const channel = supabase.channel(`rx-prints-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'prescriptions', filter: `patient_id=eq.${user.id}` },
        ({ new: row }) => setRxList(list => list.map(r => r.id === row.id ? { ...r, ...row, doctor: r.doctor } : r)))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  function patchRx(id, fields) {
    setRxList(list => list.map(r => r.id === id ? { ...r, ...fields } : r))
  }

  const [search,  setSearch]  = useState('')
  const [tab,     setTab]     = useState('all')
  const [page,    setPage]    = useState(0)
  const [howtoCollapsed, setHowtoCollapsed] = useState(() => {
    try { return localStorage.getItem(HOWTO_KEY) === '1' } catch { return false }
  })

  function toggleHowto() {
    setHowtoCollapsed(c => {
      try { localStorage.setItem(HOWTO_KEY, c ? '0' : '1') } catch { /* storage unavailable */ }
      return !c
    })
  }

  useEffect(() => {
    if (!user) return
    supabase
      .from('prescriptions')
      .select(`*, doctor:profiles!prescriptions_doctor_id_fkey(first_name, last_name,
        doctor_profiles(specialization, license_number, clinic_name, clinic_address, clinic_phone))`)
      .eq('patient_id', user.id)
      .order('issued_at', { ascending: false })
      .then(({ data }) => { setRxList(data || []); setLoading(false) })
  }, [user])

  const counts = useMemo(() => {
    const c = { all: rxList.length, active: 0, dispensed: 0, expired: 0 }
    rxList.forEach(r => { const st = displayStatus(r); if (st in c) c[st]++ })
    return c
  }, [rxList])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rxList.filter(r => {
      if (tab !== 'all' && displayStatus(r) !== tab) return false
      if (!q) return true
      return conditionOf(r).toLowerCase().includes(q) || doctorNameOf(r).toLowerCase().includes(q)
    })
  }, [rxList, tab, search])

  useEffect(() => { setPage(0) }, [tab, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current   = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">E-Prescriptions</h1>
          <p className="text-gray-500 text-sm mt-1">Secure digital prescriptions from your doctor</p>
        </div>
        <button onClick={toggleHowto} aria-expanded={!howtoCollapsed}
          className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-patient-600 bg-patient-50 hover:bg-patient-100 border border-patient-100 px-3 py-1.5 rounded-xl transition-colors">
          <Info className="w-4 h-4"/> How it works
        </button>
      </div>

      {/* How it works (collapsible; remembered on this device) */}
      {!howtoCollapsed && (
        <div className="bg-patient-50 border border-patient-100 rounded-2xl p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-patient-600 shrink-0 mt-0.5"/>
          <div className="text-sm text-patient-800 space-y-1 flex-1">
            <p><strong>1. Unlock:</strong> tap <em>View Prescription</em> and enter your birth year.</p>
            <p><strong>2. Print:</strong> use <em>Print Official Copy</em> and bring the printed sheet to the pharmacy.
              Official copies have a limited number of prints based on your prescribed refills, so print only when your printer is ready.</p>
            <p><strong>3. Partial purchases:</strong> if you buy only part of your medicine, the pharmacist records it on the
              sheet. Keep it for your next purchase.</p>
          </div>
          <button onClick={toggleHowto} aria-label="Hide how it works"
            className="p-1 rounded-lg text-patient-400 hover:text-patient-700 hover:bg-patient-100 shrink-0">
            <X className="w-4 h-4"/>
          </button>
        </div>
      )}

      {/* Search + status tabs */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by doctor or condition..." className="input pl-10"/>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span className={`text-[11px] px-1.5 rounded-full ${tab === t ? 'bg-patient-50 text-patient-700' : 'bg-gray-200 text-gray-500'}`}>{counts[t]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse bg-gray-50/60"/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4">
            <FileText className="w-12 h-12 text-gray-200 mb-3"/>
            <p className="font-semibold text-gray-500">{rxList.length === 0 ? 'No prescriptions yet' : 'No prescriptions match'}</p>
            {rxList.length === 0 && (
              <p className="text-gray-400 text-sm mt-1">Prescriptions from your doctor will appear here after your consultation</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pageItems.map(rx => <RxCard key={rx.id} rx={rx} patient={profile || {}} onPrinted={patchRx}/>)}
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
