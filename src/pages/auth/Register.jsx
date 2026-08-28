import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const ROLES = [
  { value: 'patient', label: '🧑 Patient',  active: 'bg-patient-600 text-white shadow', text: 'text-patient-600' },
  { value: 'doctor',  label: '👨‍⚕️ Doctor',   active: 'bg-doctor-600 text-white shadow',  text: 'text-doctor-600' },
  { value: 'bhw',     label: '🛡️ BHW',       active: 'bg-bhw-600 text-white shadow',     text: 'text-bhw-600' },
]

const ACCENT = {
  patient: { btn: 'bg-patient-600 hover:bg-patient-700', link: 'text-patient-600', gradient: 'from-patient-50 via-white to-blue-50',    label: 'Patient Portal' },
  doctor:  { btn: 'bg-doctor-600 hover:bg-doctor-700',   link: 'text-doctor-600',  gradient: 'from-doctor-50 via-white to-emerald-50',  label: 'Doctor Portal' },
  bhw:     { btn: 'bg-bhw-600 hover:bg-bhw-700',         link: 'text-bhw-600',     gradient: 'from-bhw-50 via-white to-teal-50',        label: 'BHW Portal' },
}

// Chronologically valid range for a birth year: no earlier than a very
// generous human lifespan, and never later than the current year.
const CURRENT_YEAR = new Date().getFullYear()
const MIN_BIRTH_YEAR = CURRENT_YEAR - 120

function validateBirthYear(value) {
  if (!/^\d{4}$/.test(value)) return 'Birth year must be exactly 4 digits.'
  const year = parseInt(value, 10)
  if (year < MIN_BIRTH_YEAR || year > CURRENT_YEAR) {
    return `Birth year must be between ${MIN_BIRTH_YEAR} and ${CURRENT_YEAR}.`
  }
  return ''
}

export default function Register() {
  const [params] = useSearchParams()
  const { signUp } = useAuth()
  const defaultRole = ROLES.find(r => r.value === params.get('role'))?.value ?? 'patient'

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', confirm: '',
    birthYear: '', role: defaultRole,
  })
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.role === 'patient') {
      const birthYearError = validateBirthYear(form.birthYear)
      if (birthYearError) { setError(birthYearError); return }
    }
    setLoading(true); setError('')
    try {
      await signUp(form.email, form.password, form.role, {
        first_name: form.firstName,
        last_name:  form.lastName,
        ...(form.role === 'patient' ? { birth_year: parseInt(form.birthYear, 10) } : {}),
      })
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const a = ACCENT[form.role] ?? ACCENT.patient

  if (success) return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your email!</h2>
        <p className="text-gray-500 mb-6">
          We sent a confirmation link to <strong>{form.email}</strong>. Click the link to activate your account.
        </p>
        <Link to="/login" className="btn-primary-patient w-full block text-center">Back to Sign In</Link>
      </div>
    </div>
  )

  return (
    <div className={`min-h-screen bg-gradient-to-br ${a.gradient} flex flex-col items-center justify-center px-4 py-10`}>
      <div className="mb-6 text-center">
        <div className={`w-14 h-14 ${a.btn.split(' ')[0]} rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg`}>
          <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-white" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">HealthConnect</h1>
        <p className="text-gray-500 text-sm">{a.label}</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Create your account</h2>
        <p className="text-gray-500 text-sm mb-5">Join HealthConnect today</p>

        {/* Role Toggle */}
        <div className="flex gap-2 bg-gray-100 rounded-xl p-1 mb-5">
          {ROLES.map(r => (
            <button key={r.value} type="button"
              onClick={() => setForm({...form, role: r.value})}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                form.role === r.value ? r.active : 'text-gray-500 hover:text-gray-700'
              }`}>
              {r.label}
            </button>
          ))}
        </div>

        {form.role === 'bhw' && (
          <div className="bg-bhw-50 border border-bhw-100 rounded-xl px-4 py-3 text-sm text-bhw-700 mb-4 flex items-start gap-2">
            <span className="shrink-0 mt-0.5">ℹ️</span>
            <span>BHW accounts require admin approval before you can access the portal.</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input required placeholder="Juan" value={form.firstName}
                onChange={e => setForm({...form, firstName: e.target.value})}
                className="input"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input required placeholder="dela Cruz" value={form.lastName}
                onChange={e => setForm({...form, lastName: e.target.value})}
                className="input"/>
            </div>
          </div>

          {form.role === 'patient' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Birth Year</label>
              <input required inputMode="numeric" autoComplete="off" placeholder="e.g., 1998"
                maxLength={4} value={form.birthYear}
                onChange={e => setForm({...form, birthYear: e.target.value.replace(/\D/g, '').slice(0, 4)})}
                className="input"/>
              <p className="text-xs text-gray-400 mt-1">4 digits, e.g. 1998. Required for your patient profile.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input type="email" required placeholder="you@example.com" value={form.email}
              onChange={e => setForm({...form, email: e.target.value})}
              className="input"/>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} required placeholder="At least 8 characters"
                value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                className="input pr-10"/>
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input type="password" required placeholder="Repeat password"
              value={form.confirm} onChange={e => setForm({...form, confirm: e.target.value})}
              className="input"/>
          </div>

          <button type="submit" disabled={loading}
            className={`w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${a.btn}`}>
            {loading
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          Already have an account?{' '}
          <Link to="/login" className={`font-semibold hover:underline ${a.link}`}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
