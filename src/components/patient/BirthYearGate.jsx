import React, { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const CURRENT_YEAR   = new Date().getFullYear()
const MIN_BIRTH_YEAR = CURRENT_YEAR - 120

function validateBirthYear(value) {
  if (!/^\d{4}$/.test(value)) return 'Enter exactly 4 digits.'
  const year = parseInt(value, 10)
  if (year < MIN_BIRTH_YEAR || year > CURRENT_YEAR) {
    return `Enter a year between ${MIN_BIRTH_YEAR} and ${CURRENT_YEAR}.`
  }
  return ''
}

// Blocks the patient portal until the signed-in patient has a birth_year on
// file. Fresh registrants already supplied it on the sign-up form (carried
// in auth user_metadata) — for them this persists it quietly, once, with no
// prompt. Only accounts that predate this feature and have no birth_year
// anywhere ever see the modal, satisfying "prompt existing patients on next
// login" without re-interrupting every session afterward.
export default function BirthYearGate() {
  const { user, profile } = useAuth()
  const [status, setStatus] = useState('checking') // checking | ok | needed
  const [value,  setValue]  = useState('')
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (!user || profile?.role !== 'patient') { setStatus('ok'); return }

      const { data } = await supabase
        .from('patient_profiles')
        .select('birth_year')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return
      if (data?.birth_year) { setStatus('ok'); return }

      const metaYear = user.user_metadata?.birth_year
      if (metaYear && validateBirthYear(String(metaYear)) === '') {
        const { error: upsertErr } = await supabase
          .from('patient_profiles')
          .upsert({ user_id: user.id, birth_year: parseInt(metaYear, 10) }, { onConflict: 'user_id' })
        if (!cancelled) setStatus(upsertErr ? 'needed' : 'ok')
        return
      }

      setStatus('needed')
    }

    setStatus('checking')
    check()
    return () => { cancelled = true }
  }, [user, profile])

  async function handleSave(e) {
    e.preventDefault()
    const validationError = validateBirthYear(value)
    if (validationError) { setError(validationError); return }
    setSaving(true); setError('')

    const { error: upsertErr } = await supabase
      .from('patient_profiles')
      .upsert({ user_id: user.id, birth_year: parseInt(value, 10) }, { onConflict: 'user_id' })

    setSaving(false)
    if (upsertErr) { setError('Could not save your birth year. Please try again.'); return }
    setStatus('ok')
  }

  if (status !== 'needed') return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full">
        <div className="w-14 h-14 bg-patient-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-7 h-7 text-patient-600"/>
        </div>
        <h2 className="text-xl font-bold text-gray-900 text-center mb-1">One quick thing</h2>
        <p className="text-gray-500 text-sm text-center mb-5">
          Please confirm your birth year to keep your account up to date.
        </p>
        <form onSubmit={handleSave} className="space-y-3">
          <input
            inputMode="numeric" autoFocus maxLength={4} placeholder="e.g., 1998"
            value={value}
            onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="input text-center text-lg tracking-widest"
          />
          {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary-patient w-full">
            {saving ? 'Saving...' : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
