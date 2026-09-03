import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = 'https://dlncseadirjiwdnvjyok.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsbmNzZWFkaXJqaXdkbnZqeW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NzY2ODEsImV4cCI6MjA5NDQ1MjY4MX0.jj6rH0rb3P5BDVNU9GyMAV2KFX9M8OSEdD4nPnZtLjU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// Checks an email/password pair against Supabase Auth WITHOUT creating a
// session on the shared `supabase` client — used for admin 2-step login,
// where the password must be confirmed before an email code is sent, but
// the app shouldn't treat the user as signed in until that code is also
// verified. Calling supabase.auth.signInWithPassword() directly would
// immediately establish a real session (AuthContext listens for exactly
// that via onAuthStateChange), so this hits the Auth REST endpoint
// directly instead and simply discards whatever token comes back.
export async function verifyPasswordOnly(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: data.error_description || data.msg || 'Invalid email or password.' }
  }
  return { ok: true, accessToken: data.access_token, userId: data.user?.id }
}

// Looks up an authenticated-but-not-yet-signed-in user's real, current role
// straight from `profiles`, using the throwaway token from
// verifyPasswordOnly (never touches the shared client). This is what
// decides whether the admin 2-step flow applies — checked by ACCOUNT role,
// not by which portal tab the form was submitted from, so an admin can't
// skip the code by logging in via Patient/Doctor/BHW instead of Admin.
export async function fetchRoleForUser(accessToken, userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=role&id=eq.${userId}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const rows = await res.json().catch(() => [])
  return rows?.[0]?.role ?? null
}
