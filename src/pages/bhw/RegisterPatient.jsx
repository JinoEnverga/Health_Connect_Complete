import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, ChevronLeft, CheckCircle, Copy } from 'lucide-react'
import { createIsolatedClient } from '../../lib/supabase'

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

// Cryptographically random temporary password (Math.random is guessable).
function makeTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return 'HC-' + Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

// Module-level for the same reason as VitalInput in RecordVitals.jsx: an
// inline component remounts its <input> on every keystroke.
function Field({ label, type = 'text', placeholder, required, value, onChange }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} className="input mt-1"/>
    </div>
  )
}

export default function RegisterPatient() {
  const navigate = useNavigate()
  const [step, setStep]       = useState(1)
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(null) // { email, tempPassword, warning }
  const [copied, setCopied]   = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    date_of_birth: '', gender: '', blood_type: '',
    address: '', city: '', province: '', postal_code: '',
    emergency_contact_name: '', emergency_contact_relationship: '', emergency_contact_phone: '',
    medical_history: '', allergies: '', current_medications: '',
  })

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }
  const fieldProps = field => ({ value: form[field], onChange: v => set(field, v) })

  async function handleSubmit() {
    if (!form.first_name || !form.last_name || !form.email) {
      setError('First name, last name, and email are required.')
      return
    }
    setSaving(true)
    setError('')

    // Sign the patient up on an isolated client so the BHW stays signed in.
    // The handle_new_user trigger creates the profiles + patient_profiles
    // rows from this metadata; the details below are then written as the
    // new patient themself, which the existing own-row RLS policies allow.
    const client = createIsolatedClient()
    const tempPassword = makeTempPassword()
    const { data: authData, error: authErr } = await client.auth.signUp({
      email: form.email,
      password: tempPassword,
      options: { data: { role: 'patient', first_name: form.first_name, last_name: form.last_name, phone: form.phone } },
    })
    if (authErr) { setError(authErr.message); setSaving(false); return }

    const userId = authData.user?.id
    if (!userId) { setError('Could not create user. Try again.'); setSaving(false); return }

    let warning = ''
    if (!authData.session) {
      // Email confirmation is on: no session yet, so the extra details
      // can't be written as the patient. The account itself still exists.
      warning = 'The account was created, but the patient must confirm their email before the extra details (address, medical info) can be saved. Add them later from the patient\'s profile.'
    } else {
      const { error: profErr } = await client.from('profiles')
        .update({
          first_name: form.first_name, last_name: form.last_name,
          phone: form.phone || null,
          date_of_birth: form.date_of_birth || null,
          gender: form.gender || null,
        })
        .eq('id', userId)

      const { error: patErr } = await client.from('patient_profiles')
        .update({
          birth_year: form.date_of_birth ? new Date(form.date_of_birth).getFullYear() : null,
          blood_type: form.blood_type || null,
          medical_history: form.medical_history || null,
          allergies: form.allergies ? [form.allergies] : [],
          current_medications: form.current_medications ? [form.current_medications] : [],
          emergency_contact_name: form.emergency_contact_name,
          emergency_contact_relationship: form.emergency_contact_relationship,
          emergency_contact_phone: form.emergency_contact_phone,
          address: form.address, city: form.city,
          province: form.province, postal_code: form.postal_code,
          country: 'Philippines',
        })
        .eq('user_id', userId)

      if (profErr || patErr) {
        warning = `The account was created, but some details were not saved: ${(profErr || patErr).message}`
      }
      await client.auth.signOut({ scope: 'local' })
    }

    setSaving(false)
    setDone({ email: form.email, tempPassword, warning })
  }

  function copyCredentials() {
    navigator.clipboard.writeText(`Email: ${done.email}\nTemporary password: ${done.tempPassword}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center max-w-md mx-auto">
        <div className="w-20 h-20 bg-bhw-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-bhw-600"/>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Patient Registered!</h2>
        {done.warning && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-3 rounded-xl text-left">{done.warning}</div>
        )}
        <div className="card w-full text-left space-y-2">
          <p className="text-sm text-gray-500">Give these login details to the patient. The password is shown only once.</p>
          <p className="text-sm"><span className="text-gray-500">Email:</span> <span className="font-semibold">{done.email}</span></p>
          <p className="text-sm"><span className="text-gray-500">Temporary password:</span> <span className="font-mono font-semibold">{done.tempPassword}</span></p>
          <button onClick={copyCredentials} className="btn-outline w-full">
            <Copy className="w-4 h-4"/> {copied ? 'Copied!' : 'Copy login details'}
          </button>
        </div>
        <button onClick={() => navigate('/bhw/patients')} className="btn-primary-bhw w-full">Go to patient list</button>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 transition-all">
          <ChevronLeft className="w-5 h-5 text-gray-600"/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Register Patient</h1>
          <p className="text-sm text-gray-500">Step {step} of 3</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2">
        {[1, 2, 3].map(s => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-bhw-600' : 'bg-gray-200'}`}/>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {step === 1 && (
        <div className="card space-y-4">
          <p className="font-semibold text-gray-800 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-bhw-600"/> Personal Information
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" {...fieldProps('first_name')} required placeholder="Juan"/>
            <Field label="Last Name" {...fieldProps('last_name')}  required placeholder="Dela Cruz"/>
          </div>
          <Field label="Email" {...fieldProps('email')} type="email" required placeholder="juan@email.com"/>
          <Field label="Phone" {...fieldProps('phone')} type="tel" placeholder="+63 9XX XXX XXXX"/>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date of Birth" {...fieldProps('date_of_birth')} type="date"/>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Gender</label>
              <select value={form.gender} onChange={e => set('gender', e.target.value)} className="input mt-1">
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Blood Type</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {BLOOD_TYPES.map(bt => (
                <button key={bt} type="button"
                  onClick={() => set('blood_type', form.blood_type === bt ? '' : bt)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    form.blood_type === bt
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                  }`}>
                  {bt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-4">
          <p className="font-semibold text-gray-800">Address & Emergency Contact</p>
          <Field label="Street Address" {...fieldProps('address')} placeholder="123 Rizal St."/>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Barangay / City" {...fieldProps('city')} placeholder="Panicuason"/>
            <Field label="Province" {...fieldProps('province')} placeholder="Camarines Norte"/>
          </div>
          <Field label="Postal Code" {...fieldProps('postal_code')} placeholder="4600"/>
          <hr className="border-gray-100"/>
          <p className="font-semibold text-gray-800 text-sm">Emergency Contact</p>
          <Field label="Name" {...fieldProps('emergency_contact_name')}         placeholder="Maria Dela Cruz"/>
          <Field label="Relationship" {...fieldProps('emergency_contact_relationship')} placeholder="Spouse"/>
          <Field label="Phone" {...fieldProps('emergency_contact_phone')}        placeholder="+63 9XX XXX XXXX"/>
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-4">
          <p className="font-semibold text-gray-800">Medical Background</p>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Medical History</label>
            <textarea rows={3} value={form.medical_history}
              onChange={e => set('medical_history', e.target.value)}
              placeholder="Known conditions, past surgeries, hospitalizations..."
              className="input mt-1 resize-none"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Allergies</label>
            <textarea rows={2} value={form.allergies}
              onChange={e => set('allergies', e.target.value)}
              placeholder="Drug allergies, food allergies..."
              className="input mt-1 resize-none"/>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Medications</label>
            <textarea rows={2} value={form.current_medications}
              onChange={e => set('current_medications', e.target.value)}
              placeholder="List of current medications..."
              className="input mt-1 resize-none"/>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {step > 1 && (
          <button onClick={() => setStep(s => s - 1)}
            className="flex-1 btn-outline">
            Back
          </button>
        )}
        {step < 3 ? (
          <button onClick={() => setStep(s => s + 1)}
            className="flex-1 btn-primary-bhw">
            Next →
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 btn-primary-bhw disabled:opacity-60">
            {saving ? 'Registering...' : 'Register Patient'}
          </button>
        )}
      </div>
    </div>
  )
}
