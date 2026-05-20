import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Heart, Search, CheckCircle, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function BHWRecordVitals() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const [patients, setPatients]     = useState([])
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState(state?.patientId ? { id: state.patientId, name: state.patientName } : null)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [form, setForm] = useState({
    temperature: '', oxygen_level: '', systolic_bp: '', diastolic_bp: '',
    heart_rate: '', breathing_rate: '', weight: '', height: '', notes: '',
  })

  useEffect(() => {
    supabase.from('patient_profiles')
      .select('user_id, city, profiles(first_name, last_name)')
      .then(({ data }) => setPatients(data || []))
  }, [])

  const filteredPatients = patients.filter(p => {
    const name = `${p.profiles?.first_name} ${p.profiles?.last_name}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    const payload = {
      patient_id: selected.id,
      measured_at: new Date().toISOString(),
    }
    Object.entries(form).forEach(([k, v]) => {
      if (v !== '') payload[k] = k === 'notes' ? v : Number(v)
    })
    await supabase.from('vitals').insert(payload)
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); navigate('/bhw/patients') }, 1800)
  }

  const VitalInput = ({ label, field, unit, placeholder }) => (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="flex items-center mt-1">
        <input
          type="number"
          placeholder={placeholder || '—'}
          value={form[field]}
          onChange={e => set(field, e.target.value)}
          className="input rounded-r-none border-r-0"
        />
        {unit && (
          <span className="bg-gray-100 border border-gray-200 border-l-0 rounded-r-xl px-3 py-3 text-sm text-gray-500 whitespace-nowrap">
            {unit}
          </span>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 transition-all">
          <ChevronLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Record Vitals</h1>
          <p className="text-sm text-gray-500">Measure and save patient vitals</p>
        </div>
      </div>

      {/* Patient selector */}
      {!selected ? (
        <div className="card space-y-3">
          <p className="font-semibold text-gray-800">Select Patient</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
            <input
              type="text"
              placeholder="Search patient..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {filteredPatients.map(p => {
              const name = `${p.profiles?.first_name} ${p.profiles?.last_name}`
              const initials = [p.profiles?.first_name?.[0], p.profiles?.last_name?.[0]].filter(Boolean).join('').toUpperCase()
              return (
                <button key={p.user_id}
                  onClick={() => setSelected({ id: p.user_id, name })}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-bhw-50 transition-all text-left">
                  <div className="w-9 h-9 bg-bhw-100 rounded-full flex items-center justify-center text-bhw-700 font-bold text-sm shrink-0">
                    {initials}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{name}</p>
                    {p.city && <p className="text-xs text-gray-400">Brgy. {p.city}</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-bhw-50 border border-bhw-100 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-bhw-600"/>
            <span className="font-semibold text-bhw-800 text-sm">{selected.name}</span>
          </div>
          <button onClick={() => setSelected(null)} className="text-xs text-bhw-600 hover:underline">Change</button>
        </div>
      )}

      {/* Vitals form */}
      {selected && (
        <div className="card space-y-4">
          <p className="font-semibold text-gray-800 flex items-center gap-2">
            <Heart className="w-4 h-4 text-orange-500"/> Vital Signs
          </p>
          <div className="grid grid-cols-2 gap-4">
            <VitalInput label="Temperature"   field="temperature"    unit="°C"   placeholder="36.5"/>
            <VitalInput label="Oxygen Level"  field="oxygen_level"   unit="%"    placeholder="98"/>
            <VitalInput label="Systolic BP"   field="systolic_bp"    unit="mmHg" placeholder="120"/>
            <VitalInput label="Diastolic BP"  field="diastolic_bp"   unit="mmHg" placeholder="80"/>
            <VitalInput label="Heart Rate"    field="heart_rate"     unit="bpm"  placeholder="72"/>
            <VitalInput label="Breathing Rate" field="breathing_rate" unit="/min" placeholder="16"/>
            <VitalInput label="Weight"        field="weight"         unit="kg"   placeholder="60"/>
            <VitalInput label="Height"        field="height"         unit="cm"   placeholder="165"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
            <textarea
              rows={3}
              placeholder="Additional observations..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="input mt-1 resize-none"
            />
          </div>

          {saved ? (
            <div className="flex items-center justify-center gap-2 bg-green-50 text-green-700 font-semibold py-3 rounded-xl">
              <CheckCircle className="w-5 h-5"/> Vitals saved successfully!
            </div>
          ) : (
            <button onClick={handleSave} disabled={saving}
              className="btn-primary-bhw w-full disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Vitals'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
