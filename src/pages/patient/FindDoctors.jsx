import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Star, Calendar, Filter, MapPin, Clock, CheckCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const SPECS = ['All Specializations','General Practice','Cardiology','Dermatology','Neurology','Orthopedics','Pediatrics','Psychiatry','Obstetrics & Gynecology','Ophthalmology','ENT','Pulmonology','Gastroenterology','Internal Medicine','Family Medicine']

function DoctorCard({ doc, onBook }) {
  const initials = doc.full_name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() || 'DR'
  const colors   = ['bg-blue-500','bg-green-500','bg-purple-500','bg-orange-500','bg-rose-500','bg-teal-500']
  const color    = colors[doc.full_name?.charCodeAt(0) % colors.length] || 'bg-gray-400'

  return (
    <div className="card hover:shadow-md transition-all">
      <div className="flex items-start gap-3 mb-3">
        {doc.avatar_url
          ? <img src={doc.avatar_url} className="w-12 h-12 rounded-xl object-cover shrink-0"/>
          : <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center text-white font-bold shrink-0`}>{initials}</div>
        }
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="font-bold text-gray-900 truncate">Dr. {doc.full_name}</p>
            {doc.is_verified && <CheckCircle className="w-4 h-4 text-patient-600 shrink-0"/>}
          </div>
          <p className="text-patient-600 text-xs font-semibold">{doc.specialization}</p>
          {doc.clinic_name && (
            <p className="text-gray-500 text-xs flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3"/>{doc.clinic_name}
            </p>
          )}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${doc.is_accepting_patients ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {doc.is_accepting_patients ? '● Online' : '● Offline'}
        </span>
      </div>

      {doc.bio && <p className="text-gray-500 text-xs mb-3 line-clamp-2">{doc.bio}</p>}

      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400"/>
          <span className="font-semibold text-gray-700">{doc.average_rating?.toFixed(1) || 'N/A'}</span>
          {doc.total_reviews > 0 && <span>({doc.total_reviews})</span>}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5"/>
          {doc.years_of_experience} years
        </span>
        <span className="font-bold text-gray-800 ml-auto">₱{doc.consultation_fee?.toFixed(0) || '—'}</span>
      </div>

      {doc.available_days?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <span className="text-xs text-gray-400 self-center">Available:</span>
          {doc.available_days.slice(0,4).map(d => (
            <span key={d} className="text-xs bg-patient-50 text-patient-700 px-2 py-0.5 rounded-full font-medium">
              {d.slice(0,3)}
            </span>
          ))}
        </div>
      )}

      <button onClick={() => onBook(doc)}
        className="btn-primary-patient w-full py-2.5 text-sm">
        <Calendar className="w-4 h-4"/> Book Appointment
      </button>
    </div>
  )
}

export default function FindDoctors() {
  const navigate = useNavigate()
  const [doctors, setDoctors]   = useState([])
  const [filtered, setFiltered] = useState([])
  const [search, setSearch]     = useState('')
  const [spec, setSpec]         = useState('All Specializations')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    supabase.from('doctor_directory').select('*')
      .then(({ data }) => { setDoctors(data||[]); setFiltered(data||[]); setLoading(false) })
  }, [])

  useEffect(() => {
    let result = doctors
    if (spec !== 'All Specializations') result = result.filter(d => d.specialization === spec)
    if (search) result = result.filter(d =>
      d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.specialization?.toLowerCase().includes(search.toLowerCase()) ||
      d.clinic_name?.toLowerCase().includes(search.toLowerCase())
    )
    setFiltered(result)
  }, [search, spec, doctors])

  function onBook(doc) {
    navigate('/book-appointment', { state: { doctor: doc } })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Find Doctors</h1>
        <p className="text-gray-500 text-sm mt-1">Browse and book from our verified healthcare specialists</p>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
          <input
            placeholder="Search doctor name, specialization, or hospital..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
          <select value={spec} onChange={e => setSpec(e.target.value)}
            className="input pl-10 pr-8 appearance-none bg-white min-w-[180px]">
            {SPECS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <p className="text-sm text-gray-500">{filtered.length} doctor{filtered.length !== 1 ? 's' : ''} found</p>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="card animate-pulse h-56 bg-gray-50"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-12 h-12 text-gray-300 mb-3"/>
          <p className="font-semibold text-gray-500">No doctors found</p>
          <p className="text-gray-400 text-sm">Try adjusting your search or filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(doc => <DoctorCard key={doc.user_id} doc={doc} onBook={onBook}/>)}
        </div>
      )}
    </div>
  )
}
