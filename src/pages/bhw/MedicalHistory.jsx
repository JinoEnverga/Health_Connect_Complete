import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Heart, AlertCircle, Pill, Thermometer, ChevronLeft, MousePointerClick, User } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PatientPicker from '../../components/bhw/PatientPicker'
import { usePatients, patientName, patientInitials } from '../../components/bhw/patientUtils'

const fmtWhen = ts => new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtDob = d => d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : ''
const listOf = v => (Array.isArray(v) ? v : v ? [v] : []).filter(x => x && String(x).trim() && String(x).toLowerCase() !== 'n/a')

// Columns of one vitals reading, in display order.
const READING = [
  { key: 'temperature',    label: 'Temp',   fmt: v => `${v}°C` },
  { key: 'oxygen_level',   label: 'SpO₂',   fmt: v => `${v}%` },
  { key: 'systolic_bp',    label: 'BP',     fmt: (v, r) => `${v}/${r.diastolic_bp ?? '—'}` },
  { key: 'heart_rate',     label: 'HR',     fmt: v => `${v} bpm` },
  { key: 'breathing_rate', label: 'RR',     fmt: v => `${v}/min` },
  { key: 'weight',         label: 'Weight', fmt: v => `${v} kg` },
  { key: 'height',         label: 'Height', fmt: v => `${v} cm` },
]

export default function BHWMedicalHistory() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const { patients, loading: listLoading } = usePatients()
  const [selectedId, setSelectedId]   = useState(state?.patientId || null)
  const [patientData, setPatientData] = useState(null)
  const [vitals, setVitals]           = useState([])
  const [loading, setLoading]         = useState(false)

  useEffect(() => { if (selectedId) loadPatient(selectedId) }, [selectedId])

  async function loadPatient(id) {
    setLoading(true)
    const [profRes, vitalsRes] = await Promise.all([
      supabase.from('patient_profiles')
        .select('*, profiles(first_name, last_name, email, phone, date_of_birth, gender)')
        .eq('user_id', id).single(),
      supabase.from('vitals')
        .select('*').eq('patient_id', id)
        .order('measured_at', { ascending: false }).limit(20),
    ])
    setPatientData(profRes.data)
    setVitals(vitalsRes.data || [])
    setLoading(false)
  }

  const prof = patientData?.profiles
  const name = prof ? patientName(prof) : (state?.patientName || 'Patient')
  const allergies   = listOf(patientData?.allergies)
  const medications = listOf(patientData?.current_medications)
  const history     = patientData?.medical_history && patientData.medical_history.trim().toLowerCase() !== 'n/a' ? patientData.medical_history : ''

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100" aria-label="Back">
          <ChevronLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Medical History</h1>
          <p className="text-sm text-gray-500">View patient health records</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4">
          <PatientPicker patients={patients} loading={listLoading} selectedId={selectedId} onSelect={p => setSelectedId(p.user_id)}/>
        </div>

        <div className="lg:col-span-8 space-y-4">
          {!selectedId ? (
            <div className="bg-white rounded-2xl shadow-sm border border-dashed border-gray-200 flex flex-col items-center justify-center text-center py-20 px-6">
              <MousePointerClick className="w-10 h-10 text-gray-300 mb-3"/>
              <p className="font-semibold text-gray-600">Select a patient on the left to begin</p>
              <p className="text-sm text-gray-400 mt-1">Their health details and vitals history will appear here.</p>
            </div>
          ) : loading || !patientData ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-100 animate-pulse h-24"/>)}</div>
          ) : (
            <>
              {/* Profile overview */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 bg-bhw-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                    {patientInitials(prof)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{name}</p>
                    <p className="text-xs text-gray-500 truncate">{prof?.email || '—'}</p>
                  </div>
                  <button onClick={() => navigate('/bhw/record-vitals', { state: { patientId: selectedId, patientName: name } })}
                    className="text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0">
                    <Heart className="w-3.5 h-3.5"/> Record Vitals
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {[
                    { label: 'Blood Type', value: patientData.blood_type, color: 'text-red-600' },
                    { label: 'Gender',     value: prof?.gender },
                    { label: 'Date of Birth', value: fmtDob(prof?.date_of_birth) || (patientData.birth_year ? `Born ${patientData.birth_year}` : '') },
                    { label: 'Barangay',   value: patientData.city },
                    { label: 'Province',   value: patientData.province },
                    { label: 'Phone',      value: prof?.phone },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`font-medium ${label === 'Gender' ? 'capitalize ' : ''}${value ? (color || 'text-gray-900') : 'text-gray-300'}`}>{value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Medical background */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
                <p className="font-semibold text-gray-800 flex items-center gap-2"><User className="w-4 h-4 text-bhw-600"/> Medical Background</p>
                <div className="grid sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-1"><Heart className="w-3.5 h-3.5 text-orange-500"/> History</p>
                    <p className={history ? 'text-gray-700' : 'text-gray-300'}>{history || 'None recorded'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-1"><AlertCircle className="w-3.5 h-3.5 text-red-500"/> Allergies</p>
                    {allergies.length ? (
                      <div className="flex flex-wrap gap-1.5">{allergies.map((a, i) => <span key={i} className="bg-red-50 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">{a}</span>)}</div>
                    ) : <p className="text-gray-300">None recorded</p>}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1 mb-1"><Pill className="w-3.5 h-3.5 text-blue-500"/> Medications</p>
                    {medications.length ? (
                      <div className="flex flex-wrap gap-1.5">{medications.map((m, i) => <span key={i} className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">{m}</span>)}</div>
                    ) : <p className="text-gray-300">None recorded</p>}
                  </div>
                </div>
              </div>

              {/* Vitals history, newest first */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
                  <Thermometer className="w-4 h-4 text-bhw-600"/>
                  <p className="font-semibold text-gray-800">Vitals History</p>
                  <span className="text-xs font-semibold bg-bhw-50 text-bhw-700 px-2 py-0.5 rounded-full">{vitals.length}</span>
                </div>
                {vitals.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No vitals recorded yet</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {vitals.map(v => (
                      <div key={v.id} className="px-5 py-3">
                        <p className="text-xs text-gray-400 mb-1.5">{fmtWhen(v.measured_at)}</p>
                        <div className="flex flex-wrap gap-x-5 gap-y-1">
                          {READING.filter(r => v[r.key] != null).map(r => (
                            <div key={r.key} className="text-sm">
                              <span className="text-xs text-gray-400">{r.label} </span>
                              <span className="font-semibold text-gray-800">{r.fmt(v[r.key], v)}</span>
                            </div>
                          ))}
                        </div>
                        {v.notes && <p className="text-xs text-gray-500 mt-1.5 italic">&ldquo;{v.notes}&rdquo;</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
