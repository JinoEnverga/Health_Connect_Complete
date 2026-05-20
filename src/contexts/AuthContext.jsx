import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const KNOWN_ROLES = ['patient', 'doctor', 'bhw', 'admin']

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user,         setUser]         = useState(null)
  const [profile,      setProfile]      = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [profileReady, setProfileReady] = useState(false)
  const fetchingId = useRef(null)

  async function fetchProfile(authUser) {
    // Deduplicate: don't start a second fetch for the same user
    if (fetchingId.current === authUser.id) return
    fetchingId.current = authUser.id

    try {
      // Race against a timeout so a slow/hung network never blocks the UI
      const { data } = await Promise.race([
        supabase.from('profiles').select('*').eq('id', authUser.id).single(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 7000)
        ),
      ])

      if (fetchingId.current !== authUser.id) return // user changed mid-fetch

      if (data && KNOWN_ROLES.includes(data.role)) {
        setProfile(data)
      } else {
        // Fallback to role in Supabase Auth metadata (set at sign-up)
        const metaRole = authUser.user_metadata?.role
        if (data) {
          setProfile({ ...data, role: metaRole ?? data.role })
        } else if (metaRole) {
          // No profile row yet — use a minimal object so routing works
          setProfile({ id: authUser.id, role: metaRole })
        }
      }
    } catch (err) {
      // Network error or timeout: fall back to auth metadata so the app is usable
      if (fetchingId.current === authUser.id) {
        const metaRole = authUser.user_metadata?.role
        if (metaRole) setProfile({ id: authUser.id, role: metaRole })
      }
    } finally {
      // profileReady is set unconditionally — the spinner ALWAYS clears
      if (fetchingId.current === authUser.id) {
        fetchingId.current = null
        setProfileReady(true)
      }
    }
  }

  async function updateProfile(updates) {
    if (!user) return
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    if (!error && data) setProfile(prev => ({ ...prev, ...data }))
    return { data, error }
  }

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION almost immediately on mount.
    // We clear the loading gate right away (no awaiting) so the UI never
    // blocks on the session check. profileReady is cleared separately and
    // only unblocks per-route rendering once the profile fetch finishes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const u = session?.user ?? null
        setUser(u)
        setLoading(false) // unblock immediately on first event

        if (!u) {
          setProfile(null)
          setProfileReady(true)
          fetchingId.current = null
          return
        }

        if (event === 'TOKEN_REFRESHED') return // token only, no profile re-fetch

        // INITIAL_SESSION, SIGNED_IN, USER_UPDATED → fetch profile in background
        setProfileReady(false)
        fetchingId.current = null // ensure re-fetch on new sign-in
        fetchProfile(u)           // fire-and-forget; finally block sets profileReady
      }
    )

    // Absolute safety net: if something goes wrong with the Supabase client
    // itself (e.g. bad env vars, CORS), unblock the UI after 10 s so the user
    // sees an error page rather than a permanent blank spinner.
    const safety = setTimeout(() => {
      setLoading(false)
      setProfileReady(true)
    }, 10_000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(safety)
    }
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signUp(email, password, role = 'patient', extraData = {}) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { role, ...extraData } },
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setProfileReady(false)
    fetchingId.current = null
  }

  async function refreshProfile() {
    if (user) {
      setProfileReady(false)
      fetchingId.current = null
      await fetchProfile(user)
    }
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading, profileReady,
      signIn, signUp, signOut, refreshProfile, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
