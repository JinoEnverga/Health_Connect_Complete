import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const HISTORY_LIMIT = 300

/**
 * Persistent real-time chat for one appointment's consultation room
 * (panel item #3). Messages live in `chat_logs` — the same table the mobile
 * app uses — so they survive reloads and dropped connections and sync
 * between web and mobile.
 *
 * Delivery guarantees:
 *   * Every message gets a client-generated UUID before it's sent. Sending
 *     is an INSERT with that id, so a retry after a timeout can never
 *     create a duplicate (a duplicate-key error just means "already sent").
 *   * New messages arrive via Realtime postgres_changes. Whenever the
 *     subscription (re)connects, the history is re-fetched and merged by
 *     id, so anything sent while this client was offline still appears.
 *   * Message order comes from the server's sent_at (set by a trigger),
 *     not from each device's clock.
 */
export default function useConsultationChat({ appointmentId, userId, enabled = true }) {
  const [sessionId, setSessionId] = useState(null)
  const [roomId, setRoomId]       = useState(null) // consultation_sessions.room_id — also names the Agora video channel
  const [messages, setMessages]   = useState([]) // sorted, each { id, sender_id, content, sent_at, is_read, message_type, _state? }
  const [status, setStatus]       = useState('connecting') // connecting | live | offline | error
  const [error, setError]         = useState('')
  const outbox = useRef(new Map()) // id -> row, for messages not yet confirmed

  // Merge rows from the server into local state, keyed by id. Server rows
  // replace optimistic ones; anything still unconfirmed is kept.
  const merge = useCallback((rows) => {
    setMessages(prev => {
      const byId = new Map(prev.map(m => [m.id, m]))
      rows.forEach(r => {
        outbox.current.delete(r.id)
        byId.set(r.id, { ...r, _state: undefined })
      })
      return [...byId.values()].sort((a, b) =>
        new Date(a.sent_at) - new Date(b.sent_at) || String(a.id).localeCompare(String(b.id)))
    })
  }, [])

  const fetchHistory = useCallback(async (sid) => {
    const { data, error: err } = await supabase
      .from('chat_logs')
      .select('id, session_id, sender_id, message_type, content, file_url, is_read, sent_at')
      .eq('session_id', sid)
      .order('sent_at', { ascending: false })
      .limit(HISTORY_LIMIT)
    if (err) { setError(`Could not load messages: ${err.message}`); return }
    merge((data || []).reverse())
  }, [merge])

  // 1. Find (or create) the consultation room for this appointment.
  useEffect(() => {
    if (!enabled || !appointmentId) return
    let cancelled = false
    setSessionId(null); setRoomId(null); setMessages([]); setStatus('connecting'); setError('')
    supabase.rpc('get_or_create_consultation_session', { p_appointment_id: appointmentId })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err || !data?.id) { setStatus('error'); setError(`Chat unavailable: ${err?.message || 'no consultation room'}`); return }
        setSessionId(data.id)
        setRoomId(data.room_id || null)
      })
    return () => { cancelled = true }
  }, [appointmentId, enabled])

  // 2. Live subscription; re-sync history on every (re)connect.
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`chat-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_logs', filter: `session_id=eq.${sessionId}` },
        ({ new: row }) => merge([row]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_logs', filter: `session_id=eq.${sessionId}` },
        ({ new: row }) => merge([row]))
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') { setStatus('live'); fetchHistory(sessionId) }
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('offline')
        else if (s === 'CLOSED') setStatus('offline')
      })

    // When the browser comes back online, catch up immediately.
    const onOnline = () => fetchHistory(sessionId)
    window.addEventListener('online', onOnline)
    return () => { window.removeEventListener('online', onOnline); supabase.removeChannel(channel) }
  }, [sessionId, merge, fetchHistory])

  const deliver = useCallback(async (row) => {
    setMessages(prev => prev.map(m => m.id === row.id ? { ...m, _state: 'sending' } : m))
    const { data, error: err } = await supabase
      .from('chat_logs')
      .insert({ id: row.id, session_id: row.session_id, sender_id: row.sender_id, message_type: 'text', content: row.content })
      .select('id, session_id, sender_id, message_type, content, file_url, is_read, sent_at')
      .single()
    if (!err && data) { merge([data]); return }
    if (err?.code === '23505') { fetchHistory(row.session_id); return } // already delivered on an earlier try
    setMessages(prev => prev.map(m => m.id === row.id ? { ...m, _state: 'failed' } : m))
  }, [merge, fetchHistory])

  const send = useCallback((text) => {
    const content = text.trim()
    if (!content || !sessionId) return
    const row = {
      id: crypto.randomUUID(), session_id: sessionId, sender_id: userId,
      message_type: 'text', content, is_read: false,
      sent_at: new Date().toISOString(), _state: 'sending',
    }
    outbox.current.set(row.id, row)
    setMessages(prev => [...prev, row])
    deliver(row)
  }, [sessionId, userId, deliver])

  const retry = useCallback((id) => {
    const row = outbox.current.get(id)
    if (row) deliver(row)
  }, [deliver])

  // Read receipts: mark the other person's messages read while visible.
  const unreadFromOther = messages.filter(m => m.sender_id !== userId && !m.is_read && !m._state).map(m => m.id)
  const unreadKey = unreadFromOther.join(',')
  useEffect(() => {
    if (!unreadKey || document.visibilityState !== 'visible') return
    supabase.from('chat_logs').update({ is_read: true }).in('id', unreadKey.split(','))
      .then(({ error: err }) => { if (err) console.warn('Could not mark messages read:', err.message) })
  }, [unreadKey])

  return { messages, send, retry, status, error, ready: !!sessionId, roomId }
}
