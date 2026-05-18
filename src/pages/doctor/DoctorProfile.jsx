import React, { useState, useEffect } from 'react'
import { Edit3, Save, X, Star, Clock, MapPin, Phone, CheckCircle, DollarSign } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DAY_FULL = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday', Sun:'Sunday' }

const TIME_SLOTS = ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM']

const SPECIALIZATIONS = [
  'General Practice','Internal Medicine','Cardiology','Dermatology','Neurology',
  'Orthopedics','Pediatrics','Psychiatry','Obstetrics & Gynecology','Ophthalmology',
  'ENT','Pulmonology','Gastroenterology','Endocrinology','Family Medicine','Emergency Medicine',
]

export default function DoctorProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState(false)
  const [docProf,   setDocProf]   = useState(null)

  const [form, setForm] = useState({
    first_name: '', last_name: '',
    specialization: 'General Practice', license_number: '', years_of_experience: '',
    clinic_name: '', clinic_address: '', clinic_phone: '',
    consultation_fee: '', bio: '',
    available_days: [], available_time_slots: [],
    is_accepting_patients: true,
  })

  useEffect(() => { if (user) fetchProfile() }, [user])

  async function fetchProfile() {
    const { data } = await supabase
      .from('doctor_profiles').select('*').eq('user_id', user.id).single()
    setDocProf(data)
    if (data) {
      setForm({
        first_name:           profile?.first_name || '',
        last_name:            profile?.last_name  || '',
        specialization:       data.specialization || 'General Practice',
        license_number:       data.license_number || '',
        years_of_experience:  data.years_of_experience?.toString() || '',
        clinic_name:          data.clinic_name    || '',
        clinic_address:       data.clinic_address || '',
        clinic_phone:         data.clinic_phone   || '',
        consultation_fee:     data.consultation_fee?.toString() || '',
        bio:                  data.bio            || '',
        available_days:       data.available_days || [],
        available_time_slots: data.available_time_slots || [],
        is_accepting_patients: data.is_accepting_patients ?? true,
      })
    }
  }

  function toggleDay(d) {
    setForm(f => ({
      ...f,
      available_days: f.available_days.includes(DAY_FULL[d])
        ? f.available_days.filter(x => x !== DAY_FULL[d])
        : [...f.available_days, DAY_FULL[d]]
    }))
  }

  function toggleSlot(s) {
    setForm(f => ({
      ...f,
      available_time_slots: f.available_time_slots.includes(s)
        ? f.available_time_slots.filter(x => x !== s)
        : [...f.available_time_slots, s]
    }))
  }

  async function handleSave() {
    setSaving(true); setError(''); setSuccess(false)
    try {
      const { error: e1 } = await supabase.from('profiles')
        .update({ first_name: form.first_name, last_name: form.last_name })
        .eq('id', user.id)
      if (e1) throw e1

      const { error: e2 } = await supabase.from('doctor_profiles')
        .upsert({
          user_id:              user.id,
          specialization:       form.specialization,
          license_number:       form.license_number,
          years_of_experience:  form.years_of_experience ? parseInt(form.years_of_experience) : 0,
          clinic_name:          form.clinic_name,
          clinic_address:       form.clinic_address,
          clinic_phone:         form.clinic_phone,
          consultation_fee:     form.consultation_fee ? parseFloat(form.consultation_fee) : 0,
          bio:                  form.bio,
          available_days:       form.available_days,
          available_time_slots: form.available_time_slots,
          is_accepting_patients: form.is_accepting_patients,
        }, { onConflict: 'user_id' })
      if (e2) throw e2

      await refreshProfile()
      await fetchProfile()
      setSuccess(true); setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const initials = [form.first_name?.[0], form.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'D'
  const fullName = [form.first_name, form.last_name].filter(Boolean).join(' ') || 'Doctor'

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doctor Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your availability, fee, and profile info</p>
        </div>
        {!editing
          ? <button onClick={() => setEditing(true)} className="btn-outline"><Edit3 className="w-4 h-4"/> Edit Profile</button>
          : <div className="flex gap-2">
              <button onClick={() => { setEditing(false); fetchProfile() }} className="btn-outline text-red-600 border-red-200">
                <X className="w-4 h-4"/> Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary-doctor px-6">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <><Save className="w-4 h-4"/> Save Changes</>}
              </button>
            </div>
        }
      </div>

      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">✓ Profile updated successfully!</div>}
      {error   && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {/* Profile card */}
      <div className="card">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-16 h-16 bg-doctor-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-gray-900">Dr. {fullName}</p>
              {docProf?.is_verified && <CheckCircle className="w-5 h-5 text-doctor-600"/>}
            </div>
            <p className="text-doctor-600 font-semibold text-sm">{form.specialization}</p>
            {form.clinic_name && <p className="text-gray-500 text-sm flex items-center gap-1 mt-0.5"><MapPin className="w-3.5 h-3.5"/>{form.clinic_name}</p>}
            <div className="flex items-center gap-3 mt-1">
              {form.consultation_fee && <span className="text-sm font-bold text-gray-700">₱{form.consultation_fee} per consultation</span>}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${form.is_accepting_patients ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {form.is_accepting_patients ? '● Online' : '● Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Basic Info */}
        <div className="mb-5">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
            👤 Basic Information
          </h3>
          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="First name" value={form.first_name}
                    onChange={e => setForm(f => ({...f, first_name: e.target.value}))} className="input-doctor text-sm py-2"/>
                  <input placeholder="Last name" value={form.last_name}
                    onChange={e => setForm(f => ({...f, last_name: e.target.value}))} className="input-doctor text-sm py-2"/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Specialization</label>
                <select value={form.specialization}
                  onChange={e => setForm(f => ({...f, specialization: e.target.value}))} className="input-doctor text-sm py-2">
                  {SPECIALIZATIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Hospital / Clinic</label>
                <input placeholder="e.g. Makati Medical Center" value={form.clinic_name}
                  onChange={e => setForm(f => ({...f, clinic_name: e.target.value}))} className="input-doctor text-sm py-2"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Years of Experience</label>
                <input type="number" min="0" placeholder="e.g. 9" value={form.years_of_experience}
                  onChange={e => setForm(f => ({...f, years_of_experience: e.target.value}))} className="input-doctor text-sm py-2"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Consultation Fee (₱)</label>
                <input type="number" min="0" placeholder="e.g. 500" value={form.consultation_fee}
                  onChange={e => setForm(f => ({...f, consultation_fee: e.target.value}))} className="input-doctor text-sm py-2"/>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <div className="flex gap-2 mt-1">
                  {[true, false].map(v => (
                    <button key={String(v)} type="button"
                      onClick={() => setForm(f => ({...f, is_accepting_patients: v}))}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all border ${
                        form.is_accepting_patients === v
                          ? v ? 'bg-green-500 text-white border-green-500' : 'bg-gray-400 text-white border-gray-400'
                          : 'bg-white text-gray-500 border-gray-200'
                      }`}>
                      {v ? '● Online' : '● Offline'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Bio / About</label>
                <textarea rows={3} placeholder="Describe your experience and expertise..."
                  value={form.bio} onChange={e => setForm(f => ({...f, bio: e.target.value}))}
                  className="input-doctor text-sm resize-none w-full"/>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <div><p className="text-xs text-gray-400">Experience</p><p className="font-semibold text-gray-800">{form.years_of_experience ? `${form.years_of_experience} years` : '—'}</p></div>
              <div><p className="text-xs text-gray-400">Fee</p><p className="font-semibold text-gray-800">{form.consultation_fee ? `₱${form.consultation_fee}` : '—'}</p></div>
              {form.bio && <div className="col-span-2"><p className="text-xs text-gray-400">Bio</p><p className="text-gray-700 leading-relaxed">{form.bio}</p></div>}
            </div>
          )}
        </div>

        {/* Available Days */}
        <div className="mb-5">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
            🕐 Available Days
          </h3>
          <div className="flex flex-wrap gap-2">
            {DAYS.map(d => {
              const active = form.available_days.includes(DAY_FULL[d])
              return (
                <button key={d} type="button"
                  onClick={() => editing && toggleDay(d)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all
                    ${active
                      ? 'bg-doctor-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500'}
                    ${editing ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
                  `}>
                  {d}
                </button>
              )
            })}
          </div>
          {editing && <p className="text-xs text-gray-400 mt-2">Click to toggle available days</p>}
        </div>

        {/* Available Time Slots */}
        <div className="mb-5">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
            🕐 Available Time Slots
          </h3>
          <div className="flex flex-wrap gap-2">
            {TIME_SLOTS.map(s => {
              const active = form.available_time_slots.includes(s)
              return (
                <button key={s} type="button"
                  onClick={() => editing && toggleSlot(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border
                    ${active
                      ? 'bg-doctor-600 text-white border-doctor-600'
                      : 'bg-white text-gray-500 border-gray-200'}
                    ${editing ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
                  `}>
                  {s}
                </button>
              )
            })}
          </div>
          {editing && <p className="text-xs text-gray-400 mt-2">Click to toggle available time slots</p>}
        </div>

        {/* Profile Stats */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
            ⭐ Profile Stats
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{docProf?.average_rating?.toFixed(1) || '—'}</p>
              <p className="text-xs text-gray-500 mt-0.5">Rating</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{docProf?.total_reviews || 0}</p>
              <p className="text-xs text-gray-500 mt-0.5">Reviews</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{form.years_of_experience || '—'}</p>
              <p className="text-xs text-gray-500 mt-0.5">Experience</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
