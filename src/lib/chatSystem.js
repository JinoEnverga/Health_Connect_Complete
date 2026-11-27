import { supabase } from './supabase'

// System lines shared with the mobile app (mobile handoff, part A6). The text
// must match EXACTLY — the mobile app reads some of these lines (e.g. a line
// starting with 'Call ended' / 'Missed call' marks the end of a call, and the
// fee line IS the "booking accepted" state).
export const SYSTEM = {
  joined:          role => `The ${role} joined the call`,
  waiting:         role => `The ${role} is waiting for you to join`,
  left:            role => `The ${role} left the call`,
  consultationEnded: 'The consultation has ended',
  callEnded:       duration => `Call ended · ${duration}`,
  missedCall:      'Missed call · no answer',
}

export const FEE_PREFIX = 'Booking accepted · Consultation fee: '

// '45 sec' · '4 min 12 sec' · '4 min' · '1 hr 2 min'
export function formatCallDuration(totalSec) {
  const s = Math.max(0, Math.round(Number(totalSec) || 0))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h) return m ? `${h} hr ${m} min` : `${h} hr`
  if (m) return sec ? `${m} min ${sec} sec` : `${m} min`
  return `${sec} sec`
}

// '₱500.00' for PHP, otherwise '<CUR> 1,234.50'; null / 0 -> 'No fee'.
export function formatFee(amount, currency = 'PHP') {
  const n = Number(amount)
  if (!amount || !n) return 'No fee'
  const num = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (!currency || currency === 'PHP') ? `₱${num}` : `${currency} ${num}`
}

export const isFeeLine = msg => msg?.message_type === 'system' && typeof msg.content === 'string' && msg.content.startsWith(FEE_PREFIX)

const sessionIds = new Map() // appointment id -> consultation_sessions.id

async function sessionFor(appointmentId) {
  if (sessionIds.has(appointmentId)) return sessionIds.get(appointmentId)
  const { data, error } = await supabase.rpc('get_or_create_consultation_session', { p_appointment_id: appointmentId })
  if (error || !data?.id) throw new Error(error?.message || 'No consultation room for this appointment.')
  sessionIds.set(appointmentId, data.id)
  return data.id
}

/**
 * Post a system line in the appointment's chat, as the current user.
 * Skipped if the same text was posted in the last 10 seconds (there is no
 * unique key on chat_logs, so both apps de-duplicate this way).
 * Returns true if posted. Never throws — a missing chat line must not break
 * a call or a status change.
 */
export async function postSystemMessage(appointmentId, userId, text) {
  try {
    const sessionId = await sessionFor(appointmentId)
    const since = new Date(Date.now() - 10_000).toISOString()
    const { data: recent } = await supabase.from('chat_logs').select('id')
      .eq('session_id', sessionId).eq('content', text).gte('sent_at', since).limit(1)
    if (recent?.length) return false
    const { error } = await supabase.from('chat_logs').insert({
      id: crypto.randomUUID(), session_id: sessionId, sender_id: userId, message_type: 'system', content: text,
    })
    if (error) { console.warn('Could not post system message:', error.message); return false }
    return true
  } catch (e) {
    console.warn('Could not post system message:', e.message)
    return false
  }
}
