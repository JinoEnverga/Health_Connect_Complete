import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Shared helpers for the BHW portal.

const clean = v => {
  const s = (v ?? '').toString().trim()
  return s && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined' ? s : ''
}

// "Juan Luna" — or, when names are missing / "null", the email's username,
// or "Unnamed Patient". Never "null null".
export function patientName(prof) {
  const full = [clean(prof?.first_name), clean(prof?.last_name)].filter(Boolean).join(' ')
  if (full) return full
  const user = clean(prof?.email).split('@')[0]
  return user || 'Unnamed Patient'
}

// Two-letter initials from the same name the row shows.
export function patientInitials(prof) {
  const name = patientName(prof)
  if (name === 'Unnamed Patient') return 'P'
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase() || 'P'
}

export const barangayOf = p => clean(p?.city)

/**
 * Registered patients (real patients only — sign-up also creates
 * patient_profiles rows for BHW/admin accounts, and a BHW always sees their
 * own row). Newest first.
 */
export function usePatients(columns = 'user_id, city, blood_type, created_at') {
  const [patients, setPatients] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error: err } = await supabase
      .from('patient_profiles')
      .select(`${columns}, profiles!inner(first_name, last_name, email, phone, role)`)
      .eq('profiles.role', 'patient')
      .order('created_at', { ascending: false })
    if (err) setError(`Could not load patients: ${err.message}`)
    setPatients(data || [])
    setLoading(false)
  }, [columns])

  useEffect(() => { load() }, [load])
  return { patients, loading, error, reload: load }
}
