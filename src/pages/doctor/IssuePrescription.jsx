import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, CheckCircle, User, Pill, Plus, Trash2, Search, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import DigitalPrescription from '../../components/shared/DigitalPrescription'

const FREQUENCIES = [
  'Once a day', 'Twice a day', '3 times a day', '4 times a day',
  'Every 4 hours', 'Every 6 hours', 'Every 8 hours', 'At bedtime', 'As needed',
]
const DURATIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '30 days', 'Until finished', 'Maintenance']
const VALIDITY  = [7, 14, 30, 60, 90]

const emptyMed = () => ({
  key: crypto.randomUUID(),
  medicine_name: '', dosage: '', frequency: '', duration: '',
  quantity: '', refills_allowed: 0, special_instructions: '',
})

export default function IssuePrescription() {
  const { user, profile } = useAuth()
  const location   = useLocation()
  const navigate   = useNavigate()
  const pre        = location.state || {}

  const [patients, setPatients]     = useState([])  // from this doctor's appointments
  const [patient, setPatient]       = useState(null) // { id, first_name, last_name, email }
  const [emailQuery, setEmailQuery] = useState(pre.patientEmail || '')
  const [lookingUp, setLookingUp]   = useState(false)
  const [appts, setAppts]           = useState([])
  const [appointmentId, setAppointmentId] = useState(pre.appointmentId || '')

  const [diagnosis, setDiagnosis]   = useState('')
  const [notes, setNotes]           = useState('')
  const [validDays, setValidDays]   = useState(30)
  const [meds, setMeds]             = useState([emptyMed()])

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [issued, setIssued]   = useState(null) // { rx, medications, doctor }

  // Patients this doctor has seen / will see — the usual way to pick one.
  useEffect(() => {
    if (!user) return
    supabase.from('appointments')
      .select('patient_id, patient:profiles!appointments_patient_id_fkey(id, first_name, last_name, email)')
      .eq('doctor_id', user.id)
      .order('appointment_date', { ascending: false })
      .then(({ data }) => {
        const seen = new Map()
        ;(data || []).forEach(a => { if (a.patient && !seen.has(a.patient.id)) seen.set(a.patient.id, a.patient) })
        const list = [...seen.values()].sort((x, y) => `${x.first_name} ${x.last_name}`.localeCompare(`${y.first_name} ${y.last_name}`))
        setPatients(list)
        const preselect = list.find(p => p.id === pre.patientId || (pre.patientEmail && p.email === pre.patientEmail))
        if (preselect) setPatient(preselect)
      })
  }, [user])

  // The selected patient's appointments with me, to optionally link the Rx.
  useEffect(() => {
    if (!patient?.id) { setAppts([]); return }
    supabase.from('appointments')
      .select('id, appointment_date, time_slot, status, queue_number')
      .eq('doctor_id', user.id).eq('patient_id', patient.id)
      .order('appointment_date', { ascending: false }).limit(20)
      .then(({ data }) => setAppts(data || []))
  }, [patient?.id])

  async function lookupByEmail() {
    const email = emailQuery.trim()
    if (!email) return
    setLookingUp(true); setError('')
    const known = patients.find(p => p.email?.toLowerCase() === email.toLowerCase())
    if (known) { setPatient(known); setLookingUp(false); return }
    const { data: id, error: err } = await supabase.rpc('get_patient_id_by_email', { patient_email: email })
    setLookingUp(false)
    if (err || !id) { setError('No patient account found with that email address.'); return }
    // No appointment with this patient yet, so their profile isn't visible
    // to us until the prescription exists — identify them by email for now.
    setPatient({ id, email, first_name: '', last_name: '' })
    setAppointmentId('')
  }

  function updateMed(key, field, value) {
    setMeds(ms => ms.map(m => m.key === key ? { ...m, [field]: value } : m))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!patient) { setError('Choose a patient first.'); return }
    if (!diagnosis.trim()) { setError('A diagnosis is required.'); return }
    const incomplete = meds.findIndex(m => !m.medicine_name.trim() || !m.dosage.trim() || !m.frequency.trim() || !m.duration.trim())
    if (incomplete !== -1) { setError(`Medication ${incomplete + 1}: fill in the name, dosage, frequency and duration.`); return }

    setLoading(true)
    const medications = meds.map(({ key, ...m }) => ({
      ...m,
      quantity:        m.quantity === '' ? null : Number(m.quantity),
      refills_allowed: Number(m.refills_allowed) || 0,
    }))
    const { data: rx, error: rpcErr } = await supabase.rpc('issue_prescription', {
      p_patient_id:       patient.id,
      p_diagnosis:        diagnosis,
      p_medications:      medications,
      p_additional_notes: notes || null,
      p_appointment_id:   appointmentId || null,
      p_valid_days:       Number(validDays),
    })
    if (rpcErr) { setError(rpcErr.message); setLoading(false); return }

    const [{ data: dp }, { data: pat }] = await Promise.all([
      supabase.from('doctor_profiles').select('specialization, license_number, clinic_name, clinic_address, clinic_phone').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('first_name, last_name').eq('id', patient.id).maybeSingle(),
    ])
    setIssued({
      rx,
      medications,
      doctor:  { first_name: profile?.first_name, last_name: profile?.last_name, ...(dp || {}) },
      patient: pat || patient,
    })
    setLoading(false)
  }

  function reset() {
    setIssued(null); setDiagnosis(''); setNotes(''); setMeds([emptyMed()]); setAppointmentId('')
  }

  if (issued) return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="card flex items-center gap-3 bg-green-50 border-green-200">
        <CheckCircle className="w-6 h-6 text-green-600 shrink-0"/>
        <div>
          <p className="font-bold text-gray-900">Prescription issued</p>
          <p className="text-sm text-gray-600">It's now in the patient's E-Prescriptions, as a digital record.</p>
        </div>
      </div>
      <DigitalPrescription rx={issued.rx} medications={issued.medications} doctor={issued.doctor} patient={issued.patient}/>
      <div className="flex gap-3">
        <button onClick={reset} className="btn-primary-doctor flex-1"><Plus className="w-4 h-4"/> Issue Another</button>
        <button onClick={() => navigate('/doctor/prescriptions')} className="btn-outline flex-1"><FileText className="w-4 h-4"/> All Prescriptions</button>
      </div>
    </div>
  )

  const patientLabel = p => [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Issue Prescription</h1>
          <p className="text-gray-500 text-sm">Create a digital prescription for your patient</p>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Patient */}
        <div className="card space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><User className="w-4 h-4 text-doctor-600"/> Patient</h2>
          {patients.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Your patients</label>
              <select className="input-doctor" value={patients.some(p => p.id === patient?.id) ? patient.id : ''}
                onChange={e => { setPatient(patients.find(p => p.id === e.target.value) || null); setAppointmentId('') }}>
                <option value="">— Select a patient —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{patientLabel(p)}{p.email ? ` (${p.email})` : ''}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {patients.length > 0 ? 'Or find another patient by email' : 'Find patient by email'}
            </label>
            <div className="flex gap-2">
              <input type="email" placeholder="patient@email.com" value={emailQuery}
                onChange={e => setEmailQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupByEmail() } }}
                className="input-doctor"/>
              <button type="button" onClick={lookupByEmail} disabled={lookingUp || !emailQuery.trim()} className="btn-outline shrink-0 disabled:opacity-50">
                <Search className="w-4 h-4"/> {lookingUp ? 'Finding...' : 'Find'}
              </button>
            </div>
          </div>
          {patient && (
            <div className="bg-doctor-50 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
              <span><span className="text-gray-500">Prescribing for:</span> <span className="font-semibold">{patientLabel(patient)}</span></span>
              {appts.length > 0 && (
                <select className="input-doctor text-sm py-1.5 w-auto" value={appointmentId} onChange={e => setAppointmentId(e.target.value)}>
                  <option value="">Not linked to an appointment</option>
                  {appts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.appointment_date} · {a.time_slot}{a.queue_number ? ` · #${a.queue_number}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Diagnosis */}
        <div className="card space-y-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><FileText className="w-4 h-4 text-doctor-600"/> Diagnosis</h2>
          <input required placeholder="e.g., Acute upper respiratory tract infection" maxLength={300}
            value={diagnosis} onChange={e => setDiagnosis(e.target.value)} className="input-doctor"/>
        </div>

        {/* Medications */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><Pill className="w-4 h-4 text-doctor-600"/> Medications</h2>
            <span className="text-xs text-gray-400">{meds.length} of 20</span>
          </div>

          <datalist id="rx-frequencies">{FREQUENCIES.map(f => <option key={f} value={f}/>)}</datalist>
          <datalist id="rx-durations">{DURATIONS.map(d => <option key={d} value={d}/>)}</datalist>

          {meds.map((m, i) => (
            <div key={m.key} className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-700">#{i + 1}</p>
                {meds.length > 1 && (
                  <button type="button" onClick={() => setMeds(ms => ms.filter(x => x.key !== m.key))}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Remove">
                    <Trash2 className="w-4 h-4"/>
                  </button>
                )}
              </div>
              <input placeholder="Medicine name, strength & form — e.g., Amoxicillin 500 mg capsule" maxLength={200}
                value={m.medicine_name} onChange={e => updateMed(m.key, 'medicine_name', e.target.value)} className="input-doctor"/>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input placeholder="Dosage — e.g., 1 capsule" maxLength={100}
                  value={m.dosage} onChange={e => updateMed(m.key, 'dosage', e.target.value)} className="input-doctor"/>
                <input placeholder="Frequency" list="rx-frequencies" maxLength={100}
                  value={m.frequency} onChange={e => updateMed(m.key, 'frequency', e.target.value)} className="input-doctor"/>
                <input placeholder="Duration" list="rx-durations" maxLength={100}
                  value={m.duration} onChange={e => updateMed(m.key, 'duration', e.target.value)} className="input-doctor"/>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                  <input type="number" min={1} max={10000} placeholder="e.g., 21"
                    value={m.quantity} onChange={e => updateMed(m.key, 'quantity', e.target.value)} className="input-doctor"/>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Refills</label>
                  <input type="number" min={0} max={12}
                    value={m.refills_allowed} onChange={e => updateMed(m.key, 'refills_allowed', e.target.value)} className="input-doctor"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Instructions (optional)</label>
                  <input placeholder="e.g., Take after meals" maxLength={300}
                    value={m.special_instructions} onChange={e => updateMed(m.key, 'special_instructions', e.target.value)} className="input-doctor"/>
                </div>
              </div>
            </div>
          ))}

          {meds.length < 20 && (
            <button type="button" onClick={() => setMeds(ms => [...ms, emptyMed()])} className="btn-outline w-full">
              <Plus className="w-4 h-4"/> Add Medication
            </button>
          )}
        </div>

        {/* Notes & validity */}
        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes for the patient <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={3} maxLength={1000} placeholder="Follow-up advice, warnings, lifestyle instructions..."
              value={notes} onChange={e => setNotes(e.target.value)} className="input-doctor resize-none"/>
          </div>
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Valid for</label>
            <select value={validDays} onChange={e => setValidDays(e.target.value)} className="input-doctor">
              {VALIDITY.map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary-doctor w-full py-4 text-base disabled:opacity-60">
          {loading
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
            : <><Send className="w-5 h-5"/> Issue Digital Prescription</>}
        </button>
      </form>
    </div>
  )
}
