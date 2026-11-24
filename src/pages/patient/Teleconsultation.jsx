import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import CallRoom from '../../components/shared/CallRoom'
import CallHistory from '../../components/shared/CallHistory'
import UpcomingSessions from '../../components/shared/UpcomingSessions'
import { ACTIVE_STATUSES } from '../../lib/queue'

export default function Teleconsultation() {
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

    // Always load the upcoming list — even when a specific appointment was
    // passed in — so "back" from that call has somewhere useful to land
    // instead of an empty state, in case it was the wrong one.
    const { data: upcomingData } = await supabase
      .from('appointments')
      .select(`*, doctor:profiles!appointments_doctor_id_fkey(first_name, last_name, doctor_profiles(specialization))`)
      .eq('patient_id', user.id)
      .in('status', ACTIVE_STATUSES)
      .order('appointment_date', { ascending: true })
    setUpcoming(upcomingData || [])

    if (preselectedId) {
      const found = (upcomingData || []).find(a => a.id === preselectedId)
      if (found) { setAppointment(found); setLoading(false); return }
      const { data, error } = await supabase
        .from('appointments')
        .select(`*, doctor:profiles!appointments_doctor_id_fkey(first_name, last_name, doctor_profiles(specialization))`)
        .eq('id', preselectedId)
        .eq('patient_id', user.id)
        .single()
      if (error || !data) setLoadError('Could not load that appointment.')
      else setAppointment(data)
    }
    setLoading(false)
  }

  if (loading) return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Teleconsultation</h1></div>
      <div className="bg-white rounded-2xl border border-gray-100 animate-pulse h-64"/>
    </div>
  )

  if (!appointment) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teleconsultation</h1>
        <p className="text-gray-500 text-sm mt-1">Video consultations with your doctors</p>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{loadError}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <UpcomingSessions role="patient" appointments={upcoming} onOpen={setAppointment}/>
        <CallHistory role="patient" userId={user.id}/>
      </div>
    </div>
  )

  return <CallRoom appointment={appointment} user={user} isDoctor={false} onBack={() => setAppointment(null)}/>
}
