import React, { useState, useEffect } from 'react'
import { Thermometer, Wind, Heart, Activity, Weight, Ruler, Save, Plus, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const fields = [
  { key: 'temperature',    label: 'Temperature',       unit: '°C',         icon: Thermometer, color: 'text-red-500',    bg: 'bg-red-50',    placeholder: '36.5' },
  { key: 'oxygen_level',   label: 'Oxygen Level',      unit: '% SpO2',     icon: Wind,        color: 'text-blue-500',  bg: 'bg-blue-50',   placeholder: '98' },
  { key: 'systolic_bp',    label: 'Systolic BP',       unit: 'mmHg',       icon: Activity,    color: 'text-purple-500',bg: 'bg-purple-50', placeholder: '120' },
  { key: 'diastolic_bp',   label: 'Diastolic BP',      unit: 'mmHg',       icon: Activity,    color: 'text-purple-500',bg: 'bg-purple-50', placeholder: '80' },
  { key: 'heart_rate',     label: 'Heart Rate',        unit: 'bpm',        icon: Heart,       color: 'text-rose-500',  bg: 'bg-rose-50',   placeholder: '72' },
  { key: 'breathing_rate', label: 'Breathing Rate',    unit: 'breaths/min',icon: Wind,        color: 'text-cyan-500',  bg: 'bg-cyan-50',   placeholder: '16' },
  { key: 'weight',         label: 'Weight',            unit: 'kg',         icon: Weight,      color: 'text-green-500', bg: 'bg-green-50',  placeholder: '65' },
  { key: 'height',         label: 'Height',            unit: 'cm',         icon: Ruler,       color: 'text-orange-500',bg: 'bg-orange-50', placeholder: '170' },
]

export default function Vitals() {
  const { user } = useAuth()
  const [form, setForm]         = useState({ temperature:'', oxygen_level:'', systolic_bp:'', diastolic_bp:'', heart_rate:'', breathing_rate:'', weight:'', height:'', notes:'' })
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')
  const [showHistory, setShowHistory] = useState(true)

  useEffect(() => {
    if (user) fetchHistory()
  }, [user])

  async function fetchHistory() {
    const { data } = await supabase
      .from('vitals').select('*').eq('patient_id', user.id)
      .order('measured_at', { ascending: false }).limit(10)
    setHistory(data || [])
  }

  async function handleSave(e) {
    e.preventDefault()
    setLoading(true); setError(''); setSaved(false)
    const payload = { patient_id: user.id, notes: form.notes }
    fields.forEach(f => { if (form[f.key]) payload[f.key] = parseFloat(form[f.key]) })
    const { error: err } = await supabase.from('vitals').insert(payload)
    if (err) { setError(err.message); setLoading(false); return }
    setSaved(true)
    setForm({ temperature:'', oxygen_level:'', systolic_bp:'', diastolic_bp:'', heart_rate:'', breathing_rate:'', weight:'', height:'', notes:'' })
    await fetchHistory()
    setLoading(false)
    setTimeout(() => setSaved(false), 3000)
  }

  const latest = history[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Vitals</h1>
        <p className="text-gray-500 text-sm mt-1">Track and monitor your health measurements</p>
      </div>

      {/* Latest readings summary */}
      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Temperature', val: latest.temperature ? `${latest.temperature}°C` : '—', color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'SpO2',        val: latest.oxygen_level ? `${latest.oxygen_level}%` : '—', color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Heart Rate',  val: latest.heart_rate ? `${latest.heart_rate} bpm` : '—', color: 'text-rose-600', bg: 'bg-rose-50' },
            { label: 'Blood Press', val: (latest.systolic_bp && latest.diastolic_bp) ? `${latest.systolic_bp}/${latest.diastolic_bp}` : '—', color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
              <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Log form */}
      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-patient-100 rounded-xl flex items-center justify-center">
            <Plus className="w-5 h-5 text-patient-600"/>
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Log New Vitals</h2>
            <p className="text-xs text-gray-500">Enter your current measurements</p>
          </div>
        </div>

        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm mb-4 flex items-center gap-2">
            <span>✓</span> Vitals saved successfully!
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
        )}

        <form onSubmit={handleSave}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {fields.map(({ key, label, unit, icon: Icon, color, bg, placeholder }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 ${color}`}/>
                    {label}
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number" step="0.01" placeholder={placeholder}
                    value={form[key]}
                    onChange={e => setForm({...form, [key]: e.target.value})}
                    className="input pr-14 text-sm"
                  />
                  <span className="absolute right-3 top-3 text-xs text-gray-400 font-medium">{unit}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
            <textarea rows={2} placeholder="Any symptoms, context, or additional observations..."
              value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
              className="input resize-none text-sm"/>
          </div>

          <button type="submit" disabled={loading} className="btn-primary-patient mt-4 px-8">
            {loading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              : <><Save className="w-4 h-4"/> Save Vitals</>}
          </button>
        </form>
      </div>

      {/* History */}
      <div className="card">
        <button onClick={() => setShowHistory(!showHistory)}
          className="flex items-center justify-between w-full mb-4">
          <h2 className="font-bold text-gray-900">Vitals History</h2>
          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${showHistory ? 'rotate-180' : ''}`}/>
        </button>

        {showHistory && (
          history.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">No vitals recorded yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium pr-4">Date</th>
                    <th className="pb-2 font-medium pr-4">Temp</th>
                    <th className="pb-2 font-medium pr-4">SpO2</th>
                    <th className="pb-2 font-medium pr-4">BP</th>
                    <th className="pb-2 font-medium pr-4">HR</th>
                    <th className="pb-2 font-medium pr-4">RR</th>
                    <th className="pb-2 font-medium pr-4">Wt</th>
                    <th className="pb-2 font-medium">Ht</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.map(v => (
                    <tr key={v.id} className="hover:bg-gray-50 text-gray-700">
                      <td className="py-2.5 pr-4 whitespace-nowrap text-xs text-gray-500">
                        {new Date(v.measured_at).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' })}
                      </td>
                      <td className="py-2.5 pr-4">{v.temperature ? `${v.temperature}°C` : '—'}</td>
                      <td className="py-2.5 pr-4">{v.oxygen_level ? `${v.oxygen_level}%` : '—'}</td>
                      <td className="py-2.5 pr-4">{v.systolic_bp ? `${v.systolic_bp}/${v.diastolic_bp}` : '—'}</td>
                      <td className="py-2.5 pr-4">{v.heart_rate ? `${v.heart_rate}` : '—'}</td>
                      <td className="py-2.5 pr-4">{v.breathing_rate || '—'}</td>
                      <td className="py-2.5 pr-4">{v.weight ? `${v.weight}kg` : '—'}</td>
                      <td className="py-2.5">{v.height ? `${v.height}cm` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  )
}
