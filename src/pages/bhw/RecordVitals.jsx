import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Heart, CheckCircle, ChevronLeft, MousePointerClick, History } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PatientPicker from '../../components/bhw/PatientPicker'
import { usePatients, patientName, barangayOf } from '../../components/bhw/patientUtils'

// Defined at module level, not inside the page component: a component
// declared inside another one is a new type on every render, so React
// remounts the <input> on each keystroke and it loses focus.
function VitalInput({ label, unit, placeholder, value, onChange }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="flex items-center mt-1">
        <input
          type="number"
          step="any"
          placeholder={placeholder || '—'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="input-bhw rounded-r-none border-r-0 py-2.5"
        />
        {unit && (
          <span className="bg-gray-100 border border-gray-200 border-l-0 rounded-r-xl px-3 py-2.5 text-sm text-gray-500 whitespace-nowrap">
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

const VITAL_FIELDS = [
  { label: 'Temperature',    field: 'temperature',    unit: '°C',   placeholder: '36.5' },
  { label: 'Oxygen Level',   field: 'oxygen_level',   unit: '%',    placeholder: '98' },
  { label: 'Systolic BP',    field: 'systolic_bp',    unit: 'mmHg', placeholder: '120' },
  { label: 'Diastolic BP',   field: 'diastolic_bp',   unit: 'mmHg', placeholder: '80' },
  { label: 'Heart Rate',     field: 'heart_rate',     unit: 'bpm',  placeholder: '72' },
  { label: 'Breathing Rate', field: 'breathing_rate', unit: '/min', placeholder: '16' },
  { label: 'Weight',         field: 'weight',         unit: 'kg',   placeholder: '60' },
  { label: 'Height',         field: 'height',         unit: 'cm',   placeholder: '165' },
]

const EMPTY_FORM = {
  temperature: '', oxygen_level: '', systolic_bp: '', diastolic_bp: '',
  heart_rate: '', breathing_rate: '', weight: '', height: '', notes: '',
}

const fmtWhen = ts => new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function BHWRecordVitals() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { patients, loading } = usePatients()
  const [selectedId, setSelectedId] = useState(state?.patientId || null)
  const [lastReading, setLastReading] = useState(null)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState('')
  const [form, setForm]             = useState(EMPTY_FORM)

  const selected = patients.find(p => p.user_id === selectedId)
  const selectedName = selected ? patientName(selected.profiles) : (state?.patientId === selectedId ? state?.patientName : '')

  // The selected patient's most recent reading, for reference.
  useEffect(() => {
    setLastReading(null)
    if (!selectedId) return
    supabase.from('vitals').select('*').eq('patient_id', selectedId)
      .order('measured_at', { ascending: false }).limit(1)
      .then(({ data }) => setLastReading(data?.[0] || null))
  }, [selectedId, saved])

  function pick(p) {
    setSelectedId(p.user_id); setForm(EMPTY_FORM); setError(''); setSaved(false)
  }

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!selectedId) return
    setSaving(true); setError('')
    const payload = {
      patient_id: selectedId,
      measured_at: new Date().toISOString(),
    }
    Object.entries(form).forEach(([k, v]) => {
      if (v !== '') payload[k] = k === 'notes' ? v : Number(v)
    })
    const { error: insertErr } = await supabase.from('vitals').insert(payload)
    setSaving(false)
    if (insertErr) { setError(`Could not save vitals: ${insertErr.message}`); return }
    setSaved(true)
    setForm(EMPTY_FORM)
    setTimeout(() => setSaved(false), 3000)
  }

  const hasValue = Object.entries(form).some(([k, v]) => k !== 'notes' && v !== '')

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 transition-all" aria-label="Back">
          <ChevronLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Record Vitals</h1>
          <p className="text-sm text-gray-500">Measure and save patient vitals</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4">
          <PatientPicker patients={patients} loading={loading} selectedId={selectedId} onSelect={pick}/>
        </div>

        <div className="lg:col-span-8">
          {!selectedId ? (
            <div className="bg-white rounded-2xl shadow-sm border border-dashed border-gray-200 flex flex-col items-center justify-center text-center py-20 px-6">
              <MousePointerClick className="w-10 h-10 text-gray-300 mb-3"/>
              <p className="font-semibold text-gray-600">Select a patient on the left to begin</p>
              <p className="text-sm text-gray-400 mt-1">The vitals form will appear here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                <div>
                  <p className="font-bold text-gray-900 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-orange-500"/> {selectedName || 'Patient'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selected && barangayOf(selected) ? `Brgy. ${barangayOf(selected)} · ` : ''}
                    {lastReading ? `Last recorded ${fmtWhen(lastReading.measured_at)}` : 'No vitals recorded yet'}
                  </p>
                </div>
                <button onClick={() => navigate('/bhw/medical-history', { state: { patientId: selectedId, patientName: selectedName } })}
                  className="text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                  <History className="w-3.5 h-3.5"/> History
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {VITAL_FIELDS.map(({ label, field, unit, placeholder }) => (
                  <VitalInput key={field} label={label} unit={unit} placeholder={placeholder}
                    value={form[field]} onChange={v => set(field, v)}/>
                ))}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
                <textarea rows={2} placeholder="Additional observations..."
                  value={form.notes} onChange={e => set('notes', e.target.value)}
                  className="input-bhw mt-1 resize-none"/>
              </div>

              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

              {saved && (
                <div className="flex items-center justify-center gap-2 bg-green-50 text-green-700 font-semibold py-3 rounded-xl">
                  <CheckCircle className="w-5 h-5"/> Vitals saved for {selectedName || 'the patient'}
                </div>
              )}
              <button onClick={handleSave} disabled={saving || !hasValue}
                className="btn-primary-bhw w-full disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Vitals'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
