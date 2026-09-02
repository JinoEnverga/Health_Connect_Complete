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

/**
 * Peer-to-peer video call for exactly two participants, signaled over a
 * Supabase Realtime broadcast channel keyed by `roomId` (use the
 * appointment id — both sides join the same channel name). No database
 * table is involved in signaling or chat: broadcast messages are ephemeral,
 * relayed directly between the two connected clients.
 *
 * One side must be the deterministic offer-initiator to avoid both peers
 * creating an offer at once ("glare") — pass `isInitiator: true` for
 * exactly one of the two roles (this app always has the doctor initiate).
 */
export default function useWebRTCCall({ roomId, userId, isInitiator, enabled }) {
  const [localStream,  setLocalStream]  = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [remoteJoined, setRemoteJoined] = useState(false)
  const [status, setStatus] = useState('idle') // idle | waiting | connecting | connected | ended | error
  const [error,  setError]  = useState('')
  const [micOn,  setMicOn]  = useState(true)
  const [camOn,  setCamOn]  = useState(true)
  const [messages, setMessages] = useState([])

  const pcRef              = useRef(null)
  const channelRef         = useRef(null)
  const localStreamRef     = useRef(null)
  const pendingCandidates  = useRef([])
  const madeOffer          = useRef(false)

  const cleanup = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    pendingCandidates.current = []
    madeOffer.current = false
    setLocalStream(null)
    setRemoteStream(null)
    setRemoteJoined(false)
  }, [])

  const hangUp = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'hangup', payload: {} })
    cleanup()
    setStatus('ended')
  }, [cleanup])

  useEffect(() => {
    if (!enabled || !roomId || !userId) return
    let cancelled = false

    async function start() {
      setStatus('waiting'); setError('')

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

      pc.onconnectionstatechange = () => {
        if (cancelled) return
        if (pc.connectionState === 'connected') setStatus('connected')
        else if (pc.connectionState === 'failed') { setError('Connection failed — this can happen on some networks without a relay server.'); setStatus('error') }
      }

      const channel = supabase.channel(`call:${roomId}`, {
        config: { broadcast: { self: false }, presence: { key: userId } },
      })
      channelRef.current = channel

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'ice-candidate', candidate: e.candidate } })
        }
      }

      async function makeOffer() {
        if (madeOffer.current) return
        madeOffer.current = true
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'offer', sdp: offer } })
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
          if (payload.kind === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
            await flushCandidates()
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'answer', sdp: answer } })
          } else if (payload.kind === 'answer') {
            if (!pc.currentRemoteDescription) {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
              await flushCandidates()
            }
          } else if (payload.kind === 'ice-candidate') {
            const candidate = new RTCIceCandidate(payload.candidate)
            if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {})
            else pendingCandidates.current.push(candidate)
          }
        })
        .on('broadcast', { event: 'hangup' }, () => { if (!cancelled) setStatus('ended') })
        .on('broadcast', { event: 'chat' }, ({ payload }) => { if (!cancelled) setMessages(m => [...m, payload]) })
        .on('presence', { event: 'sync' }, () => {
          if (cancelled) return
          const state = Object.keys(channel.presenceState())
          const joined = state.some(k => k !== userId)
          setRemoteJoined(joined)
          if (joined) {
            setStatus(s => (s === 'waiting' ? 'connecting' : s))
            if (isInitiator) makeOffer()
          }
        })
        .subscribe(async (subStatus) => {
          if (subStatus === 'SUBSCRIBED' && !cancelled) {
            await channel.track({ userId, online_at: Date.now() })
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
  function sendMessage(text) {
    if (!text.trim() || !channelRef.current) return
    const msg = { id: crypto.randomUUID(), sender: userId, text: text.trim(), at: Date.now() }
    channelRef.current.send({ type: 'broadcast', event: 'chat', payload: msg })
    setMessages(m => [...m, msg])
  }

  return {
    localStream, remoteStream, remoteJoined, status, error,
    micOn, camOn, toggleMic, toggleCam, hangUp,
    messages, sendMessage,
  }
}
