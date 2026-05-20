import React, { useState } from 'react'
import { QrCode, Search, ChevronLeft, CheckCircle, XCircle, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function BHWScanPrescription() {
  const navigate = useNavigate()
  const [token, setToken]     = useState('')
  const [loading, setLoading] = useState(false)
  const [rx, setRx]           = useState(null)
  const [error, setError]     = useState('')

  async function lookup() {
    if (!token.trim()) return
    setLoading(true)
    setError('')
    setRx(null)
    const { data } = await supabase
      .from('prescriptions')
      .select(`
        *,
        profiles!prescriptions_patient_id_fkey(first_name, last_name),
        prescription_medications(medicine_name, dosage, frequency, duration)
      `)
      .eq('verification_token', token.trim())
      .single()
    if (!data) {
      setError('Prescription not found. Check the token and try again.')
    } else {
      setRx(data)
    }
    setLoading(false)
  }

  const statusColor = {
    active:    'text-green-700 bg-green-100',
    expired:   'text-red-700 bg-red-100',
    dispensed: 'text-gray-700 bg-gray-100',
    pending:   'text-yellow-700 bg-yellow-100',
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Scan Prescription</h1>
          <p className="text-sm text-gray-500">Verify a patient's prescription</p>
        </div>
      </div>

      {/* Token input */}
      <div className="card space-y-4">
        <div className="flex flex-col items-center py-4 gap-3">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
            <QrCode className="w-8 h-8 text-blue-500"/>
          </div>
          <p className="text-sm text-gray-500 text-center">
            Enter the prescription verification token<br/>found on the patient's prescription QR code
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter verification token..."
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            className="input flex-1"
          />
          <button onClick={lookup} disabled={loading || !token.trim()}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 font-semibold text-sm disabled:opacity-50 transition-all">
            <Search className="w-4 h-4"/>
            {loading ? '...' : 'Look up'}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            <XCircle className="w-4 h-4 shrink-0"/> {error}
          </div>
        )}
      </div>

      {/* Result */}
      {rx && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500"/>
              <p className="font-semibold text-gray-900">Prescription Found</p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor[rx.status] || 'text-gray-600 bg-gray-100'}`}>
              {rx.status}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-500">Patient</span>
              <span className="font-medium text-gray-900">
                {rx.profiles ? `${rx.profiles.first_name} ${rx.profiles.last_name}` : '—'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-500">Diagnosis</span>
              <span className="font-medium text-gray-900 text-right max-w-[60%]">{rx.diagnosis || '—'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-500">Issued</span>
              <span className="font-medium text-gray-900">
                {rx.issued_at ? new Date(rx.issued_at).toLocaleDateString() : '—'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span className="text-gray-500">Expires</span>
              <span className="font-medium text-gray-900">
                {rx.expires_at ? new Date(rx.expires_at).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>

          {rx.prescription_medications?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5"/> Medications
              </p>
              <div className="space-y-2">
                {rx.prescription_medications.map((m, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl px-4 py-3">
                    <p className="font-semibold text-gray-900 text-sm">{m.medicine_name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{m.dosage} · {m.frequency} · {m.duration}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
