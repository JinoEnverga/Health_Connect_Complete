import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import TelemedicineLogo from '../../components/TelemedicineLogo'

// Public sign-up is for patients only. Doctor, BHW and admin accounts are
// created by the administrator (the database ignores a role chosen at
// sign-up anyway — see 017_mobile_contract_part_c.sql, handle_new_user).

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

const label = 'block text-sm font-medium text-gray-700 mb-1'
const field = 'input py-2.5'

function PasswordInput({ id, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} required placeholder={placeholder}
        autoComplete={autoComplete} value={value} onChange={onChange}
        className={`${field} pr-10`}/>
      <button type="button" onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
      </button>
    </div>
  )
}

export default function Register() {
  const { signUp } = useAuth()
  const navigate   = useNavigate()

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', confirm: '', birthYear: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    const birthYearError = validateBirthYear(form.birthYear)
    if (birthYearError) { setError(birthYearError); return }
    setLoading(true); setError('')
    try {
      const data = await signUp(form.email, form.password, 'patient', {
        first_name: form.firstName,
        last_name:  form.lastName,
        birth_year: parseInt(form.birthYear, 10),
      })
      // With email confirmation off, Supabase signs the user in right away —
      // go straight to their portal instead of a misleading "check your
      // email" screen. With it on there's no session yet, so show that.
      if (data?.session) navigate('/')
      else setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

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
    <div className="min-h-screen bg-gradient-to-br from-patient-50 via-white to-blue-50 flex flex-col items-center justify-center px-4 py-6">
      <div className="mb-4 text-center">
        <TelemedicineLogo className="w-14 h-14 mx-auto mb-2.5 shadow-lg rounded-2xl"/>
        <h1 className="text-2xl font-bold text-gray-900">HealthConnect</h1>
        <p className="text-gray-500 text-sm">Patient Registration</p>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 sm:p-7 border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900">Create your account</h2>
        <p className="text-gray-500 text-sm mb-4">Join HealthConnect as a patient</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="reg-first" className={label}>First Name</label>
              <input id="reg-first" required placeholder="Juan" autoComplete="given-name"
                value={form.firstName} onChange={set('firstName')} className={field}/>
            </div>
            <div>
              <label htmlFor="reg-last" className={label}>Last Name</label>
              <input id="reg-last" required placeholder="Dela Cruz" autoComplete="family-name"
                value={form.lastName} onChange={set('lastName')} className={field}/>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="reg-year" className={label}>Birth Year</label>
              <input id="reg-year" required inputMode="numeric" autoComplete="off" placeholder="e.g., 1998"
                maxLength={4} value={form.birthYear}
                onChange={e => setForm(f => ({ ...f, birthYear: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                className={field}/>
              <p className="text-xs text-gray-400 mt-1">4 digits (used to unlock e-prescriptions)</p>
            </div>
            <div>
              <label htmlFor="reg-email" className={label}>Email Address</label>
              <input id="reg-email" type="email" required placeholder="you@example.com" autoComplete="email"
                value={form.email} onChange={set('email')} className={field}/>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="reg-pw" className={label}>Password</label>
              <PasswordInput id="reg-pw" placeholder="At least 8 characters" autoComplete="new-password"
                value={form.password} onChange={set('password')}/>
            </div>
            <div>
              <label htmlFor="reg-confirm" className={label}>Confirm Password</label>
              <PasswordInput id="reg-confirm" placeholder="Repeat password" autoComplete="new-password"
                value={form.confirm} onChange={set('confirm')}/>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 mt-1 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 bg-patient-600 hover:bg-patient-700 disabled:opacity-70">
            {loading
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold hover:underline text-patient-600">Sign in</Link>
        </p>
      </div>
      <p className="text-center text-xs text-gray-400 mt-3 max-w-lg">
        Healthcare provider or BHW? Contact your system administrator for account access.
      </p>
    </div>
  )
}
