// Agora video calling — shared with the mobile app (same Agora project).
//
// The App ID is public by design (like the Supabase anon key). The App
// Certificate is secret: it lives only in the `agora-token` Edge Function,
// which issues a short-lived token per call (see fetchAgoraToken below).
export const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || '4f62a0f5e5d14354a84bd84798bdb0be'

// Channel naming contract agreed with mobile:
//   'consult_' || consultation_sessions.room_id
export const agoraChannelFor = roomId => (roomId ? `consult_${roomId}` : null)

/**
 * Ask the `agora-token` Edge Function (supabase/functions/agora-token) for a
 * token for this appointment's call. Same contract as the mobile app.
 *
 * Returns { token, channel }. If the function isn't deployed yet (404) it
 * returns { token: null, channel: null } so the caller can fall back to
 * joining with the App ID alone (only works while the Agora project is in
 * testing mode). Throws an Error with a readable message on 401 / 403 /
 * other failures.
 */
export async function fetchAgoraToken(supabase, appointmentId) {
  const { data, error } = await supabase.functions.invoke('agora-token', {
    body: { appointment_id: appointmentId },
  })
  if (!error) {
    if (!data?.token || !data?.channel) throw new Error('The video server returned an incomplete answer.')
    return { token: data.token, channel: data.channel }
  }

  const res = error.context // the HTTP response, for FunctionsHttpError
  const status = res?.status
  // 404 = not deployed. No status = the request never got a readable answer
  // (offline, or the browser blocked a "not found" reply without CORS
  // headers): try joining without a token — if the network is really down,
  // the join itself reports it.
  if (status === 404 || !status) return { token: null, channel: null }

  let message = ''
  try { message = (await res.json())?.error || '' } catch { /* not JSON */ }
  if (status === 401) throw new Error(message || 'Please sign in again to join the call.')
  if (status === 403) throw new Error(message || "You're not part of this consultation.")
  throw new Error(message || `The video server returned an error (${status}).`)
}
