import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { History, Search, Heart, AlertCircle, Pill, Thermometer, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function BHWMedicalHistory() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const [patients, setPatients]   = useState([])
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState(state?.patientId ? { id: state.patientId, name: state.patientName } : null)
  const [patientData, setPatientData] = useState(null)
  const [vitals, setVitals]       = useState([])
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    supabase.from('patient_profiles')
      .select('user_id, city, blood_type, medical_history, allergies, current_medications, profiles(first_name, last_name)')
      .then(({ data }) => setPatients(data || []))
  }, [])

  useEffect(() => {
    if (selected) loadPatient(selected.id)
  }, [selected])

  async function loadPatient(id) {
    setLoading(true)
    const [profRes, vitalsRes] = await Promise.all([
      supabase.from('patient_profiles')
        .select('*, profiles(first_name, last_name, email, phone, date_of_birth, gender)')
        .eq('user_id', id).single(),
      supabase.from('vitals')
        .select('*').eq('patient_id', id)
        .order('measured_at', { ascending: false }).limit(10),
    ])
    setPatientData(profRes.data)
    setVitals(vitalsRes.data || [])
    setLoading(false)
  }

  const filtered = patients.filter(p => {
    const name = `${p.profiles?.first_name} ${p.profiles?.last_name}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Medical History</h1>
          <p className="text-sm text-gray-500">View patient health records</p>
        </div>
      </div>

      {!selected ? (
        <div className="card space-y-3">
          <p className="font-semibold text-gray-800">Select Patient</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
            <input type="text" placeholder="Search patient..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="input pl-9"/>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {filtered.map(p => {
              const name = `${p.profiles?.first_name} ${p.profiles?.last_name}`
              const initials = [p.profiles?.first_name?.[0], p.profiles?.last_name?.[0]].filter(Boolean).join('').toUpperCase()
              return (
                <button key={p.user_id}
                  onClick={() => setSelected({ id: p.user_id, name })}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-purple-50 text-left">
                  <div className="w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-bold text-sm shrink-0">
                    {initials}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{name}</p>
                    {p.blood_type && <p className="text-xs text-red-600">Blood: {p.blood_type}</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between bg-purple-50 border border-purple-100 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-purple-600"/>
              <span className="font-semibold text-purple-800 text-sm">{selected.name}</span>
            </div>
            <button onClick={() => { setSelected(null); setPatientData(null); setVitals([]) }}
              className="text-xs text-purple-600 hover:underline">Change</button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="card animate-pulse h-24 bg-gray-50"/>)}
            </div>
          ) : patientData && (
            <div className="space-y-4">
              {/* Profile overview */}
              <div className="card space-y-3">
                <p className="font-semibold text-gray-800">Patient Profile</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {[
                    { label: 'Blood Type', value: patientData.blood_type, color: 'text-red-600' },
                    { label: 'Gender',     value: patientData.profiles?.gender },
                    { label: 'DOB',        value: patientData.profiles?.date_of_birth },
                    { label: 'City',       value: patientData.city },
                    { label: 'Province',   value: patientData.province },
                    { label: 'Phone',      value: patientData.profiles?.phone },
                  ].map(({ label, value, color }) => value ? (
                    <div key={label}>
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`font-medium ${color || 'text-gray-900'}`}>{value}</p>
                    </div>
                  ) : null)}
                </div>
              </div>

              {/* Medical conditions */}
              {(patientData.medical_history || patientData.allergies?.length || patientData.current_medications?.length) && (
                <div className="card space-y-4">
                  <p className="font-semibold text-gray-800">Medical Background</p>
                  {patientData.medical_history && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Heart className="w-3.5 h-3.5 text-orange-500"/>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Medical History</p>
                      </div>
                      <p className="text-sm text-gray-700">{patientData.medical_history}</p>
                    </div>
                  )}
                  {patientData.allergies?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500"/>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Allergies</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {patientData.allergies.map((a, i) => (
                          <span key={i} className="bg-red-50 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full">{a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {patientData.current_medications?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Pill className="w-3.5 h-3.5 text-blue-500"/>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Medications</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {patientData.current_medications.map((m, i) => (
                          <span key={i} className="bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Vitals history */}
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Thermometer className="w-4 h-4 text-bhw-600"/>
                  <p className="font-semibold text-gray-800">Recent Vitals</p>
                </div>
                {vitals.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No vitals recorded yet</p>
                ) : (
                  <div className="space-y-3">
                    {vitals.map(v => (
                      <div key={v.id} className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs text-gray-400 mb-2">{new Date(v.measured_at).toLocaleString()}</p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {v.temperature && <div><p className="text-xs text-gray-400">Temp</p><p className="text-sm font-semibold">{v.temperature}°C</p></div>}
                          {v.oxygen_level && <div><p className="text-xs text-gray-400">SpO2</p><p className="text-sm font-semibold">{v.oxygen_level}%</p></div>}
                          {v.heart_rate && <div><p className="text-xs text-gray-400">HR</p><p className="text-sm font-semibold">{v.heart_rate} bpm</p></div>}
                          {v.systolic_bp && <div><p className="text-xs text-gray-400">BP</p><p className="text-sm font-semibold">{v.systolic_bp}/{v.diastolic_bp}</p></div>}
                        </div>
                        {v.notes && <p className="text-xs text-gray-500 mt-2 italic">"{v.notes}"</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
