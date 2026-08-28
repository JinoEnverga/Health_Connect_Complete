import React, { useState, useEffect, useRef } from 'react'
import { FileText, Shield, Lock, ChevronDown, ChevronUp, Info, Copy, Check, QrCode, X } from 'lucide-react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const STATUS_COLORS = {
  active:    'badge-active',
  dispensed: 'bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full',
  expired:   'bg-red-100 text-red-700 text-xs font-semibold px-2 py-1 rounded-full',
  revoked:   'bg-gray-100 text-gray-500 text-xs font-semibold px-2 py-1 rounded-full',
}

// Client-side cooldown only — a fat-finger/shoulder-surfing deterrent, not
// the real access boundary (see supabase/sql/003_own_prescription_view.sql
// for why: the patient already owns this data under RLS).
const MAX_ATTEMPTS = 5
const COOLDOWN_MS  = 30_000

// Separate, on-demand panel for handing the link to a pharmacist. Fully
// decoupled from the patient's own unlock state below — sharing it doesn't
// require (or grant) access to the medication details themselves.
function SharePanel({ rx, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied]       = useState(false)
  const verifyUrl = `${window.location.origin}/verify/rx/${rx.verification_token}`

  useEffect(() => {
    QRCode.toDataURL(verifyUrl, { width: 176, margin: 2, color: { dark: '#1e40af', light: '#ffffff' } })
      .then(setQrDataUrl)
  }, [verifyUrl])

  function copyLink() {
    navigator.clipboard?.writeText(verifyUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="bg-gradient-to-r from-patient-50 to-blue-50 rounded-xl p-4 mb-3">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-patient-600"/> For the pharmacist only
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4"/>
        </button>
      </div>
      <div className="flex gap-4 items-center">
        <div className="shrink-0">
          {qrDataUrl
            ? <img src={qrDataUrl} className="w-24 h-24 rounded-lg border-2 border-white shadow-sm" alt="Pharmacist verification code"/>
            : <div className="w-24 h-24 bg-gray-200 animate-pulse rounded-lg"/>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 leading-relaxed mb-2">
            Have the pharmacist scan this, or send them the link. They'll enter your birth year on
            their own screen — this never shows your prescription to you again from here.
          </p>
          <button onClick={copyLink} className="flex items-center gap-1 text-patient-600 text-xs font-semibold hover:underline">
            {copied ? <Check className="w-3.5 h-3.5"/> : <Copy className="w-3.5 h-3.5"/>}
            {copied ? 'Link copied' : 'Copy link instead'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RxCard({ rx }) {
  const [expanded, setExpanded] = useState(false)
  const [sharing,  setSharing]  = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [details,  setDetails]  = useState(null) // { additional_notes, medications }
  const [code,     setCode]     = useState('')
  const [checking, setChecking] = useState(false)
  const [error,    setError]    = useState('')
  const [attempts, setAttempts] = useState(0)
  const [locked,   setLocked]   = useState(false)
  const cooldownTimer = useRef(null)

  useEffect(() => () => clearTimeout(cooldownTimer.current), [])

  async function checkCode(value) {
    setChecking(true); setError('')
    const { data, error: rpcError } = await supabase
      .rpc('get_own_prescription_details', { p_prescription_id: rx.id, p_birth_year: value })
    setChecking(false)

    if (rpcError || !data) { setError('Something went wrong. Please try again.'); setCode(''); return }

    if (!data.success) {
      setCode('')
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

    setDetails(data.prescription)
    setUnlocked(true)
    setAttempts(0)
  }

  function handleCodeChange(v) {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    setCode(digits)
    if (digits.length === 4 && !locked && !checking) checkCode(digits)
  }

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

      {/* Pharmacist handoff — separate from the patient's own unlock below */}
      {sharing
        ? <SharePanel rx={rx} onClose={() => setSharing(false)}/>
        : (
          <button onClick={() => setSharing(true)}
            className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-patient-300 hover:bg-patient-50 text-gray-700 font-semibold text-sm py-2.5 rounded-xl mb-3 transition-all">
            <QrCode className="w-4 h-4 text-patient-600"/> Share with Pharmacist
          </button>
        )
      }

      {/* View Medications — inline unlock, no navigation */}
      <button onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 text-sm font-semibold text-patient-600 hover:text-patient-700 transition-colors">
        {expanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
        {expanded ? 'Hide' : 'View'} Medications
      </button>

      {expanded && (
        <div className="mt-3">
          {!unlocked ? (
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
          ) : (
            <div className="space-y-2">
              {details.medications.length === 0
                ? <p className="text-gray-400 text-sm">No medications listed.</p>
                : details.medications.map((m, i) => (
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
                ))
              }
              {details.additional_notes && (
                <div className="bg-yellow-50 rounded-xl p-3 text-xs text-yellow-800">
                  <p className="font-semibold mb-0.5">Doctor's Notes:</p>
                  <p>{details.additional_notes}</p>
                </div>
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
          <strong>How to use:</strong> Tap "View Medications" and enter your birth year to see your own prescription.
          To have it filled, tap "Share with Pharmacist" instead — they'll confirm your birth year on their own screen.
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
