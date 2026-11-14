import { supabase, SUPABASE_URL, SUPABASE_ANON } from './supabase'

// Call history (panel item #2). The server keeps the actual state machine —
// see log_call_event in supabase/sql/012_call_history_and_chat.sql:
//   'start'  → I opened the call (first in = initiated, second = joined)
//   'leave'  → I hung up / left (before an answer = cancelled, after = ended)
//   'failed' → my connection failed (logged, doesn't end the call)
export async function logCallEvent(appointmentId, event, detail = null) {
  const { data, error } = await supabase.rpc('log_call_event', {
    p_appointment_id: appointmentId, p_event: event, p_detail: detail,
  })
  if (error) console.warn(`Could not log call event "${event}":`, error.message)
  return data
}

// For tab close / reload: a normal request is cancelled when the page
// unloads, so send the 'leave' with keepalive. The access token has to be
// captured beforehand because nothing async can run during unload.
export function logCallLeaveOnUnload(appointmentId, accessToken) {
  if (!accessToken) return
  try {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/log_call_event`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ p_appointment_id: appointmentId, p_event: 'leave', p_detail: 'Closed the page' }),
    })
  } catch { /* best effort — the server closes stale calls on the next start */ }
}
