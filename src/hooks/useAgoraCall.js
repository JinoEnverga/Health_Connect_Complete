import { useCallback, useEffect, useRef, useState } from 'react'
import { AGORA_APP_ID, fetchAgoraToken } from '../lib/agora'
import { supabase } from '../lib/supabase'

/**
 * Two-person video call over Agora, interoperable with the mobile app
 * (agora_rtc_engine) — both sides join the same channel:
 *   'consult_' || consultation_sessions.room_id   (see src/lib/agora.js)
 *
 * Agora handles the media relay, NAT traversal and reconnection; this hook
 * only manages the local tracks and the single remote participant.
 *
 * Tokens: before joining, the hook asks the `agora-token` Edge Function for a
 * token (and the channel it was made for), and renews it before it expires.
 * If the function isn't deployed (404) it joins with the App ID alone, which
 * only works while the Agora project is in testing mode.
 *
 * The SDK is loaded on demand (dynamic import) so it isn't in the main bundle.
 *
 * status: idle | waiting | connected | reconnecting | ended | error
 *
 * Returns { localVideoTrack, remoteVideoTrack, remoteJoined, status, error,
 *           endReason, micOn, camOn, toggleMic, toggleCam, hangUp }
 */
export default function useAgoraCall({ appointmentId, channel, enabled }) {
  const [status, setStatus]                 = useState('idle')
  const [error, setError]                   = useState('')
  const [endReason, setEndReason]           = useState('')
  const [localVideoTrack, setLocalVideo]    = useState(null)
  const [remoteVideoTrack, setRemoteVideo]  = useState(null)
  const [remoteJoined, setRemoteJoined]     = useState(false)
  const [micOn, setMicOn]                   = useState(true)
  const [camOn, setCamOn]                   = useState(true)

  const clientRef = useRef(null)
  const tracksRef = useRef({ audio: null, video: null })
  const remoteUidRef = useRef(null)

  // Leave the channel and release the camera/mic. Safe to call twice.
  const teardown = useCallback(async () => {
    const { audio, video } = tracksRef.current
    tracksRef.current = { audio: null, video: null }
    audio?.close(); video?.close()
    const client = clientRef.current
    clientRef.current = null
    remoteUidRef.current = null
    setLocalVideo(null); setRemoteVideo(null); setRemoteJoined(false)
    if (client) {
      client.removeAllListeners()
      await client.leave().catch(() => {})
    }
  }, [])

  const endCall = useCallback((reason) => {
    setEndReason(reason)
    setStatus('ended')
    teardown()
  }, [teardown])

  useEffect(() => {
    if (!enabled || !channel) return
    let cancelled = false

    setStatus('waiting'); setError(''); setEndReason('')
    setMicOn(true); setCamOn(true)

    ;(async () => {
      let AgoraRTC
      try {
        AgoraRTC = (await import('agora-rtc-sdk-ng')).default
        AgoraRTC.setLogLevel(2) // warnings and errors only
      } catch {
        if (!cancelled) { setStatus('error'); setError('Could not load the video library. Check your internet connection and try again.') }
        return
      }
      if (cancelled) return

      // 0. Token for this appointment (and the channel it is valid for).
      let token = null, joinChannel = channel
      try {
        const t = await fetchAgoraToken(supabase, appointmentId)
        if (t.token) { token = t.token; joinChannel = t.channel }
      } catch (e) {
        if (!cancelled) { setStatus('error'); setError(e.message) }
        return
      }
      if (cancelled) return

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client

      client.on('user-joined', user => {
        remoteUidRef.current = user.uid
        setRemoteJoined(true)
        setStatus('connected')
      })

      client.on('user-published', async (user, mediaType) => {
        try {
          await client.subscribe(user, mediaType)
        } catch (e) {
          setError(`Could not receive the other person's ${mediaType}: ${e.message}`)
          return
        }
        remoteUidRef.current = user.uid
        setRemoteJoined(true)
        setStatus('connected')
        if (mediaType === 'video') setRemoteVideo(user.videoTrack)
        if (mediaType === 'audio') user.audioTrack?.play()
      })

      client.on('user-unpublished', (user, mediaType) => {
        if (mediaType === 'video' && user.uid === remoteUidRef.current) setRemoteVideo(null)
      })

      client.on('user-left', (user, reason) => {
        if (user.uid !== remoteUidRef.current) return
        if (reason === 'Quit') {
          endCall('The other person left the call.')
        } else {
          // Dropped (timeout / network). Stay in the channel — they can rejoin.
          remoteUidRef.current = null
          setRemoteVideo(null); setRemoteJoined(false)
          setStatus('waiting')
          setError('')
        }
      })

      client.on('connection-state-change', (cur, prev, reason) => {
        if (cur === 'RECONNECTING') setStatus('reconnecting')
        else if (cur === 'CONNECTED' && prev === 'RECONNECTING') setStatus(remoteUidRef.current ? 'connected' : 'waiting')
        else if (cur === 'DISCONNECTED' && reason && reason !== 'LEAVE') {
          setStatus('error')
          setError(`The video connection was closed (${reason}).`)
        }
      })

      // Renew the token before it runs out (long consultations).
      client.on('token-privilege-will-expire', async () => {
        try {
          const t = await fetchAgoraToken(supabase, appointmentId)
          if (t.token) await client.renewToken(t.token)
        } catch (e) {
          setError(`Could not renew the call token: ${e.message}`)
        }
      })
      client.on('token-privilege-did-expire', () => {
        setStatus('error')
        setError('The call token expired. Hang up and join the call again.')
      })

      // 1. Camera + microphone. Fall back to audio-only if the camera fails.
      let audio = null, video = null
      try {
        ;[audio, video] = await AgoraRTC.createMicrophoneAndCameraTracks()
      } catch (e) {
        try {
          audio = await AgoraRTC.createMicrophoneAudioTrack()
          setCamOn(false)
          setError('Camera unavailable — joined with audio only.')
        } catch (e2) {
          if (!cancelled) {
            setStatus('error')
            setError(e2.name === 'NotAllowedError' || /PERMISSION/i.test(e2.code || '')
              ? 'Camera/microphone permission was denied. Allow access in your browser and try again.'
              : `Could not access your camera or microphone: ${e2.message}`)
          }
          return
        }
      }
      if (cancelled) { audio?.close(); video?.close(); return }
      tracksRef.current = { audio, video }
      setLocalVideo(video)

      // 2. Join the shared channel; Agora assigns the uid (token is valid for uid 0 = any).
      try {
        await client.join(AGORA_APP_ID, joinChannel, token, null)
        if (cancelled) return
        await client.publish([audio, video].filter(Boolean))
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setError(`Could not join the video call: ${e.message}`)
        }
      }
    })()

    return () => { cancelled = true; teardown() }
  }, [enabled, channel, appointmentId, teardown, endCall])

  const toggleMic = useCallback(async () => {
    const t = tracksRef.current.audio
    if (!t) return
    const next = !micOn
    await t.setEnabled(next).catch(() => {})
    setMicOn(next)
  }, [micOn])

  const toggleCam = useCallback(async () => {
    const t = tracksRef.current.video
    if (!t) return
    const next = !camOn
    await t.setEnabled(next).catch(() => {})
    setCamOn(next)
  }, [camOn])

  const hangUp = useCallback(() => endCall('You ended the call.'), [endCall])

  return {
    localVideoTrack, remoteVideoTrack, remoteJoined, status, error, endReason,
    micOn, camOn, toggleMic, toggleCam, hangUp,
  }
}
