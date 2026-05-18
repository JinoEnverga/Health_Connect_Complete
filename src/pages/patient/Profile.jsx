import React, { useState, useEffect } from 'react'
import { User, Edit3, Save, X, Plus, Trash2, Heart, AlertCircle, Pill, Phone, Mail, MapPin, Calendar, Droplets } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const BLOOD_TYPES = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown']
const GENDERS     = ['male','female','other','prefer_not_to_say']

export default function PatientProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)
  const [pProfile, setPProfile] = useState(null)

  // Form state
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '', date_of_birth: '', gender: '',
    address: '', emergency_contact_name: '', emergency_contact_phone: '',
    blood_type: '', medical_history: '', height: '', weight: '',
    allergies: [], current_medications: [],
  })

  useEffect(() => { if (user) fetchPatientProfile() }, [user])

  async function fetchPatientProfile() {
    const { data } = await supabase
      .from('patient_profiles').select('*').eq('user_id', user.id).single()
    setPProfile(data)
    setForm({
      first_name:              profile?.first_name || '',
      last_name:               profile?.last_name  || '',
      phone:                   profile?.phone      || '',
      date_of_birth:           profile?.date_of_birth || '',
      gender:                  profile?.gender     || '',
      address:                 data?.address       || '',
      emergency_contact_name:  data?.emergency_contact_name  || '',
      emergency_contact_phone: data?.emergency_contact_phone || '',
      blood_type:              data?.blood_type    || '',
      medical_history:         data?.medical_history || '',
      allergies:               data?.allergies    || [],
      current_medications:     data?.current_medications || [],
    })
  }

  async function handleSave() {
    setSaving(true); setError(''); setSuccess(false)
    try {
      // Update base profile
      const { error: e1 } = await supabase.from('profiles')
        .update({ first_name: form.first_name, last_name: form.last_name, phone: form.phone, date_of_birth: form.date_of_birth || null, gender: form.gender || null })
        .eq('id', user.id)
      if (e1) throw e1

      // Upsert patient profile
      const { error: e2 } = await supabase.from('patient_profiles')
        .upsert({
          user_id:                 user.id,
          address:                 form.address,
          emergency_contact_name:  form.emergency_contact_name,
          emergency_contact_phone: form.emergency_contact_phone,
          blood_type:              form.blood_type || null,
          medical_history:         form.medical_history,
          allergies:               form.allergies,
          current_medications:     form.current_medications,
        }, { onConflict: 'user_id' })
      if (e2) throw e2

      await refreshProfile()
      setSuccess(true); setEditing(false)
      await fetchPatientProfile()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function addTag(field) {
    const val = prompt(`Add ${field === 'allergies' ? 'Allergy' : 'Medication'}:`)
    if (val?.trim()) setForm(f => ({ ...f, [field]: [...f[field], val.trim()] }))
  }
  function removeTag(field, idx) {
    setForm(f => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }))
  }

  const initials = [form.first_name?.[0], form.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'U'
  const fullName = [form.first_name, form.last_name].filter(Boolean).join(' ') || '—'

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your personal information and medical history</p>
        </div>
        {!editing
          ? <button onClick={() => setEditing(true)} className="btn-outline">
              <Edit3 className="w-4 h-4"/> Edit Profile
            </button>
          : <div className="flex gap-2">
              <button onClick={() => { setEditing(false); fetchPatientProfile() }} className="btn-outline text-red-600 border-red-200">
                <X className="w-4 h-4"/> Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="btn-primary-patient px-6">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <><Save className="w-4 h-4"/> Save Changes</>}
              </button>
            </div>
        }
      </div>

      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">✓ Profile updated successfully!</div>}
      {error   && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── LEFT COLUMN — Avatar + Vital Stats ── */}
        <div className="space-y-4">
          {/* Avatar card */}
          <div className="card flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-patient-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3">
              {initials}
            </div>
            <p className="font-bold text-gray-900 text-lg">{fullName}</p>
            <p className="text-patient-600 text-sm font-medium">Patient</p>
            <p className="text-gray-400 text-xs mt-0.5">{profile?.email}</p>
          </div>

          {/* Vital Stats */}
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-500"/> Vital Stats
            </h3>
            <div className="space-y-3">
              {[
                { label: 'Height', field: 'height', unit: 'cm', icon: '📏' },
                { label: 'Weight', field: 'weight', unit: 'kg', icon: '⚖️' },
              ].map(({ label, field, unit, icon }) => (
                <div key={field}>
                  <p className="text-xs text-gray-500 mb-1">{icon} {label}</p>
                  {editing
                    ? <input type="number" step="0.1" placeholder={`${label} in ${unit}`}
                        value={form[field]} onChange={e => setForm(f => ({...f, [field]: e.target.value}))}
                        className="input text-sm py-2"/>
                    : <p className="font-semibold text-gray-800">{form[field] ? `${form[field]} ${unit}` : '—'}</p>
                  }
                </div>
              ))}
              <div>
                <p className="text-xs text-gray-500 mb-1"><Droplets className="w-3 h-3 inline mr-1 text-red-500"/>Blood Type</p>
                {editing
                  ? <select value={form.blood_type} onChange={e => setForm(f => ({...f, blood_type: e.target.value}))} className="input text-sm py-2">
                      <option value="">— Select —</option>
                      {BLOOD_TYPES.map(b => <option key={b}>{b}</option>)}
                    </select>
                  : <p className="font-semibold text-gray-800">{form.blood_type || '—'}</p>
                }
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">👤 Gender</p>
                {editing
                  ? <select value={form.gender} onChange={e => setForm(f => ({...f, gender: e.target.value}))} className="input text-sm py-2">
                      <option value="">— Select —</option>
                      {GENDERS.map(g => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
                    </select>
                  : <p className="font-semibold text-gray-800 capitalize">{form.gender?.replace('_',' ') || '—'}</p>
                }
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Personal Information */}
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-patient-600"/> Personal Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Full Name', field: 'first_name', placeholder: 'First name', half: true },
                { label: '',          field: 'last_name',  placeholder: 'Last name',  half: true },
              ].map(f => (
                <div key={f.field}>
                  {f.label && <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><User className="w-3 h-3"/> Full Name</p>}
                  {editing
                    ? <input placeholder={f.placeholder} value={form[f.field]}
                        onChange={e => setForm(p => ({...p, [f.field]: e.target.value}))} className="input text-sm"/>
                    : <p className="font-semibold text-gray-800">{[form.first_name, form.last_name].join(' ') || '—'}</p>
                  }
                </div>
              ))}

              {[
                { label: 'Email Address', icon: Mail,     field: 'email',         type: 'email',  readonly: true },
                { label: 'Phone Number',  icon: Phone,    field: 'phone',         type: 'tel',    placeholder: '+63 9XX XXX XXXX' },
                { label: 'Date of Birth', icon: Calendar, field: 'date_of_birth', type: 'date'  },
                { label: 'Home Address',  icon: MapPin,   field: 'address',       type: 'text', placeholder: 'Street, City, Province' },
              ].map(({ label, icon: Icon, field, type, placeholder, readonly }) => (
                <div key={field} className={field === 'address' ? 'sm:col-span-2' : ''}>
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Icon className="w-3 h-3"/> {label}
                  </p>
                  {editing && !readonly
                    ? <input type={type} placeholder={placeholder || label}
                        value={form[field]} onChange={e => setForm(f => ({...f, [field]: e.target.value}))}
                        className="input text-sm"/>
                    : <p className="font-semibold text-gray-800">{(field === 'email' ? profile?.email : form[field]) || '—'}</p>
                  }
                </div>
              ))}

              <div className="sm:col-span-2">
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3"/> Emergency Contact
                </p>
                {editing
                  ? <div className="grid grid-cols-2 gap-2">
                      <input placeholder="Name" value={form.emergency_contact_name}
                        onChange={e => setForm(f => ({...f, emergency_contact_name: e.target.value}))} className="input text-sm"/>
                      <input placeholder="+63 9XX XXX XXXX" value={form.emergency_contact_phone}
                        onChange={e => setForm(f => ({...f, emergency_contact_phone: e.target.value}))} className="input text-sm"/>
                    </div>
                  : <p className="font-semibold text-gray-800">
                      {form.emergency_contact_name
                        ? `${form.emergency_contact_name} — ${form.emergency_contact_phone}`
                        : '—'}
                    </p>
                }
              </div>
            </div>
          </div>

          {/* Medical History */}
          <div className="card">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Heart className="w-4 h-4 text-patient-600"/> Medical History
            </h3>
            {editing
              ? <textarea rows={3} placeholder="Describe any past surgeries, conditions, or relevant medical history..."
                  value={form.medical_history}
                  onChange={e => setForm(f => ({...f, medical_history: e.target.value}))}
                  className="input resize-none text-sm"/>
              : <p className="text-gray-700 text-sm">{form.medical_history || <span className="text-gray-400 italic">No medical history recorded yet.</span>}</p>
            }
          </div>

          {/* Allergies + Medications */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { label: 'Allergies',           icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-100', field: 'allergies' },
              { label: 'Current Medications', icon: Pill,        color: 'text-blue-600',   bg: 'bg-blue-100',   field: 'current_medications' },
            ].map(({ label, icon: Icon, color, bg, field }) => (
              <div key={field} className="card">
                <h3 className={`font-bold mb-3 flex items-center gap-2 ${color}`}>
                  <Icon className="w-4 h-4"/> {label}
                </h3>
                <div className="flex flex-wrap gap-2 min-h-[40px]">
                  {form[field].length === 0 && !editing && (
                    <p className="text-gray-400 text-sm italic">None recorded.</p>
                  )}
                  {form[field].map((tag, i) => (
                    <span key={i}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${bg} ${color}`}>
                      {tag}
                      {editing && (
                        <button onClick={() => removeTag(field, i)} className="hover:opacity-60 ml-1">
                          <X className="w-3 h-3"/>
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {editing && (
                  <button onClick={() => addTag(field)}
                    className={`mt-2 flex items-center gap-1 text-xs font-semibold ${color} hover:opacity-70`}>
                    <Plus className="w-3 h-3"/> Add {label === 'Allergies' ? 'Allergy' : 'Medication'}
                  </button>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
