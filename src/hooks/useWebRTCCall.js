import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// STUN only — no TURN server is configured (that needs a paid/dedicated
// relay service and credentials this project doesn't have). STUN gets two
// peers connected directly across most home/office NATs; it will fail on
// networks that need a relay (symmetric NAT, some corporate firewalls).
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
]

// How long a 'disconnected' connection may sit before we try an ICE
// restart, and how many restarts before giving up.
const DISCONNECT_GRACE_MS  = 4000
const MAX_ICE_RESTARTS     = 3

/**
 * Peer-to-peer video call for exactly two participants, signaled over a
 * PRIVATE Supabase Realtime channel "call:<appointment id>" — Realtime
 * Authorization (see 012_call_history_and_chat.sql) only lets that
 * appointment's doctor and patient join it.
 *
 * Text chat is NOT carried here any more: it's persisted in chat_logs by
 * useConsultationChat, so it survives reloads and dropped connections.
 *
 * One side must be the deterministic offer-initiator to avoid both peers
 * creating an offer at once ("glare") — pass `isInitiator: true` for
 * exactly one of the two roles (this app always has the doctor initiate).
 *
 * Network hiccups (Wi-Fi switch, brief signal loss) trigger an ICE
 * restart instead of ending the call; the initiator renegotiates, the
 * other side asks it to when it notices first.
 */
export default function useWebRTCCall({ roomId, userId, isInitiator, enabled }) {
  const [localStream,  setLocalStream]  = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [remoteJoined, setRemoteJoined] = useState(false)
  const [status, setStatus] = useState('idle') // idle | waiting | connecting | connected | reconnecting | ended | error
  const [error,  setError]  = useState('')
  const [endReason, setEndReason] = useState('') // why the call last ended, for the UI
  const [micOn,  setMicOn]  = useState(true)
  const [camOn,  setCamOn]  = useState(true)

  const pcRef              = useRef(null)
  const channelRef         = useRef(null)
  const localStreamRef     = useRef(null)
  const pendingCandidates  = useRef([])
  const madeOffer          = useRef(false)
  const remoteWasHere      = useRef(false)
  const restartCount       = useRef(0)
  const disconnectTimer    = useRef(null)

  const cleanup = useCallback(() => {
    clearTimeout(disconnectTimer.current)
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    pendingCandidates.current = []
    madeOffer.current = false
    remoteWasHere.current = false
    restartCount.current = 0
    setLocalStream(null)
    setRemoteStream(null)
    setRemoteJoined(false)
  }, [])

  const hangUp = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'hangup', payload: {} })
    cleanup()
    setEndReason('You ended the call.')
    setStatus('ended')
  }, [cleanup])

  // The other side hung up or dropped out. Tear the connection down fully
  // (releasing camera/mic) rather than leaving a dead peer connection
  // around; both sides simply start a fresh call to reconnect.
  const endFromRemote = useCallback((reason) => {
    cleanup()
    setEndReason(reason)
    setStatus('ended')
  }, [cleanup])

  useEffect(() => {
    if (!enabled || !roomId || !userId) return
    let cancelled = false

    async function start() {
      setStatus('waiting'); setError(''); setEndReason('')
      setMicOn(true); setCamOn(true) // new tracks always start enabled

      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch {
        if (!cancelled) { setError('Could not access your camera/microphone. Please allow permissions and retry.'); setStatus('error') }
        return
      }
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

      localStreamRef.current = stream
      setLocalStream(stream)

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      pc.ontrack = (e) => {
        setRemoteStream(prev => {
          const rs = prev || new MediaStream()
          if (!rs.getTracks().includes(e.track)) rs.addTrack(e.track)
          return rs
        })
      }

      const channel = supabase.channel(`call:${roomId}`, {
        config: { private: true, broadcast: { self: false }, presence: { key: userId } },
      })
      channelRef.current = channel
      const signal = payload => channel.send({ type: 'broadcast', event: 'signal', payload })

      async function makeOffer({ iceRestart = false } = {}) {
        if (!iceRestart && madeOffer.current) return
        madeOffer.current = true
        const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined)
        await pc.setLocalDescription(offer)
        signal({ kind: 'offer', sdp: offer })
      }

      // Recover from a dropped network path without ending the call.
      async function restartIce() {
        if (cancelled || pc.signalingState === 'closed') return
        if (restartCount.current >= MAX_ICE_RESTARTS) {
          setError('Connection lost — this can happen on some networks without a relay server. Try ending and restarting the call.')
          setStatus('error')
          return
        }
        restartCount.current += 1
        setStatus('reconnecting')
        if (isInitiator) {
          pc.restartIce?.()
          await makeOffer({ iceRestart: true }).catch(() => {})
        } else {
          channel.send({ type: 'broadcast', event: 'restart-request', payload: {} })
        }
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) signal({ kind: 'ice-candidate', candidate: e.candidate })
      }

      pc.onconnectionstatechange = () => {
        if (cancelled) return
        const s = pc.connectionState
        if (s === 'connected') {
          clearTimeout(disconnectTimer.current)
          restartCount.current = 0
          setError('')
          setStatus('connected')
        } else if (s === 'disconnected') {
          clearTimeout(disconnectTimer.current)
          disconnectTimer.current = setTimeout(() => {
            if (pc.connectionState === 'disconnected') restartIce()
          }, DISCONNECT_GRACE_MS)
        } else if (s === 'failed') {
          clearTimeout(disconnectTimer.current)
          restartIce()
        }
      }

      async function flushCandidates() {
        for (const c of pendingCandidates.current) {
          await pc.addIceCandidate(c).catch(() => {})
        }
        pendingCandidates.current = []
      }

      channel
        .on('broadcast', { event: 'signal' }, async ({ payload }) => {
          if (cancelled) return
          try {
            if (payload.kind === 'offer') {
              // First offer, or a renegotiation / ICE restart from the initiator.
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
              await flushCandidates()
              const answer = await pc.createAnswer()
              await pc.setLocalDescription(answer)
              signal({ kind: 'answer', sdp: answer })
            } else if (payload.kind === 'answer') {
              // Accept any answer to an offer we're waiting on (not just the
              // first one), so ICE-restart renegotiations complete.
              if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
                await flushCandidates()
              }
            } else if (payload.kind === 'ice-candidate') {
              const candidate = new RTCIceCandidate(payload.candidate)
              if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {})
              else pendingCandidates.current.push(candidate)
            }
          } catch (err) {
            console.warn('Call signaling error:', err)
          }
        })
        .on('broadcast', { event: 'restart-request' }, () => {
          if (!cancelled && isInitiator) {
            restartCount.current += 1
            setStatus('reconnecting')
            pc.restartIce?.()
            makeOffer({ iceRestart: true }).catch(() => {})
          }
        })
        .on('broadcast', { event: 'hangup' }, () => { if (!cancelled) endFromRemote('The other person ended the call.') })
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return
          const state = Object.keys(channel.presenceState())
          const joined = state.some(k => k !== userId)
          if (!joined && remoteWasHere.current) {
            endFromRemote('The other person left the call (they may have closed or reloaded the page). Start the call again to reconnect.')
            return
          }
          setRemoteJoined(joined)
          if (joined) {
            remoteWasHere.current = true
            setStatus(s => (s === 'waiting' ? 'connecting' : s))
            if (isInitiator) makeOffer().catch(() => {})
          }
        })
        .subscribe(async (subStatus, err) => {
          if (cancelled) return
          if (subStatus === 'SUBSCRIBED') {
            await channel.track({ userId, online_at: Date.now() })
          } else if (subStatus === 'CHANNEL_ERROR') {
            setError(`Could not join the call channel${err?.message ? `: ${err.message}` : ''}. Please sign in again and retry.`)
            setStatus('error')
          } else if (subStatus === 'TIMED_OUT') {
            setError('Connecting to the call server timed out. Check your internet connection and retry.')
            setStatus('error')
          }
        })
    }

    start()
    return () => { cancelled = true; cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, userId, isInitiator])

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled) }
  }
  function toggleCam() {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (track) { track.enabled = !track.enabled; setCamOn(track.enabled) }
  }

  return {
    localStream, remoteStream, remoteJoined, status, error, endReason,
    micOn, camOn, toggleMic, toggleCam, hangUp,
  }
}
