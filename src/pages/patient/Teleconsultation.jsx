import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, MessageSquare,
  Send, Paperclip, MoreVertical, Phone
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function Teleconsultation() {
  const { user, profile } = useAuth()
  const location = useLocation()
  const appt = location.state?.appointment

  const [sessions, setSessions]     = useState([])
  const [activeSession, setActive]  = useState(null)
  const [messages, setMessages]     = useState([])
  const [newMsg, setNewMsg]         = useState('')
  const [callStarted, setCallStarted] = useState(false)
  const [micOn, setMicOn]           = useState(true)
  const [camOn, setCamOn]           = useState(true)
  const [loading, setLoading]       = useState(true)
  const chatEndRef = useRef(null)

  const firstName = profile?.first_name || 'You'
  const initials  = [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join('') || 'U'

  useEffect(() => { fetchSessions() }, [user])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (!activeSession) return
    fetchMessages(activeSession.id)

    const sub = supabase
      .channel(`chat:${activeSession.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_logs',
        filter: `session_id=eq.${activeSession.id}`
      }, payload => {
        setMessages(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => supabase.removeChannel(sub)
  }, [activeSession])

  async function fetchSessions() {
    setLoading(true)
    const { data } = await supabase
      .from('consultation_sessions')
      .select(`*, appointments(appointment_date, time_slot, chief_complaint,
        doctor:doctor_id(first_name, last_name, avatar_url,
          doctor_profiles(specialization)))`)
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false })
    setSessions(data || [])
    if (data?.[0]) setActive(data[0])
    setLoading(false)
  }

  async function fetchMessages(sessionId) {
    const { data } = await supabase
      .from('chat_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('sent_at', { ascending: true })
    setMessages(data || [])
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!newMsg.trim() || !activeSession) return
    const text = newMsg.trim()
    setNewMsg('')
    await supabase.from('chat_logs').insert({
      session_id:   activeSession.id,
      sender_id:    user.id,
      content:      text,
      message_type: 'text',
    })
  }

  // Format time
  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
  }

  // Get doctor info from session
  function getDoctorName(s) {
    const d = s?.appointments?.doctor
    if (!d) return 'Doctor'
    return `Dr. ${d.first_name} ${d.last_name}`
  }
  function getDoctorSpec(s) {
    return s?.appointments?.doctor?.doctor_profiles?.specialization || 'Specialist'
  }
  function getDoctorInitials(s) {
    const d = s?.appointments?.doctor
    return [d?.first_name?.[0], d?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'DR'
  }

  // If no sessions yet, show empty state with a note
  if (!loading && sessions.length === 0) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teleconsultation</h1>
        <p className="text-gray-500 text-sm mt-1">Video consultation session</p>
      </div>
      <div className="card flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mb-4">
          <Video className="w-10 h-10 text-purple-500"/>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">No active sessions</h2>
        <p className="text-gray-500 text-sm max-w-sm">
          Your teleconsultation sessions will appear here once a doctor starts one from your appointment.
          Book an appointment to get started.
        </p>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teleconsultation</h1>
        <p className="text-gray-500 text-sm mt-1">Video consultation session</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>

        {/* ── VIDEO PANEL ──────────────────────────── */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          {/* Video window */}
          <div className="bg-gray-900 rounded-2xl flex-1 flex flex-col items-center justify-center relative overflow-hidden min-h-64">
            {callStarted ? (
              <div className="w-full h-full flex items-center justify-center">
                {/* Simulated video feed — replace with WebRTC/Daily.co/Agora */}
                <div className="text-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-patient-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mb-3 mx-auto">
                    {activeSession ? getDoctorInitials(activeSession) : 'DR'}
                  </div>
                  <p className="text-white font-semibold">{activeSession ? getDoctorName(activeSession) : 'Doctor'}</p>
                  <p className="text-gray-400 text-sm">{activeSession ? getDoctorSpec(activeSession) : ''}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"/>
                    <span className="text-green-400 text-xs font-medium">Connected</span>
                  </div>
                </div>
                {/* Self preview */}
                <div className="absolute bottom-4 right-4 w-28 h-20 bg-gray-700 rounded-xl flex items-center justify-center border-2 border-gray-600">
                  {camOn
                    ? <div className="w-10 h-10 bg-patient-600 rounded-full flex items-center justify-center text-white font-bold text-sm">{initials}</div>
                    : <VideoOff className="w-5 h-5 text-gray-400"/>
                  }
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-patient-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mb-4 mx-auto">
                  {activeSession ? getDoctorInitials(activeSession) : 'DR'}
                </div>
                <p className="text-white font-semibold text-lg mb-1">
                  {activeSession ? getDoctorName(activeSession) : 'Doctor'}
                </p>
                <p className="text-gray-400 text-sm mb-6">{activeSession ? getDoctorSpec(activeSession) : 'Specialist'}</p>
                <button onClick={() => setCallStarted(true)}
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold px-8 py-3 rounded-xl transition-all mx-auto">
                  <Video className="w-5 h-5"/> Start Call
                </button>
              </div>
            )}
          </div>

          {/* Controls */}
          {callStarted && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-center gap-4">
              <button onClick={() => setMicOn(!micOn)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${micOn ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-red-500 text-white'}`}>
                {micOn ? <Mic className="w-5 h-5"/> : <MicOff className="w-5 h-5"/>}
              </button>
              <button onClick={() => setCamOn(!camOn)}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${camOn ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-red-500 text-white'}`}>
                {camOn ? <Video className="w-5 h-5"/> : <VideoOff className="w-5 h-5"/>}
              </button>
              <button onClick={() => { setCallStarted(false); setMicOn(true); setCamOn(true) }}
                className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-all shadow-lg">
                <PhoneOff className="w-6 h-6"/>
              </button>
              <button className="w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-all">
                <MoreVertical className="w-5 h-5"/>
              </button>
            </div>
          )}
        </div>

        {/* ── CHAT PANEL ───────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Chat header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-patient-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
              {activeSession ? getDoctorInitials(activeSession) : 'DR'}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{activeSession ? getDoctorName(activeSession) : 'Doctor'}</p>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full"/>
                <p className="text-xs text-green-600 font-medium">Online</p>
              </div>
            </div>
            <button className="ml-auto text-gray-400 hover:text-gray-600">
              <MessageSquare className="w-4 h-4"/>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2"/>
                <p className="text-gray-400 text-xs">No messages yet. Say hello!</p>
              </div>
            )}
            {messages.map(m => {
              const isMe = m.sender_id === user.id
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    <div className={`px-3 py-2 rounded-2xl text-sm ${
                      isMe
                        ? 'bg-patient-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                      {m.content}
                    </div>
                    <span className="text-xs text-gray-400">{fmtTime(m.sent_at)}</span>
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef}/>
          </div>

          {/* Input */}
          <form onSubmit={sendMessage} className="px-3 py-3 border-t border-gray-100 flex items-center gap-2">
            <button type="button" className="text-gray-400 hover:text-gray-600 p-1">
              <Paperclip className="w-4 h-4"/>
            </button>
            <input
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 text-sm bg-gray-50 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-patient-500 border border-gray-100"
            />
            <button type="submit" disabled={!newMsg.trim()}
              className="w-8 h-8 bg-patient-600 hover:bg-patient-700 disabled:opacity-40 rounded-full flex items-center justify-center text-white transition-all shrink-0">
              <Send className="w-3.5 h-3.5"/>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
