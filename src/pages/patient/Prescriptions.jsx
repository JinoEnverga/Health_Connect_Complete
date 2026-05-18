import React, { useState, useEffect, useRef } from 'react'
import { FileText, Shield, Eye, EyeOff, Download, ChevronDown, ChevronUp, Info } from 'lucide-react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const STATUS_COLORS = {
  active:    'badge-active',
  dispensed: 'bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded-full',
  expired:   'bg-red-100 text-red-700 text-xs font-semibold px-2 py-1 rounded-full',
  revoked:   'bg-gray-100 text-gray-500 text-xs font-semibold px-2 py-1 rounded-full',
}

function RxCard({ rx }) {
  const [expanded,  setExpanded]  = useState(false)
  const [showPin,   setShowPin]   = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [meds,      setMeds]      = useState([])

  const verifyUrl = `${window.location.origin}/verify/rx/${rx.verification_token}`

  useEffect(() => {
    QRCode.toDataURL(verifyUrl, { width: 200, margin: 2, color: { dark: '#1e40af', light: '#ffffff' } })
      .then(setQrDataUrl)
  }, [rx.verification_token])

  useEffect(() => {
    if (expanded && meds.length === 0) {
      supabase.from('prescription_medications')
        .select('*').eq('prescription_id', rx.id).order('sort_order')
        .then(({ data }) => setMeds(data || []))
    }
  }, [expanded])

  function downloadQR() {
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `prescription-${rx.id.slice(0,8)}.png`
    a.click()
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

      {/* QR + PIN Row */}
      <div className="bg-gradient-to-r from-patient-50 to-blue-50 rounded-xl p-4 mb-3 flex gap-4 items-center">
        {/* QR Code */}
        <div className="shrink-0">
          {qrDataUrl
            ? <img src={qrDataUrl} className="w-24 h-24 rounded-lg border-2 border-white shadow-sm" alt="QR Code"/>
            : <div className="w-24 h-24 bg-gray-200 animate-pulse rounded-lg"/>
          }
          <button onClick={downloadQR}
            className="flex items-center gap-1 text-xs text-patient-600 font-medium mt-1.5 hover:underline mx-auto justify-center">
            <Download className="w-3 h-3"/> Save QR
          </button>
        </div>

        {/* PIN */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
            <Shield className="w-3 h-3 text-patient-600"/> Your Verification PIN
          </p>
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              {(rx.verification_pin || '????').split('').map((d, i) => (
                <div key={i}
                  className={`w-9 h-10 rounded-lg border-2 flex items-center justify-center font-bold text-lg
                    ${showPin ? 'bg-white border-patient-400 text-patient-700' : 'bg-gray-200 border-gray-300 text-gray-200'}`}>
                  {showPin ? d : '•'}
                </div>
              ))}
            </div>
            <button onClick={() => setShowPin(!showPin)}
              className="text-gray-400 hover:text-gray-600 p-1">
              {showPin ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            Show QR code to pharmacist. Share PIN verbally when asked.
          </p>
        </div>
      </div>

      {/* How to use info */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 mb-3 text-xs text-blue-700">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0"/>
        <span>Show QR to pharmacist → they scan & enter PIN → they see your full prescription. <strong>Never show PIN to anyone else.</strong></span>
      </div>

      {/* Expand medications */}
      <button onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-semibold text-patient-600 hover:text-patient-700 transition-colors">
        {expanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
        {expanded ? 'Hide' : 'View'} Medications
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {meds.length === 0
            ? <p className="text-gray-400 text-sm">Loading medications...</p>
            : meds.map((m, i) => (
              <div key={m.id} className="bg-gray-50 rounded-xl p-3">
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
          {rx.additional_notes && (
            <div className="bg-yellow-50 rounded-xl p-3 text-xs text-yellow-800">
              <p className="font-semibold mb-0.5">Doctor's Notes:</p>
              <p>{rx.additional_notes}</p>
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
          <strong>How to use:</strong> Select a prescription, show the QR code to the pharmacist, and share your 4-digit PIN when asked.
          Your medical details are never stored in the QR code.
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
