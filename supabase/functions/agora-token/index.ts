// Supabase Edge Function: agora-token
//
// Issues a short-lived Agora RTC token for one consultation's video call,
// only to that appointment's doctor or patient. Shared by the web portal and
// the mobile app (contract agreed with the mobile team, Nov 2026):
//
//   POST /functions/v1/agora-token
//   Authorization: Bearer <user's Supabase access token>
//   { "appointment_id": "<uuid>" }
//
//   200 { "token": "...", "channel": "consult_<room_id>", "expires_in": 3600 }
//   400 bad request · 401 not signed in · 403 not your appointment
//   500 not configured / unexpected error
//
// Token: uid 0 (valid for any uid — both apps let Agora assign one),
// role publisher, channel 'consult_' || consultation_sessions.room_id.
//
// Secrets (set with `supabase secrets set`, never in either app):
//   AGORA_APP_ID, AGORA_APP_CERTIFICATE
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase automatically.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import agoraToken from 'npm:agora-token@2.0.7'

const { RtcTokenBuilder, RtcRole } = agoraToken

const TOKEN_TTL_SECONDS = 3600
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The web portal calls this from the browser, so it needs CORS.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

  const appId       = Deno.env.get('AGORA_APP_ID')
  const certificate = Deno.env.get('AGORA_APP_CERTIFICATE')
  if (!appId || !certificate) {
    return json(500, { error: 'Video calls are not configured on the server yet.' })
  }

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'Please sign in again.' })

  let appointmentId: unknown
  try {
    appointmentId = (await req.json())?.appointment_id
  } catch {
    return json(400, { error: 'Send a JSON body with appointment_id.' })
  }
  if (typeof appointmentId !== 'string' || !UUID_RE.test(appointmentId)) {
    return json(400, { error: 'appointment_id must be a UUID.' })
  }

  // Act as the caller, so the database's own checks apply.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )

  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData?.user) return json(401, { error: 'Please sign in again.' })

  // Raises "Not your appointment." (42501) unless the caller is this
  // appointment's doctor or patient; creates the room on first use.
  const { data: session, error: rpcErr } = await supabase
    .rpc('get_or_create_consultation_session', { p_appointment_id: appointmentId })
  if (rpcErr) {
    if (rpcErr.code === '42501') return json(403, { error: "You're not part of this consultation." })
    console.error('get_or_create_consultation_session failed:', rpcErr)
    return json(500, { error: 'Could not open the consultation room.' })
  }
  if (!session?.room_id) return json(500, { error: 'Could not open the consultation room.' })

  const channel = `consult_${session.room_id}`
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId, certificate, channel, 0, RtcRole.PUBLISHER, TOKEN_TTL_SECONDS, TOKEN_TTL_SECONDS,
  )

  return json(200, { token, channel, expires_in: TOKEN_TTL_SECONDS })
})
