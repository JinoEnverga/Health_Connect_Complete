import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Cross } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isDoctor = params.get('role') === 'doctor'
  const { signIn, profile } = useAuth()
  const [form, setForm] = useState({ email: '', password: '', remember: false })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await signIn(form.email, form.password)
      // After sign-in AuthContext will update profile; redirect via RoleRedirect
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-4 ${isDoctor ? 'bg-gradient-to-br from-doctor-50 via-white to-emerald-50' : 'bg-gradient-to-br from-patient-50 via-white to-blue-50'}`}>
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ${isDoctor ? 'bg-doctor-600' : 'bg-patient-600'}`}>
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-white" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900">HealthConnect</h1>
        <p className="text-gray-500 mt-1">{isDoctor ? 'Doctor Portal' : 'Patient Portal'}</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
        <p className="text-gray-500 text-sm mb-6">Sign in to access your health portal</p>

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
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              </span>
              <input
                type="email" required placeholder="demo@healthconnect.ph"
                value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                className="input pl-10"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-gray-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
              </span>
              <input
                type={showPw ? 'text' : 'password'} required placeholder="••••••••"
                value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                className="input pl-10 pr-10"
              />
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
                className="w-4 h-4 accent-patient-600 rounded"/>
              <span className="text-sm text-gray-600">Remember me</span>
            </label>
            <a href="#" className="text-sm text-patient-600 hover:underline font-medium">Forgot password?</a>
          </div>

          <button type="submit" disabled={loading}
            className={`w-full mt-2 ${isDoctor ? 'btn-primary-doctor' : 'btn-primary-patient'}`}>
            {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/> : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account?{' '}
          <Link to={isDoctor ? '/register?role=doctor' : '/register'}
            className={`font-semibold hover:underline ${isDoctor ? 'text-doctor-600' : 'text-patient-600'}`}>
            Create account
          </Link>
        </p>
      </div>

      {/* Toggle between portals */}
      <div className="mt-6 text-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-4">
          {isDoctor ? (
            <>
              <p className="text-sm text-gray-500 mb-2">Are you a patient?</p>
              <Link to="/login"
                className="inline-flex items-center gap-2 bg-patient-600 hover:bg-patient-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                Patient Portal Sign In
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-2">Are you a healthcare provider?</p>
              <Link to="/login?role=doctor"
                className="inline-flex items-center gap-2 bg-doctor-600 hover:bg-doctor-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-all text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
                Doctor / Doctor Portal Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
