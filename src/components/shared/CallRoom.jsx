import React, { useState, useEffect, useRef } from 'react'
import { Video, VideoOff, Mic, MicOff, PhoneOff, MessageSquare, Send, AlertTriangle } from 'lucide-react'
import useWebRTCCall from '../../hooks/useWebRTCCall'

const STATUS_LABEL = {
  waiting:    'Setting up your camera...',
  connecting: 'Connecting...',
  connected:  'Connected',
  ended:      'Call ended',
  error:      'Connection problem',
}

// Two-person WebRTC video call UI, shared by the doctor and patient
// Teleconsultation pages. `isDoctor` picks the theme color and which side
// of `appointment` (doctor vs patient) is "the other participant" — it
// also decides who initiates the WebRTC offer (always the doctor, to avoid
// both sides offering at once). See src/hooks/useWebRTCCall.js for the
// actual signaling/connection logic.
export default function CallRoom({ appointment, user, isDoctor }) {
  const other = isDoctor ? appointment.patient : appointment.doctor
  const otherName = other ? `${isDoctor ? '' : 'Dr. '}${other.first_name} ${other.last_name}` : (isDoctor ? 'Patient' : 'Doctor')
  const otherSub  = isDoctor ? (appointment.chief_complaint || 'Patient') : (other?.doctor_profiles?.specialization || 'Specialist')
  const otherInitials = other ? [other.first_name?.[0], other.last_name?.[0]].filter(Boolean).join('').toUpperCase() : '?'

  const [callActive, setCallActive] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const localVideoRef  = useRef(null)
  const remoteVideoRef = useRef(null)
  const chatEndRef      = useRef(null)

  const {
    localStream, remoteStream, remoteJoined, status, error,
    micOn, camOn, toggleMic, toggleCam, hangUp, messages, sendMessage,
  } = useWebRTCCall({
    roomId: appointment.id,
    userId: user.id,
    isInitiator: isDoctor, // doctor always makes the offer — avoids both sides offering at once
    enabled: callActive,
  })

  useEffect(() => { if (localVideoRef.current) localVideoRef.current.srcObject = localStream }, [localStream])
  useEffect(() => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream }, [remoteStream])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

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
    sendMessage(newMsg)
    setNewMsg('')
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teleconsultation</h1>
        <p className="text-gray-500 text-sm mt-1">{appointment.appointment_date} · {appointment.time_slot}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>

        {/* ── VIDEO PANEL ──────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="bg-gray-900 rounded-2xl flex-1 flex flex-col items-center justify-center relative overflow-hidden min-h-64">
            {callActive ? (
              <div className="w-full h-full relative">
                {/* Remote video (or placeholder until they join) */}
                {remoteJoined && remoteStream ? (
                  <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover"/>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className={`w-24 h-24 ${avatarCls} rounded-full flex items-center justify-center text-white text-3xl font-bold mb-3 mx-auto`}>
                        {otherInitials}
                      </div>
                      <p className="text-white font-semibold">{otherName}</p>
                      <p className="text-gray-400 text-sm">{otherSub}</p>
                      <p className="text-gray-400 text-xs mt-3">
                        {error || STATUS_LABEL[status] || 'Waiting for them to join...'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Self preview */}
                <div className="absolute bottom-4 right-4 w-28 h-20 bg-gray-700 rounded-xl overflow-hidden border-2 border-gray-600">
                  {camOn && localStream
                    ? <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover"/>
                    : <div className="w-full h-full flex items-center justify-center"><VideoOff className="w-5 h-5 text-gray-400"/></div>
                  }
                </div>

                {/* Status pill */}
                <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/40 rounded-full px-3 py-1">
                  <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}/>
                  <span className="text-white text-xs font-medium">{error ? 'Error' : STATUS_LABEL[status] || status}</span>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className={`w-24 h-24 ${avatarCls} rounded-full flex items-center justify-center text-white text-3xl font-bold mb-4 mx-auto`}>
                  {otherInitials}
                </div>
                <p className="text-white font-semibold text-lg mb-1">{otherName}</p>
                <p className="text-gray-400 text-sm mb-6">{otherSub}</p>
                <button onClick={() => setCallActive(true)}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold px-8 py-3 rounded-xl transition-all mx-auto">
                  <Video className="w-5 h-5"/> Start Call
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
              <button onClick={toggleMic}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${micOn ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-red-500 text-white'}`}>
                {micOn ? <Mic className="w-5 h-5"/> : <MicOff className="w-5 h-5"/>}
              </button>
              <button onClick={toggleCam}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${camOn ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-red-500 text-white'}`}>
                {camOn ? <Video className="w-5 h-5"/> : <VideoOff className="w-5 h-5"/>}
              </button>
              <button onClick={() => { hangUp(); setCallActive(false) }}
                className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-all shadow-lg">
                <PhoneOff className="w-6 h-6"/>
              </button>
            </div>
          )}
        </div>

        {/* ── CHAT PANEL ───────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <div className={`w-9 h-9 ${avatarCls} rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0`}>
              {otherInitials}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{otherName}</p>
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${remoteJoined ? 'bg-green-400' : 'bg-gray-300'}`}/>
                <p className={`text-xs font-medium ${remoteJoined ? 'text-green-600' : 'text-gray-400'}`}>{remoteJoined ? 'Online' : 'Not in call'}</p>
              </div>
            </div>
            <MessageSquare className="w-4 h-4 text-gray-300 ml-auto"/>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2"/>
                <p className="text-gray-400 text-xs">No messages yet. Say hello!</p>
                <p className="text-gray-300 text-xs mt-1">Chat here is call-only and isn't saved afterward.</p>
              </div>
            )}
            {messages.map(m => {
              const isMe = m.sender === user.id
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? myBubbleCls : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                      {m.text}
                    </div>
                    <span className="text-xs text-gray-400">{new Date(m.at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}</span>
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
              placeholder="Type a message..."
              disabled={!callActive}
              className={`flex-1 text-sm bg-gray-50 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 ${inputRingCls} border border-gray-100 disabled:opacity-50`}
            />
            <button type="submit" disabled={!newMsg.trim() || !callActive}
              className={`w-8 h-8 ${sendBtnCls}`}>
              <Send className="w-3.5 h-3.5"/>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
