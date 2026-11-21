// Agora video calling — shared with the mobile app (same Agora project).
//
// The App ID is public by design (like the Supabase anon key). The project is
// in Agora "testing mode" (no App Certificate), so calls join without a token:
// anyone with the App ID and a channel name could join. Acceptable for
// testing only — turn on the certificate and issue tokens before real use.
export const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID || '4f62a0f5e5d14354a84bd84798bdb0be'

// Channel naming contract agreed with mobile:
//   'consult_' || consultation_sessions.room_id
export const agoraChannelFor = roomId => (roomId ? `consult_${roomId}` : null)
