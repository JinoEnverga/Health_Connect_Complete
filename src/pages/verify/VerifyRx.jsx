import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Shield, CheckCircle, AlertTriangle, Lock, Pill, User, Building2, IdCard, Clock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function VerifyRx() {
  const { token } = useParams()

  const [stage,  setStage]  = useState('enter_code') // 'enter_code' | 'verified' | 'error' | 'loading' | 'invalid'
  const [code,   setCode]   = useState(['', '', '', ''])
  const [result, setResult] = useState(null)
  const [error,  setError]  = useState('')
  const [checking, setChecking] = useState(false)
  const [showCode, setShowCode] = useState(false)

  // Client-side cooldown as a UX nicety only. The Supabase anon key is
  // public in the JS bundle, so this RPC can be called directly over HTTP —
  // the throttling that actually matters is enforced inside the
  // verify_prescription function itself (see supabase/sql/).
  const [cooldownUntil, setCooldownUntil] = useState(null)
  const isCoolingDown = cooldownUntil !== null && cooldownUntil > Date.now()

  // Check token validity on load
  useEffect(() => {
    async function checkToken() {
      const { data, error } = await supabase
        .from('prescriptions')
        .select('id, status, expires_at, dispensed_at')
        .eq('verification_token', token)
        .single()

      if (error || !data) { setStage('invalid'); return }
      if (data.status === 'revoked') { setStage('error'); setError('This prescription has been revoked by the doctor.'); return }
      if (data.status === 'expired' || new Date(data.expires_at) < new Date()) { setStage('error'); setError('This prescription has expired.'); return }
      if (data.status === 'dispensed') {
        const when = data.dispensed_at
          ? new Date(data.dispensed_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
          : 'a previous visit'
        setStage('error')
        setError(`This prescription has already been dispensed on ${when}. It cannot be used again.`)
        return
      }
    }
    if (token) checkToken()
  }, [token])

  // Handle birth year input
  function handleCodeInput(i, val) {
    if (!/^\d*$/.test(val)) return
    const next = [...code]
    next[i] = val.slice(-1)
    setCode(next)
    if (val && i < 3) document.getElementById(`code-${i+1}`)?.focus()
  }

  function handleCodeKeyDown(i, e) {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      document.getElementById(`code-${i-1}`)?.focus()
    }
  }

  async function verifyCode() {
    if (isCoolingDown) return
    const fullCode = code.join('')
    if (fullCode.length < 4) { setError('Please enter all 4 digits.'); return }
    setChecking(true); setError('')

    const { data, error: rpcError } = await supabase
      .rpc('verify_prescription', { p_token: token, p_birth_year: fullCode })

    setChecking(false)

    if (rpcError) { setError('Verification failed. Please try again.'); return }

    if (!data.success) {
      setError(data.error || "That birth year doesn't match our records for this patient.")
      setCode(['', '', '', ''])
      // Local, best-effort cooldown on top of the server-side lockout.
      setCooldownUntil(Date.now() + 5_000)
      return
    }

    setResult(data)
    setStage('verified')
  }

  // ── INVALID TOKEN ──────────────────────────────────────────
  if (stage === 'invalid') return (
    <Page>
      <div className="flex flex-col items-center text-center py-12">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-5">
          <AlertTriangle className="w-10 h-10 text-red-500"/>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Prescription</h2>
        <p className="text-gray-500">This verification link does not correspond to any valid prescription in our system.</p>
      </div>
    </Page>
  )

  // ── ERROR STATE ────────────────────────────────────────────
  if (stage === 'error') return (
    <Page>
      <div className="flex flex-col items-center text-center py-12">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-5">
          <AlertTriangle className="w-10 h-10 text-red-500"/>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Prescription Unavailable</h2>
        <p className="text-gray-500">{error}</p>
      </div>
    </Page>
  )

  // ── VERIFIED STATE ─────────────────────────────────────────
  if (stage === 'verified' && result) {
    const { prescription: rx, doctor: doc, patient: pat } = result

    return (
      <Page>
        {/* Success header */}
        <div className="bg-gradient-to-r from-doctor-700 to-doctor-500 rounded-2xl p-6 text-white mb-5 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle className="w-8 h-8 text-white"/>
          </div>
          <h2 className="text-2xl font-bold">Prescription Verified</h2>
          <p className="text-emerald-100 text-sm mt-1">This is an authentic HealthConnect prescription</p>
          <div className="flex items-center justify-center gap-1.5 mt-3">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/>
            <span className="text-xs font-semibold">VERIFIED</span>
          </div>
        </div>

        {/* Doctor credentials — shown ONLY after PIN verification */}
        <div className="card mb-4 border-2 border-doctor-100">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <IdCard className="w-4 h-4 text-doctor-600"/> Prescribing Doctor
          </h3>
          <div className="space-y-2.5">
            <Row icon={User}      label="Doctor"          value={`Dr. ${doc.full_name}`}/>
            <Row icon={Building2} label="Specialization"  value={doc.specialization}/>
            <Row icon={IdCard}    label="License Number"  value={doc.license_number} highlight/>
            <Row icon={Building2} label="Clinic"          value={doc.clinic_name || '—'}/>
            {doc.clinic_address && <Row icon={Building2}  label="Address"   value={doc.clinic_address}/>}
            {doc.clinic_phone   && <Row icon={Building2}  label="Phone"     value={doc.clinic_phone}/>}
          </div>
        </div>

        {/* Patient */}
        <div className="card mb-4">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-patient-600"/> Patient
          </h3>
          <div className="space-y-2.5">
            <Row icon={User}  label="Name" value={pat.full_name}/>
            {pat.date_of_birth && <Row icon={Clock} label="Date of Birth" value={new Date(pat.date_of_birth).toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })}/>}
          </div>
        </div>

        {/* Prescription details */}
        <div className="card mb-4">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Pill className="w-4 h-4 text-patient-600"/> Prescription Details
          </h3>
          <div className="mb-4">
            <p className="text-xs text-gray-400">Diagnosis</p>
            <p className="font-bold text-gray-800 text-lg">{rx.diagnosis}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div>
              <p className="text-xs text-gray-400">Issued</p>
              <p className="font-medium">{new Date(rx.issued_at).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Expires</p>
              <p className="font-medium">{new Date(rx.expires_at).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' })}</p>
            </div>
          </div>

          {/* Medications */}
          <h4 className="font-bold text-gray-800 mb-2 text-sm flex items-center gap-1.5">
            <Pill className="w-3.5 h-3.5"/> Medications ({rx.medications?.length})
          </h4>
          <div className="space-y-3">
            {rx.medications?.map((m, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-gray-900">{m.medicine_name}</p>
                  <span className="text-xs bg-doctor-100 text-doctor-700 px-2 py-0.5 rounded-full font-semibold">{m.dosage}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 text-xs text-gray-500">
                  <span>🕐 {m.frequency}</span>
                  <span>📅 {m.duration}</span>
                  {m.quantity && <span>📦 Qty: {m.quantity}</span>}
                </div>
                {m.special_instructions && (
                  <p className="text-xs text-orange-700 bg-orange-50 rounded-lg px-2 py-1 mt-1.5">⚠️ {m.special_instructions}</p>
                )}
              </div>
            ))}
          </div>

          {rx.additional_notes && (
            <div className="mt-3 bg-yellow-50 rounded-xl p-3 text-xs text-yellow-800">
              <p className="font-semibold mb-0.5">Doctor's Notes:</p>
              <p>{rx.additional_notes}</p>
            </div>
          )}
        </div>

        {/* Footer stamp */}
        <div className="text-center text-xs text-gray-400 border-t border-gray-100 pt-4">
          <p className="font-semibold text-gray-600">✓ Verified & Dispensed via HealthConnect Secure Prescription System</p>
          <p className="mt-0.5">Dispensed at {new Date().toLocaleString('en-PH')}</p>
          <p className="mt-1 text-orange-500 font-semibold">This prescription is now marked as dispensed and cannot be reused.</p>
        </div>
      </Page>
    )
  }

  // ── ENTER PIN STATE (default) ──────────────────────────────
  return (
    <Page>
      {/* Lock icon */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-patient-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="w-10 h-10 text-patient-600"/>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Verify Prescription</h2>
        <p className="text-gray-500 text-sm mt-2">
          Ask the patient for their birth year, then enter it below to reveal the full prescription.
        </p>
      </div>

      {/* Birth year input */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-3 text-center flex items-center justify-center gap-2">
          <Lock className="w-4 h-4"/> Enter Patient's Birth Year
        </label>
        <div className="flex gap-3 justify-center mb-2">
          {code.map((d, i) => (
            <input
              key={i} id={`code-${i}`}
              type={showCode ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={1}
              disabled={isCoolingDown}
              value={d}
              onChange={e => handleCodeInput(i, e.target.value)}
              onKeyDown={e => handleCodeKeyDown(i, e)}
              className="w-14 h-16 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:border-patient-600 transition-all text-gray-900 disabled:opacity-50"
              style={{ borderColor: d ? '#2563eb' : '#e5e7eb' }}
            />
          ))}
        </div>
        <button onClick={() => setShowCode(!showCode)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mx-auto">
          {showCode ? <EyeOff className="w-3 h-3"/> : <Eye className="w-3 h-3"/>}
          {showCode ? 'Hide' : 'Show'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4 text-center">
          {error}
        </div>
      )}

      <button onClick={verifyCode} disabled={checking || isCoolingDown || code.join('').length < 4}
        className="w-full bg-patient-600 hover:bg-patient-700 disabled:opacity-40 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 text-base">
        {checking
          ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
          : <><Shield className="w-5 h-5"/> Verify Prescription</>
        }
      </button>

      <p className="text-center text-xs text-gray-400 mt-4">
        This verification is logged for security. For use by licensed pharmacists only.
      </p>
    </Page>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function Page({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-patient-50 via-white to-emerald-50 flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-white rounded-2xl px-4 py-2 shadow-sm border border-gray-100 mb-4">
            <div className="w-7 h-7 bg-patient-600 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
            </div>
            <span className="font-bold text-gray-800">HealthConnect</span>
          </div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Secure Prescription Verification Portal</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}

function Row({ icon: Icon, label, value, highlight }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-gray-500"/>
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`font-semibold text-sm ${highlight ? 'text-doctor-700 font-bold text-base' : 'text-gray-800'}`}>{value}</p>
      </div>
    </div>
  )
}
