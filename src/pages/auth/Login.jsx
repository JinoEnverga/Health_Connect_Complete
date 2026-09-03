import React, { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, User, Stethoscope, Shield, ShieldCheck, Mail, ArrowLeft } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, verifyPasswordOnly } from '../../lib/supabase'

const PORTALS = [
  {
    role: 'patient', label: 'Patient Portal',
    icon: User, bg: 'bg-patient-600', hover: 'hover:bg-patient-700',
    activeBorder: 'border-patient-300 bg-patient-50',
    gradient: 'from-patient-50 via-white to-blue-50',
    inputClass: 'focus:ring-patient-500',
  },
  {
    role: 'doctor', label: 'Doctor Portal',
    icon: Stethoscope, bg: 'bg-doctor-600', hover: 'hover:bg-doctor-700',
    activeBorder: 'border-doctor-300 bg-doctor-50',
    gradient: 'from-doctor-50 via-white to-emerald-50',
    inputClass: 'focus:ring-doctor-500',
  },
  {
    role: 'bhw', label: 'BHW Portal',
    icon: Shield, bg: 'bg-bhw-600', hover: 'hover:bg-bhw-700',
    activeBorder: 'border-bhw-300 bg-bhw-50',
    gradient: 'from-bhw-50 via-white to-teal-50',
    inputClass: 'focus:ring-bhw-500',
  },
  {
    role: 'admin', label: 'Admin Portal',
    icon: ShieldCheck, bg: 'bg-admin-600', hover: 'hover:bg-admin-700',
    activeBorder: 'border-admin-300 bg-admin-50',
    gradient: 'from-admin-50 via-white to-green-50',
    inputClass: 'focus:ring-admin-500',
  },
]

const RESEND_COOLDOWN_S = 30

export default function Login() {
  const navigate    = useNavigate()
  const [params]    = useSearchParams()
  const { signIn }  = useAuth()

  const currentRole  = PORTALS.find(p => p.role === params.get('role')) ?? PORTALS[0]
  const isAdminPortal = currentRole.role === 'admin'

  const [form, setForm] = useState({ email: '', password: '', remember: false })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // Admin 2-step: 'credentials' (email+password) -> 'otp' (email code).
  // Only the OTP step actually creates a session — see verifyPasswordOnly's
  // comment in src/lib/supabase.js for why the password check itself
  // doesn't touch the shared Supabase client.
  const [stage, setStage]   = useState('credentials')
  const [otp, setOtp]       = useState('')
  const [otpError, setOtpError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownTimer = useRef(null)

  useEffect(() => () => clearInterval(cooldownTimer.current), [])

  function startResendCooldown() {
    setResendCooldown(RESEND_COOLDOWN_S)
    cooldownTimer.current = setInterval(() => {
      setResendCooldown(s => {
        if (s <= 1) { clearInterval(cooldownTimer.current); return 0 }
        return s - 1
      })
    }, 1000)
  }

  async function sendAdminCode() {
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: form.email,
      options: { shouldCreateUser: false },
    })
    if (otpErr) throw otpErr
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (isAdminPortal) {
        const check = await verifyPasswordOnly(form.email, form.password)
        if (!check.ok) { setError(check.error); return }
        await sendAdminCode()
        setStage('otp')
        startResendCooldown()
      } else {
        await signIn(form.email, form.password)
        navigate('/')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setVerifying(true); setOtpError('')
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: form.email, token: otp, type: 'email',
      })
      if (verifyErr) throw verifyErr
      navigate('/')
    } catch (err) {
      setOtpError(err.message || 'Invalid or expired code.')
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setOtpError('')
    try {
      await sendAdminCode()
      startResendCooldown()
    } catch (err) {
      setOtpError(err.message)
    }
  }

  const Icon = currentRole.icon

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br ${currentRole.gradient}`}>
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ${currentRole.bg}`}>
          <Icon className="w-8 h-8 text-white"/>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">HealthConnect</h1>
        <p className="text-gray-500 mt-1">{currentRole.label}</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        {stage === 'credentials' ? (
          <>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
            <p className="text-gray-500 text-sm mb-6">
              {isAdminPortal ? "Sign in — you'll also need a code we email you" : 'Sign in to access your health portal'}
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <div className="relative">
                  <span className="absolute left-3 top-3.5 text-gray-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                    </svg>
                  </span>
                  <input type="email" required placeholder="demo@healthconnect.ph"
                    value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                    className="input pl-10"/>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <span className="absolute left-3 top-3.5 text-gray-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                    </svg>
                  </span>
                  <input type={showPw ? 'text' : 'password'} required placeholder="••••••••"
                    value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                    className="input pl-10 pr-10"/>
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.remember}
                    onChange={e => setForm({...form, remember: e.target.checked})}
                    className="w-4 h-4 rounded"/>
                  <span className="text-sm text-gray-600">Remember me</span>
                </label>
                <a href="#" className="text-sm text-patient-600 hover:underline font-medium">Forgot password?</a>
              </div>

              <button type="submit" disabled={loading}
                className={`w-full mt-2 py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${currentRole.bg} ${currentRole.hover}`}>
                {loading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                  : (isAdminPortal ? 'Continue' : 'Sign In')}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-6">
              Don't have an account?{' '}
              <Link to="/register" className="font-semibold hover:underline text-patient-600">
                Create account
              </Link>
            </p>
          </>
        ) : (
          <>
            <button onClick={() => { setStage('credentials'); setOtp(''); setOtpError('') }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
              <ArrowLeft className="w-4 h-4"/> Back
            </button>

            <div className="w-14 h-14 bg-admin-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Mail className="w-7 h-7 text-admin-600"/>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1 text-center">Check your email</h2>
            <p className="text-gray-500 text-sm mb-6 text-center">
              We sent a verification code to <strong>{form.email}</strong>
            </p>

            {otpError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
                {otpError}
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 text-center">Verification Code</label>
                <input
                  inputMode="numeric" autoFocus maxLength={6} placeholder="••••••"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="input text-center text-2xl tracking-[0.5em] font-bold"/>
              </div>

              <button type="submit" disabled={verifying || otp.length < 6}
                className={`w-full py-3 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${currentRole.bg} ${currentRole.hover} disabled:opacity-50`}>
                {verifying
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                  : 'Verify & Sign In'}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-5">
              Didn't get it?{' '}
              <button onClick={handleResend} disabled={resendCooldown > 0}
                className="font-semibold text-admin-600 hover:underline disabled:opacity-50 disabled:no-underline">
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </p>
          </>
        )}
      </div>

      {/* Portal switcher — 2 × 2 grid */}
      {stage === 'credentials' && (
        <div className="mt-6 w-full max-w-md">
          <p className="text-center text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">
            Sign in to a different portal
          </p>
          <div className="grid grid-cols-2 gap-3">
            {PORTALS.map(p => {
              const PIcon   = p.icon
              const active  = p.role === currentRole.role
              return (
                <Link key={p.role}
                  to={p.role === 'patient' ? '/login' : `/login?role=${p.role}`}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 transition-all ${
                    active
                      ? `${p.activeBorder} border-2`
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                  }`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${p.bg}`}>
                    <PIcon className="w-4 h-4 text-white"/>
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-bold truncate ${active ? 'text-gray-900' : 'text-gray-600'}`}>
                      {p.label}
                    </p>
                    {active && <p className="text-xs text-gray-400">Current</p>}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
