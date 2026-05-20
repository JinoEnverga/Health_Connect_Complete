import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, UserPlus, Heart, History } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function BHWPatients() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [filtered, setFiltered] = useState([])
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!query.trim()) { setFiltered(patients); return }
    const q = query.toLowerCase()
    setFiltered(patients.filter(p => {
      const name = `${p.profiles?.first_name} ${p.profiles?.last_name}`.toLowerCase()
      const email = (p.profiles?.email || '').toLowerCase()
      return name.includes(q) || email.includes(q)
    }))
  }, [query, patients])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('patient_profiles')
      .select('*, profiles(first_name, last_name, email, phone)')
      .order('created_at', { ascending: false })
    setPatients(data || [])
    setFiltered(data || [])
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Patients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{patients.length} registered patients</p>
        </div>
        <button
          onClick={() => navigate('/bhw/register-patient')}
          className="flex items-center gap-2 bg-bhw-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-bhw-700 transition-all">
          <UserPlus className="w-4 h-4"/> Register
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="input pl-9"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="card animate-pulse h-20 bg-gray-50"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center gap-3">
          <Users className="w-12 h-12 text-gray-300"/>
          <p className="font-semibold text-gray-500">{query ? 'No patients found' : 'No patients registered yet'}</p>
          {!query && (
            <button onClick={() => navigate('/bhw/register-patient')}
              className="text-bhw-600 text-sm font-medium hover:underline">
              Register first patient →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const prof = p.profiles
            const name = prof ? `${prof.first_name} ${prof.last_name}` : 'Patient'
            const initials = [prof?.first_name?.[0], prof?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'P'
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-bhw-100 rounded-full flex items-center justify-center text-bhw-700 font-bold shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{name}</p>
                    <p className="text-gray-500 text-xs">{prof?.email || '—'}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {p.blood_type && <span className="text-xs text-red-600 font-medium">Blood: {p.blood_type}</span>}
                      {p.city && <span className="text-xs text-gray-400">Brgy. {p.city}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => navigate('/bhw/record-vitals', { state: { patientId: p.user_id, patientName: name } })}
                      className="flex items-center gap-1 text-orange-600 text-xs font-medium bg-orange-50 px-2.5 py-1 rounded-lg hover:bg-orange-100 transition-all">
                      <Heart className="w-3 h-3"/> Vitals
                    </button>
                    <button
                      onClick={() => navigate('/bhw/medical-history', { state: { patientId: p.user_id, patientName: name } })}
                      className="flex items-center gap-1 text-purple-600 text-xs font-medium bg-purple-50 px-2.5 py-1 rounded-lg hover:bg-purple-100 transition-all">
                      <History className="w-3 h-3"/> History
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
