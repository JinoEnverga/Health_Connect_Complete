import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Heart, Search, QrCode, History, UserPlus,
  Users, RefreshCw, Shield
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

function QuickAction({ icon: Icon, label, color, bg, border, onClick }) {
  return (
    <button onClick={onClick}
      className={`${bg} ${border} border rounded-2xl p-6 flex flex-col items-center justify-center gap-3 hover:opacity-90 active:scale-95 transition-all text-center`}>
      <Icon className={`w-8 h-8 ${color}`}/>
      <span className={`font-semibold text-sm ${color}`}>{label}</span>
    </button>
  )
}

export default function BHWDashboard() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [patients, setPatients]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [barangay, setBarangay]   = useState('')

  const hour    = new Date().getHours()
  const greet   = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.first_name || 'BHW'

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('patient_profiles')
      .select('*, profiles(first_name, last_name, email, created_at)')
      .order('created_at', { ascending: false })

    setPatients(data || [])
    if (data?.[0]?.city) setBarangay(data[0].city)
    setLoading(false)
  }

  const recentPatients = patients.slice(0, 5)

  return (
    <div className="space-y-6 pb-6">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-bhw-800 to-bhw-600 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-20">
          <Shield className="w-28 h-28"/>
        </div>
        <p className="text-teal-200 text-sm font-medium">{greet}</p>
        <h1 className="text-2xl font-bold mt-1">Welcome, {firstName}!</h1>
        <p className="text-teal-100 text-sm mt-0.5">
          {barangay ? `Barangay ${barangay}` : 'Barangay Health Worker'}
        </p>
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur text-white text-sm font-semibold px-4 py-1.5 rounded-full">
            <Users className="w-4 h-4"/>
            {patients.length} patient{patients.length !== 1 ? 's' : ''} registered
          </span>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 mb-3">
          <span className="text-yellow-500">⚡</span> Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <QuickAction
            icon={Heart}
            label="Record Vitals"
            color="text-orange-500"
            bg="bg-orange-50"
            border="border-orange-100"
            onClick={() => navigate('/bhw/record-vitals')}
          />
          <QuickAction
            icon={Search}
            label="Search Patient"
            color="text-bhw-600"
            bg="bg-bhw-50"
            border="border-bhw-100"
            onClick={() => navigate('/bhw/patients')}
          />
          <QuickAction
            icon={QrCode}
            label="Scan Prescription"
            color="text-blue-500"
            bg="bg-blue-50"
            border="border-blue-100"
            onClick={() => navigate('/bhw/scan-prescription')}
          />
          <QuickAction
            icon={History}
            label="Medical History"
            color="text-purple-500"
            bg="bg-purple-50"
            border="border-purple-100"
            onClick={() => navigate('/bhw/medical-history')}
          />
        </div>
      </div>

      {/* My Patients */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <Users className="w-5 h-5 text-bhw-600"/> My Patients
          </h2>
          <span className="text-sm text-gray-500">{patients.length} total</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="card animate-pulse h-16 bg-gray-50"/>)}
          </div>
        ) : patients.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-14 text-center gap-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <Users className="w-8 h-8 text-gray-400"/>
            </div>
            <div>
              <p className="font-semibold text-gray-500">
                No patients in {barangay ? `Barangay ${barangay}` : 'your barangay'}
              </p>
              <p className="text-gray-400 text-sm mt-1">Register the first patient to get started</p>
            </div>
            <button
              onClick={() => navigate('/bhw/register-patient')}
              className="flex items-center gap-2 bg-bhw-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-bhw-700 transition-all">
              <UserPlus className="w-4 h-4"/> Register First Patient
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentPatients.map(p => {
              const prof = p.profiles
              const name = prof ? `${prof.first_name} ${prof.last_name}` : 'Patient'
              const initials = [prof?.first_name?.[0], prof?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'P'
              return (
                <div key={p.id} className="card flex items-center gap-4 py-4">
                  <div className="w-10 h-10 bg-bhw-100 rounded-full flex items-center justify-center text-bhw-700 font-bold text-sm shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{name}</p>
                    <p className="text-gray-500 text-xs">{prof?.email || '—'}</p>
                    {p.city && <p className="text-gray-400 text-xs mt-0.5">Barangay {p.city}</p>}
                  </div>
                  <button
                    onClick={() => navigate('/bhw/medical-history', { state: { patientId: p.user_id } })}
                    className="text-bhw-600 text-xs font-medium hover:underline shrink-0">
                    View →
                  </button>
                </div>
              )
            })}
            {patients.length > 5 && (
              <button
                onClick={() => navigate('/bhw/patients')}
                className="w-full text-center text-bhw-600 text-sm font-medium py-3 hover:underline">
                View all {patients.length} patients →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Register Patient FAB */}
      <div className="fixed bottom-6 right-6 lg:hidden">
        <button
          onClick={() => navigate('/bhw/register-patient')}
          className="flex items-center gap-2 bg-bhw-600 text-white font-bold px-5 py-3.5 rounded-2xl shadow-lg hover:bg-bhw-700 active:scale-95 transition-all">
          <UserPlus className="w-5 h-5"/> Register Patient
        </button>
      </div>
    </div>
  )
}
