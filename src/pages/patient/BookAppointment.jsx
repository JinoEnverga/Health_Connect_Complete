import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Calendar, Clock, User, CheckCircle, Star } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function BookAppointment() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user }  = useAuth()
  const preDoc    = location.state?.doctor

  const [doctors, setDoctors]     = useState([])
  const [selected, setSelected]   = useState(preDoc || null)
  const [form, setForm]           = useState({ doctor_id: preDoc?.user_id || '', date: '', time_slot: '', chief_complaint: '' })
  const [loading, setLoading]     = useState(false)
  const [success, setSuccess]     = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    supabase.from('doctor_directory').select('*').eq('is_accepting_patients', true)
      .then(({ data }) => setDoctors(data || []))
  }, [])

  function selectDoctor(doc) {
    setSelected(doc)
    setForm(f => ({ ...f, doctor_id: doc.user_id, time_slot: '' }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.doctor_id || !form.date || !form.time_slot) { setError('Please fill all required fields'); return }
    setLoading(true); setError('')
    const { error: err } = await supabase.from('appointments').insert({
      patient_id: user.id,
      doctor_id:  form.doctor_id,
      appointment_date: form.date,
      time_slot:  form.time_slot,
      chief_complaint: form.chief_complaint,
      consultation_fee: selected?.consultation_fee,
    })
    if (err) { setError(err.message); setLoading(false); return }
    setSuccess(true); setLoading(false)
  }

  if (success) return (
    <div className="max-w-lg mx-auto">
      <div className="card flex flex-col items-center text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600"/>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Appointment Booked!</h2>
        <p className="text-gray-500 text-sm mb-6">Your appointment has been confirmed. You'll receive a notification with the details.</p>
        <div className="bg-gray-50 rounded-xl p-4 w-full text-left mb-6">
          <p className="text-sm text-gray-600"><span className="font-semibold">Doctor:</span> Dr. {selected?.full_name}</p>
          <p className="text-sm text-gray-600 mt-1"><span className="font-semibold">Date:</span> {form.date}</p>
          <p className="text-sm text-gray-600 mt-1"><span className="font-semibold">Time:</span> {form.time_slot}</p>
        </div>
        <button onClick={() => navigate('/appointments')} className="btn-primary-patient px-8">View My Appointments</button>
      </div>
    </div>
  )

  const initials = selected?.full_name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Book Appointment</h1>
          <p className="text-gray-500 text-sm">Schedule a teleconsultation with your doctor</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Select Doctor */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-patient-600"/> Select Doctor
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Doctor</label>
            <select value={form.doctor_id}
              onChange={e => {
                const doc = doctors.find(d => d.user_id === e.target.value)
                if (doc) selectDoctor(doc)
              }}
              className="input">
              <option value="">— Select a doctor —</option>
              {doctors.map(d => (
                <option key={d.user_id} value={d.user_id}>
                  Dr. {d.full_name} — {d.specialization}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="mt-3 bg-patient-50 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-patient-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-gray-900 text-sm">Dr. {selected.full_name}</p>
                  <CheckCircle className="w-3.5 h-3.5 text-patient-600"/>
                </div>
                <p className="text-patient-600 text-xs font-medium">{selected.specialization}</p>
                <p className="text-gray-500 text-xs flex items-center gap-2 mt-0.5">
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400"/>
                  {selected.average_rating?.toFixed(1) || 'N/A'} · ₱{selected.consultation_fee} per session
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Date & Time */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-patient-600"/> Select Date & Time
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
              <input type="date" required min={new Date().toISOString().split('T')[0]}
                value={form.date} onChange={e => setForm({...form, date: e.target.value})}
                className="input"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Time Slot</label>
              <select required value={form.time_slot}
                onChange={e => setForm({...form, time_slot: e.target.value})}
                className="input">
                <option value="">— Select time —</option>
                {selected?.available_time_slots?.map(t => (
                  <option key={t} value={t}>{t}</option>
                )) || ['09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','01:00 PM','01:30 PM','02:00 PM','03:00 PM','04:00 PM'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-4">Appointment Notes</h2>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Describe your concern <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea rows={3} maxLength={500}
            placeholder="e.g., Persistent headache for the past 3 days, mild fever..."
            value={form.chief_complaint} onChange={e => setForm({...form, chief_complaint: e.target.value})}
            className="input resize-none text-sm"/>
          <p className="text-xs text-gray-400 mt-1 text-right">{form.chief_complaint.length}/500 characters</p>
        </div>

        <button type="submit" disabled={loading} className="btn-primary-patient w-full py-4 text-base">
          {loading
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
            : <><CheckCircle className="w-5 h-5"/> Confirm Appointment</>}
        </button>
      </form>
    </div>
  )
}
