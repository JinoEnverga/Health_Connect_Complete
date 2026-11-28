import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Star, Calendar, Filter, MapPin, Clock, CheckCircle, Video, X, BadgeCheck, Award } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatSlot } from '../../lib/queue'

const SPECS = ['All Specializations','General Practice','Cardiology','Dermatology','Neurology','Orthopedics','Pediatrics','Psychiatry','Obstetrics & Gynecology','Ophthalmology','ENT','Pulmonology','Gastroenterology','Internal Medicine','Family Medicine']
const QUICK_SPECS = ['General Practice', 'Cardiology', 'Internal Medicine']
const BIO_FALLBACK = 'Available for online teleconsultation and check-ups.'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const isDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d)

// "tue" / "Tuesday" / "TUES" -> index 0-6, or -1.
function weekdayIndex(d) {
  const k = String(d).trim().slice(0, 3).toLowerCase()
  return WEEKDAYS.findIndex(w => w.toLowerCase() === k)
}

/**
 * Availability labels, same rule as the mobile app (shared contract A2):
 * if available_days has exact dates ('2026-12-05'), those are the whole
 * schedule — show the upcoming ones ("Nov 28"); otherwise show the weekday
 * names, capitalised, de-duplicated and in week order ("Mon", "Tue").
 */
function availableLabels(rawDays, { full = false } = {}) {
  // null in the database for doctors who never set availability.
  const days = Array.isArray(rawDays) ? rawDays.filter(Boolean) : []
  const dates = days.filter(isDate)
  if (dates.length) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
    return [...new Set(dates)].filter(d => d >= today).sort()
      .map(d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
        timeZone: 'UTC', month: 'short', day: 'numeric', ...(full ? { weekday: 'short' } : {}),
      }))
  }
  const idx = [...new Set(days.map(weekdayIndex).filter(i => i >= 0))].sort((a, b) => a - b)
  return idx.map(i => (full ? WEEKDAY_FULL : WEEKDAYS)[i])
}

const initialsOf = name => (name || '').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'DR'
const COLORS = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-rose-500', 'bg-teal-500']
const colorOf = name => COLORS[(name?.charCodeAt(0) || 0) % COLORS.length]

function Avatar({ doc, size = 'w-12 h-12' }) {
  return doc.avatar_url
    ? <img src={doc.avatar_url} alt="" className={`${size} rounded-xl object-cover shrink-0`}/>
    : <div className={`${size} ${colorOf(doc.full_name)} rounded-xl flex items-center justify-center text-white font-bold shrink-0`}>{initialsOf(doc.full_name)}</div>
}

function Rating({ doc }) {
  if (!doc.total_reviews) {
    return <span className="text-[11px] font-semibold bg-patient-50 text-patient-700 px-2 py-0.5 rounded-full">New</span>
  }
  return (
    <span className="flex items-center gap-1">
      <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400"/>
      <span className="font-semibold text-gray-700">{Number(doc.average_rating || 0).toFixed(1)}</span>
      <span>({doc.total_reviews})</span>
    </span>
  )
}

function Experience({ doc }) {
  return (
    <span className="flex items-center gap-1">
      {doc.years_of_experience > 0
        ? <><Clock className="w-3.5 h-3.5"/>{doc.years_of_experience} year{doc.years_of_experience === 1 ? '' : 's'}</>
        : <><BadgeCheck className="w-3.5 h-3.5 text-patient-600"/>Verified MD</>}
    </span>
  )
}

function OnlineBadge({ doc }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${doc.is_accepting_patients ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      {doc.is_accepting_patients ? '● Online' : '● Offline'}
    </span>
  )
}

function DoctorCard({ doc, onBook, onView }) {
  const labels = availableLabels(doc.available_days)
  return (
    <div className="card hover:shadow-md transition-all flex flex-col justify-between h-full">
      <div>
        <div className="flex items-start gap-3 mb-3">
          <Avatar doc={doc}/>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="font-bold text-gray-900 truncate">Dr. {doc.full_name}</p>
              {doc.is_verified && <CheckCircle className="w-4 h-4 text-patient-600 shrink-0"/>}
            </div>
            <p className="text-patient-600 text-xs font-semibold">{doc.specialization}</p>
            {doc.clinic_name && (
              <p className="text-gray-500 text-xs flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="w-3 h-3 shrink-0"/>{doc.clinic_name}
              </p>
            )}
          </div>
          <OnlineBadge doc={doc}/>
        </div>

        <p className={`text-xs mb-3 line-clamp-2 min-h-[2.5rem] ${doc.bio?.trim() ? 'text-gray-500' : 'text-gray-400 italic'}`}>
          {doc.bio?.trim() || BIO_FALLBACK}
        </p>

        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
          <Rating doc={doc}/>
          <Experience doc={doc}/>
          <span className="flex items-center gap-1 text-patient-700 font-medium"><Video className="w-3.5 h-3.5"/>Video Consult</span>
        </div>

        <div className="flex flex-wrap items-center gap-1 mb-4 min-h-[1.5rem]">
          <span className="text-xs text-gray-400">Available:</span>
          {labels.length === 0 ? (
            <span className="text-xs text-gray-400 italic">Schedule via Booking</span>
          ) : (
            <>
              {labels.slice(0, 4).map(d => (
                <span key={d} className="text-xs bg-patient-50 text-patient-700 px-2 py-0.5 rounded-full font-medium">{d}</span>
              ))}
              {labels.length > 4 && <span className="text-xs text-gray-400">+{labels.length - 4} more</span>}
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => onView(doc)} className="btn-outline flex-1 justify-center text-sm py-2.5">View Profile</button>
        <button onClick={() => onBook(doc)} className="btn-primary-patient flex-[1.4] py-2.5 text-sm">
          <Calendar className="w-4 h-4"/> Book Appointment
        </button>
      </div>
    </div>
  )
}

/** Full credentials and schedule, before booking. */
function ProfileModal({ doc, onClose, onBook }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const days  = availableLabels(doc.available_days, { full: true })
  const slots = [...new Set((doc.available_time_slots || []).map(formatSlot).filter(Boolean))]

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Dr. ${doc.full_name}`}
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 p-5 border-b border-gray-100">
          <Avatar doc={doc} size="w-14 h-14"/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="font-bold text-gray-900 text-lg truncate">Dr. {doc.full_name}</p>
              {doc.is_verified && <CheckCircle className="w-4 h-4 text-patient-600 shrink-0"/>}
            </div>
            <p className="text-patient-600 text-sm font-semibold">{doc.specialization}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500"><Rating doc={doc}/><Experience doc={doc}/></div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <OnlineBadge doc={doc}/>
            <span className="text-xs font-semibold bg-patient-50 text-patient-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Video className="w-3 h-3"/>Video Consult</span>
            {doc.is_verified && <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Award className="w-3 h-3"/>Verified</span>}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">About</p>
            <p className="text-gray-700 whitespace-pre-line">{doc.bio?.trim() || BIO_FALLBACK}</p>
          </div>

          {(doc.clinic_name || doc.clinic_address) && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Clinic</p>
              {doc.clinic_name && <p className="text-gray-800 font-medium">{doc.clinic_name}</p>}
              {doc.clinic_address && <p className="text-gray-500 flex items-start gap-1"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0"/>{doc.clinic_address}</p>}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Schedule</p>
            {days.length === 0 && slots.length === 0 ? (
              <p className="text-gray-400 italic">No preset schedule — choose a time when you book.</p>
            ) : (
              <div className="space-y-2">
                {days.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {days.map(d => <span key={d} className="text-xs bg-patient-50 text-patient-700 px-2 py-0.5 rounded-full font-medium">{d}</span>)}
                  </div>
                )}
                {slots.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {slots.map(s => <span key={s} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{s}</span>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 pt-0">
          <button onClick={() => onBook(doc)} className="btn-primary-patient w-full py-3 text-sm">
            <Calendar className="w-4 h-4"/> Book Appointment
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FindDoctors() {
  const navigate = useNavigate()
  const [doctors, setDoctors]       = useState([])
  const [search, setSearch]         = useState('')
  const [spec, setSpec]             = useState('All Specializations')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [viewing, setViewing]       = useState(null)

  useEffect(() => {
    supabase.from('doctor_directory').select('*')
      .then(({ data }) => { setDoctors(data || []); setLoading(false) })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return doctors.filter(d =>
      (spec === 'All Specializations' || d.specialization === spec) &&
      (!onlineOnly || d.is_accepting_patients) &&
      (!q || d.full_name?.toLowerCase().includes(q) || d.specialization?.toLowerCase().includes(q) || d.clinic_name?.toLowerCase().includes(q)))
  }, [doctors, search, spec, onlineOnly])

  function onBook(doc) {
    setViewing(null)
    navigate('/book-appointment', { state: { doctor: doc } })
  }

  // Quick pills, kept in sync with the specialization dropdown.
  const pill = active => `px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all border ${
    active ? 'bg-patient-600 text-white border-patient-600' : 'bg-white text-gray-600 border-gray-200 hover:border-patient-500'}`
  const allActive = spec === 'All Specializations' && !onlineOnly

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Find Doctors</h1>
        <p className="text-gray-500 text-sm mt-1">Browse and book from our verified healthcare specialists</p>
      </div>

      {/* Search & filter */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
            <input placeholder="Search doctor name, specialization, or hospital..."
              value={search} onChange={e => setSearch(e.target.value)} className="input pl-10"/>
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-3.5 w-4 h-4 text-gray-400"/>
            <select value={spec} onChange={e => setSpec(e.target.value)} aria-label="Specialization"
              className="input pl-10 pr-8 appearance-none bg-white min-w-[200px]">
              {SPECS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => { setSpec('All Specializations'); setOnlineOnly(false) }} className={pill(allActive)}>All</button>
          <button onClick={() => setOnlineOnly(o => !o)} className={pill(onlineOnly)}>● Online Now</button>
          {QUICK_SPECS.map(s => (
            <button key={s} onClick={() => setSpec(spec === s ? 'All Specializations' : s)} className={pill(spec === s)}>{s}</button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500">{filtered.length} doctor{filtered.length !== 1 ? 's' : ''} found</p>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="card animate-pulse h-64 bg-gray-50"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Search className="w-12 h-12 text-gray-300 mb-3"/>
          <p className="font-semibold text-gray-500">No doctors found</p>
          <p className="text-gray-400 text-sm">Try adjusting your search or filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
          {filtered.map(doc => <DoctorCard key={doc.user_id} doc={doc} onBook={onBook} onView={setViewing}/>)}
        </div>
      )}

      {viewing && <ProfileModal doc={viewing} onClose={() => setViewing(null)} onBook={onBook}/>}
    </div>
  )
}
