import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Video, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import CallRoom from '../../components/shared/CallRoom'

export default function DoctorTeleconsultation() {
  const { user } = useAuth()
  const location = useLocation()
  const preselectedId = location.state?.appointment?.id || null

  const [appointment, setAppointment] = useState(null)
  const [upcoming, setUpcoming]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState('')

  useEffect(() => { if (user) load() }, [user, preselectedId])

  async function load() {
    setLoading(true); setLoadError('')
    if (preselectedId) {
      const { data, error } = await supabase
        .from('appointments')
        .select(`*, patient:patient_id(first_name, last_name)`)
        .eq('id', preselectedId)
        .eq('doctor_id', user.id)
        .single()
      if (error || !data) setLoadError('Could not load that appointment.')
      else setAppointment(data)
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('appointments')
      .select(`*, patient:patient_id(first_name, last_name)`)
      .eq('doctor_id', user.id)
      .eq('status', 'upcoming')
      .order('appointment_date', { ascending: true })
    setUpcoming(data || [])
    setLoading(false)
  }

  if (loading) return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Teleconsultation</h1></div>
      <div className="card animate-pulse h-64 bg-gray-50"/>
    </div>
  )

  if (!appointment) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teleconsultation</h1>
        <p className="text-gray-500 text-sm mt-1">Video consultation session</p>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{loadError}</div>}

      {upcoming.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mb-4">
            <Video className="w-10 h-10 text-purple-500"/>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No upcoming appointments</h2>
          <p className="text-gray-500 text-sm max-w-sm">
            Start a video call from an upcoming appointment here or from Appointments.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {upcoming.map(a => (
            <button key={a.id} onClick={() => setAppointment(a)}
              className="card w-full flex items-center gap-4 text-left hover:border-doctor-300 border border-transparent transition-all">
              <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-purple-600"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{a.patient?.first_name} {a.patient?.last_name}</p>
                <p className="text-xs text-gray-500">{a.appointment_date} · {a.time_slot}</p>
              </div>
              <span className="flex items-center gap-1 text-xs text-doctor-600 font-semibold shrink-0">
                <Video className="w-3.5 h-3.5"/> Start
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return <CallRoom appointment={appointment} user={user} isDoctor={true}/>
}
