import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Lock, ChevronDown, ChevronUp, Info, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const STATUS_COLORS = {
  active:    'badge-active',
  dispensed: 'bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full',
  expired:   'bg-red-100 text-red-700 text-xs font-semibold px-2 py-1 rounded-full',
  revoked:   'bg-gray-100 text-gray-500 text-xs font-semibold px-2 py-1 rounded-full',
}

// Client-side cooldown only — a fat-finger deterrent, not the real access
// boundary. The real boundary is Supabase Storage RLS on the patient's own
// folder (see supabase/sql/004_prescription_file_upload.sql) — this check
// just confirms it's really you before handing over a download link.
const MAX_ATTEMPTS = 5
const COOLDOWN_MS  = 30_000
const SIGNED_URL_SECONDS = 120

function RxCard({ rx }) {
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

    let downloadUrl = null
    if (data.prescription.file_path) {
      const { data: signed } = await supabase.storage
        .from('prescription-files')
        .createSignedUrl(data.prescription.file_path, SIGNED_URL_SECONDS)
      downloadUrl = signed?.signedUrl || null
    }

    setChecking(false)
    setDetails({ ...data.prescription, downloadUrl })
    setUnlocked(true)
    setAttempts(0)
  }

  function handleCodeChange(v) {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    setCode(digits)
    if (digits.length === 4 && !locked && !checking) checkCode(digits)
  }

  const isImage = details?.file_type?.startsWith('image/')

  return (
    <div className="card border border-gray-100">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-patient-100 rounded-xl flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-patient-600"/>
          </div>
          <div>
            <p className="font-bold text-gray-900">{rx.diagnosis}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Issued {new Date(rx.issued_at).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })}
            </p>
          </div>
        </div>
        <span className={STATUS_COLORS[rx.status] || STATUS_COLORS.active}>
          {rx.status.charAt(0).toUpperCase() + rx.status.slice(1)}
        </span>
      </div>

      <div className="text-xs text-gray-500 mb-3">
        Expires: <span className="font-medium text-gray-700">{new Date(rx.expires_at).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })}</span>
      </div>

      {/* View Prescription — inline unlock, no navigation */}
      <button onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 text-sm font-semibold text-patient-600 hover:text-patient-700 transition-colors">
        {expanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
        {expanded ? 'Hide' : 'View'} Prescription
      </button>

      {expanded && (
        <div className="mt-3">
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
              {details.file_path && (
                <div className="bg-gradient-to-r from-patient-50 to-blue-50 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white border border-patient-200 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-patient-600"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{details.file_name || 'Prescription file'}</p>
                    <p className="text-xs text-gray-500">Download and bring this to any pharmacy</p>
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
                <img src={details.downloadUrl} alt="Prescription" className="w-full rounded-xl border border-gray-200"/>
              )}

              {/* Legacy prescriptions issued before file upload still show their itemized medications */}
              {details.medications?.length > 0 && (
                <div className="space-y-2">
                  {details.medications.map((m, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-bold text-gray-900 text-sm">{m.medicine_name}</p>
                        <span className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{m.dosage}</span>
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span>🕐 {m.frequency}</span>
                        <span>📅 {m.duration}</span>
                        {m.quantity && <span>📦 Qty: {m.quantity}</span>}
                      </div>
                      {m.special_instructions && (
                        <p className="text-xs text-orange-600 mt-1.5 bg-orange-50 rounded-lg px-2 py-1">
                          ⚠️ {m.special_instructions}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {details.additional_notes && (
                <div className="bg-yellow-50 rounded-xl p-3 text-xs text-yellow-800">
                  <p className="font-semibold mb-0.5">Doctor's Notes:</p>
                  <p>{details.additional_notes}</p>
                </div>
              )}

              {!details.file_path && !(details.medications?.length > 0) && (
                <p className="text-gray-400 text-sm">No file or medications on record for this prescription.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Prescriptions() {
  const { user } = useAuth()
  const [rxList,  setRxList]  = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('prescriptions')
      .select('*')
      .eq('patient_id', user.id)
      .order('issued_at', { ascending: false })
      .then(({ data }) => { setRxList(data || []); setLoading(false) })
  }, [user])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">E-Prescriptions</h1>
        <p className="text-gray-500 text-sm mt-1">Secure digital prescriptions from your doctor</p>
      </div>

      {/* How to use banner */}
      <div className="bg-patient-50 border border-patient-100 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-patient-600 shrink-0 mt-0.5"/>
        <p className="text-sm text-patient-800">
          <strong>How to use:</strong> Tap "View Prescription" and enter your birth year to unlock it, then
          download the file and bring it to any pharmacy.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="card animate-pulse h-40 bg-gray-50"/>)}
        </div>
      ) : rxList.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <FileText className="w-14 h-14 text-gray-200 mb-3"/>
          <p className="font-semibold text-gray-500 text-lg">No prescriptions yet</p>
          <p className="text-gray-400 text-sm mt-1">Prescriptions from your doctor will appear here after your consultation</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rxList.map(rx => <RxCard key={rx.id} rx={rx}/>)}
        </div>
      )}
    </div>
  )
}
