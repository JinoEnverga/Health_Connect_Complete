import React, { useState, useEffect, useRef } from 'react'
import { Video, VideoOff, Mic, MicOff, PhoneOff, MessageSquare, Send, AlertTriangle, ArrowLeft, RotateCw, CheckCheck, Check } from 'lucide-react'
import useWebRTCCall from '../../hooks/useWebRTCCall'
import useConsultationChat from '../../hooks/useConsultationChat'
import { supabase } from '../../lib/supabase'
import { logCallEvent, logCallLeaveOnUnload } from '../../lib/callLog'

const STATUS_LABEL = {
  waiting:      'Setting up your camera...',
  connecting:   'Connecting...',
  connected:    'Connected',
  reconnecting: 'Reconnecting...',
  ended:        'Call ended',
  error:        'Connection problem',
}

const CHAT_STATUS = {
  connecting: { dot: 'bg-yellow-400', text: 'Connecting chat...' },
  live:       { dot: 'bg-green-400',  text: 'Chat live · saved' },
  offline:    { dot: 'bg-orange-400', text: 'Reconnecting chat...' },
  error:      { dot: 'bg-red-400',    text: 'Chat unavailable' },
}

const fmtTime = ts => new Date(ts).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })

// Two-person WebRTC video call + persistent chat, shared by the doctor and
// patient Teleconsultation pages. `isDoctor` picks the theme color and
// which side of `appointment` is "the other participant" — it also decides
// who initiates the WebRTC offer (always the doctor, to avoid both sides
// offering at once).
//   * Video/audio: src/hooks/useWebRTCCall.js
//   * Chat (saved, synced with mobile): src/hooks/useConsultationChat.js
//   * Call history (initiated / joined / cancelled / ended): src/lib/callLog.js
export default function CallRoom({ appointment, user, isDoctor, onBack }) {
  const other = isDoctor ? appointment.patient : appointment.doctor
  const otherName = other ? `${isDoctor ? '' : 'Dr. '}${other.first_name} ${other.last_name}` : (isDoctor ? 'Patient' : 'Doctor')
  const otherSub  = isDoctor ? (appointment.chief_complaint || 'Patient') : (other?.doctor_profiles?.specialization || 'Specialist')
  const otherInitials = other ? [other.first_name?.[0], other.last_name?.[0]].filter(Boolean).join('').toUpperCase() : '?'

  const [callActive, setCallActive] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const chatEndRef = useRef(null)
  const inCall     = useRef(false)   // have we logged 'start' without a matching 'leave'?
  const tokenRef   = useRef(null)    // for the keepalive 'leave' on tab close
  const loggedErr  = useRef('')

  const {
    localStream, remoteStream, remoteJoined, status, error, endReason,
    micOn, camOn, toggleMic, toggleCam, hangUp,
  } = useWebRTCCall({
    roomId: appointment.id,
    userId: user.id,
    isInitiator: isDoctor, // doctor always makes the offer — avoids both sides offering at once
    enabled: callActive,
  })

  const chat = useConsultationChat({ appointmentId: appointment.id, userId: user.id })

  // Callback refs rather than useRef + effect: the <video> elements are
  // conditionally rendered (e.g. the self-preview unmounts when the camera
  // is toggled off), and an effect keyed on the stream wouldn't re-run when
  // a fresh element mounts later, leaving it black.
  const attachLocal  = el => { if (el && el.srcObject !== localStream)  el.srcObject = localStream }
  const attachRemote = el => { if (el && el.srcObject !== remoteStream) el.srcObject = remoteStream }

  function leaveLogged(detail) {
    if (!inCall.current) return
    inCall.current = false
    logCallEvent(appointment.id, 'leave', detail)
  }

  async function startCall() {
    setCallActive(true)
    inCall.current = true
    loggedErr.current = ''
    const { data } = await supabase.auth.getSession()
    tokenRef.current = data.session?.access_token || null
    logCallEvent(appointment.id, 'start')
  }

  // Call ended (by me, by them, or they dropped): log it, back to "Start Call".
  useEffect(() => {
    if (status === 'ended') {
      leaveLogged(endReason || null)
      setCallActive(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // Connection failures go into the call's timeline (once per message).
  useEffect(() => {
    if (status === 'error' && error && inCall.current && loggedErr.current !== error) {
      loggedErr.current = error
      logCallEvent(appointment.id, 'failed', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, error])

  // Tab closed / reloaded mid-call, or navigated away inside the app.
  useEffect(() => {
    const onPageHide = () => {
      if (inCall.current) { inCall.current = false; logCallLeaveOnUnload(appointment.id, tokenRef.current) }
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      leaveLogged('Left the consultation page')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment.id])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat.messages.length])

  // Tailwind only picks up complete, literal class strings — an
  // interpolated `bg-${accent}-600` would silently produce no styling.
  const myBubbleCls  = isDoctor ? 'bg-doctor-600 text-white rounded-tr-sm' : 'bg-patient-600 text-white rounded-tr-sm'
  const sendBtnCls   = isDoctor
    ? 'bg-doctor-600 hover:bg-doctor-700 disabled:opacity-40 rounded-full flex items-center justify-center text-white transition-all shrink-0'
    : 'bg-patient-600 hover:bg-patient-700 disabled:opacity-40 rounded-full flex items-center justify-center text-white transition-all shrink-0'
  const inputRingCls = isDoctor ? 'focus:ring-doctor-500' : 'focus:ring-patient-500'
  const avatarCls    = isDoctor
    ? 'bg-gradient-to-br from-purple-500 to-doctor-600'
    : 'bg-gradient-to-br from-purple-500 to-patient-600'

  function submitChat(e) {
    e.preventDefault()
    if (!newMsg.trim()) return
    chat.send(newMsg)
    setNewMsg('')
  }

  function handleBack() {
    if (callActive) {
      if (!window.confirm('End this call and go back?')) return
      hangUp()
    }
    onBack?.()
  }

  const lastMineId = [...chat.messages].reverse().find(m => m.sender_id === user.id && !m._state)?.id
  const chatStatus = CHAT_STATUS[chat.status] || CHAT_STATUS.connecting

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors shrink-0" aria-label="Back">
            <ArrowLeft className="w-5 h-5 text-gray-600"/>
          </button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teleconsultation</h1>
          <p className="text-gray-500 text-sm mt-1">
            {otherName} · {appointment.appointment_date} · {appointment.time_slot}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>

        {/* ── VIDEO PANEL ──────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="bg-gray-900 rounded-2xl flex-1 flex flex-col items-center justify-center relative overflow-hidden min-h-64">
            {callActive ? (
              <div className="w-full h-full relative">
                {/* Remote video (or placeholder until they join) */}
                {remoteJoined && remoteStream ? (
                  <video ref={attachRemote} autoPlay playsInline className="w-full h-full object-cover"/>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className={`w-24 h-24 ${avatarCls} rounded-full flex items-center justify-center text-white text-3xl font-bold mb-3 mx-auto`}>
                        {otherInitials}
                      </div>
                      <p className="text-white font-semibold">{otherName}</p>
                      <p className="text-gray-400 text-sm">{otherSub}</p>
                      <p className="text-gray-400 text-xs mt-3">
                        {error || (status === 'waiting' && !remoteJoined ? `Calling ${otherName}... they'll see that you're calling.` : STATUS_LABEL[status]) || 'Waiting for them to join...'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Self preview */}
                <div className="absolute bottom-4 right-4 w-28 h-20 bg-gray-700 rounded-xl overflow-hidden border-2 border-gray-600">
                  {camOn && localStream
                    ? <video ref={attachLocal} autoPlay playsInline muted className="w-full h-full object-cover"/>
                    : <div className="w-full h-full flex items-center justify-center"><VideoOff className="w-5 h-5 text-gray-400"/></div>
                  }
                </div>

                {/* Status pill */}
                <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/40 rounded-full px-3 py-1">
                  <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-400 animate-pulse' : status === 'error' ? 'bg-red-400' : 'bg-yellow-400'}`}/>
                  <span className="text-white text-xs font-medium">{error ? 'Error' : STATUS_LABEL[status] || status}</span>
                </div>
              </div>
            ) : (
              <div className="text-center px-4">
                <div className={`w-24 h-24 ${avatarCls} rounded-full flex items-center justify-center text-white text-3xl font-bold mb-4 mx-auto`}>
                  {otherInitials}
                </div>
                <p className="text-white font-semibold text-lg mb-1">{otherName}</p>
                <p className="text-gray-400 text-sm mb-6">{otherSub}</p>
                {status === 'ended' && endReason && (
                  <p className="text-gray-300 text-sm mb-4 max-w-xs mx-auto">{endReason}</p>
                )}
                <button onClick={startCall}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold px-8 py-3 rounded-xl transition-all mx-auto">
                  <Video className="w-5 h-5"/> {isDoctor ? 'Start Call' : 'Join Call'}
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/> {error}
            </div>
          )}

          {callActive && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-center gap-4">
              <button onClick={toggleMic} aria-label={micOn ? 'Mute' : 'Unmute'}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${micOn ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-red-500 text-white'}`}>
                {micOn ? <Mic className="w-5 h-5"/> : <MicOff className="w-5 h-5"/>}
              </button>
              <button onClick={toggleCam} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${camOn ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-red-500 text-white'}`}>
                {camOn ? <Video className="w-5 h-5"/> : <VideoOff className="w-5 h-5"/>}
              </button>
              <button onClick={hangUp} aria-label="Hang up"
                className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-all shadow-lg">
                <PhoneOff className="w-6 h-6"/>
              </button>
            </div>
          )}
        </div>

        {/* ── CHAT PANEL ───────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[360px]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <div className={`w-9 h-9 ${avatarCls} rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0`}>
              {otherInitials}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{otherName}</p>
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${remoteJoined ? 'bg-green-400' : 'bg-gray-300'}`}/>
                <p className={`text-xs font-medium ${remoteJoined ? 'text-green-600' : 'text-gray-400'}`}>{remoteJoined ? 'In the call' : 'Not in the call'}</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1.5 shrink-0" title="Messages are saved and sync across devices">
              <div className={`w-1.5 h-1.5 rounded-full ${chatStatus.dot}`}/>
              <span className="text-[11px] text-gray-400">{chatStatus.text}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chat.error && <p className="text-xs text-red-600 text-center">{chat.error}</p>}
            {chat.messages.length === 0 && !chat.error && (
              <div className="text-center py-8">
                <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2"/>
                <p className="text-gray-400 text-xs">No messages yet. Say hello!</p>
                <p className="text-gray-300 text-xs mt-1">Chat works before, during and after the call, and is saved.</p>
              </div>
            )}
            {chat.messages.map(m => {
              if (m.message_type === 'system') {
                return <p key={m.id} className="text-center text-xs text-gray-400 italic">{m.content}</p>
              }
              const isMe = m.sender_id === user.id
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${isMe ? myBubbleCls : 'bg-gray-100 text-gray-800 rounded-tl-sm'} ${m._state === 'sending' ? 'opacity-60' : ''} ${m._state === 'failed' ? 'ring-2 ring-red-300' : ''}`}>
                      {m.content}
                    </div>
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      {m._state === 'failed' ? (
                        <button onClick={() => chat.retry(m.id)} className="text-red-600 font-semibold flex items-center gap-1 hover:underline">
                          <RotateCw className="w-3 h-3"/> Not sent — tap to retry
                        </button>
                      ) : m._state === 'sending' ? 'Sending...' : (
                        <>
                          {fmtTime(m.sent_at)}
                          {isMe && (m.is_read
                            ? <><CheckCheck className="w-3 h-3 text-blue-500"/>{m.id === lastMineId ? ' Seen' : ''}</>
                            : <Check className="w-3 h-3"/>)}
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef}/>
          </div>

          <form onSubmit={submitChat} className="px-3 py-3 border-t border-gray-100 flex items-center gap-2">
            <input
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder={chat.ready ? 'Type a message...' : 'Connecting chat...'}
              maxLength={2000}
              disabled={!chat.ready}
              className={`flex-1 text-sm bg-gray-50 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ${inputRingCls} border border-gray-100 disabled:opacity-50`}
            />
            <button type="submit" disabled={!newMsg.trim() || !chat.ready} aria-label="Send"
              className={`w-8 h-8 ${sendBtnCls}`}>
              <Send className="w-3.5 h-3.5"/>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
