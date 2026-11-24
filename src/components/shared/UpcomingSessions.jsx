import React from 'react'
import { Video, CalendarClock } from 'lucide-react'
import { manilaToday, formatDate, formatTimeOnly, formatSlot } from '../../lib/queue'

// Minutes since midnight of the first time in a slot ('9:00 AM' or
// '9:00 AM – 12:00 PM'), for sorting.
function slotMinutes(slot) {
  const m = formatSlot(slot).match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return 0
  return ((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +m[2]
}

// Chronological: date, then the slot's start time (queue spots use their
// block's start, then queue number).
const sortKey = a =>
  new Date(`${a.appointment_date}T00:00:00+08:00`).getTime() + slotMinutes(a.time_slot) * 60_000 + (a.queue_number || 0)

const initialsOf = p => [p?.first_name?.[0], p?.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'

// "Nov 24, 2026 · 9:00 AM – 12:00 PM" (+ "· Queue #2 · est. 9:20 AM" for queue spots).
export function sessionWhen(a) {
  const parts = [formatDate(a.appointment_date)]
  if (a.time_slot) parts.push(formatSlot(a.time_slot))
  if (a.block_id && a.queue_number) parts.push(`Queue #${a.queue_number}`)
  if (a.block_id && a.estimated_time && a.status === 'waiting') parts.push(`est. ${formatTimeOnly(a.estimated_time)}`)
  return parts.join(' · ')
}

// Tailwind only picks up complete, literal class strings.
const THEME = {
  doctor: {
    badge:  'bg-emerald-50 text-emerald-700',
    avatar: 'bg-doctor-600',
    button: 'bg-emerald-600 hover:bg-emerald-700',
    upNext: 'bg-emerald-100 text-emerald-700',
    today:  'bg-emerald-50 text-emerald-600',
    cta:    'Start Call',
  },
  patient: {
    badge:  'bg-patient-50 text-patient-700',
    avatar: 'bg-patient-600',
    button: 'bg-patient-600 hover:bg-patient-700',
    upNext: 'bg-patient-100 text-patient-700',
    today:  'bg-patient-50 text-patient-600',
    cta:    'Join Call',
  },
}

/**
 * Upcoming teleconsultation sessions, shared by the doctor and patient
 * Teleconsultation pages. Today's (and overdue) sessions can be started /
 * joined; future-dated ones show a muted "Scheduled" state until their day.
 *
 * role: 'doctor' (rows show the patient) | 'patient' (rows show the doctor)
 */
export default function UpcomingSessions({ role, appointments, onOpen }) {
  const t = THEME[role]
  const today = manilaToday()
  const list = [...appointments].sort((x, y) => sortKey(x) - sortKey(y))
  const firstToday = list.find(a => a.appointment_date === today)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 lg:sticky lg:top-6">
      <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-2">
        <CalendarClock className="w-4 h-4 text-gray-500"/> Upcoming Sessions
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.badge}`}>{list.length}</span>
      </h2>

      {list.length === 0 ? (
        <div className="py-10 text-center">
          <Video className="w-8 h-8 text-gray-200 mx-auto mb-2"/>
          <p className="text-sm text-gray-500 font-medium">No teleconsultations scheduled</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {role === 'patient' ? 'Book an appointment with a doctor to see it here.' : 'Booked appointments will appear here.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {list.map(a => {
            const isToday  = a.appointment_date === today
            const isPast   = a.appointment_date < today
            const canStart = isToday || isPast
            const person   = role === 'doctor' ? a.patient : a.doctor
            const fullName = [person?.first_name, person?.last_name].filter(Boolean).join(' ')
            const name     = role === 'doctor' ? (fullName || 'Patient') : `Dr. ${fullName}`.trim()
            const dp       = Array.isArray(a.doctor?.doctor_profiles) ? a.doctor.doctor_profiles[0] : a.doctor?.doctor_profiles
            const subtitle = role === 'doctor'
              ? (a.chief_complaint || 'General Consultation')
              : (dp?.specialization || 'General Consultation')
            return (
              <div key={a.id} className={`flex items-center gap-3 py-3 ${canStart ? '' : 'opacity-70'}`}>
                <div className={`w-10 h-10 ${t.avatar} text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0`}>
                  {initialsOf(person)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm truncate">{name}</p>
                    {a.id === firstToday?.id && <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${t.upNext}`}>Up next</span>}
                    {isToday && a.id !== firstToday?.id && <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${t.today}`}>Today</span>}
                    {isPast && <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Overdue</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{subtitle}</p>
                  <p className="text-xs text-gray-400 truncate">{sessionWhen(a)}</p>
                </div>
                {canStart ? (
                  <button onClick={() => onOpen(a)}
                    className={`${t.button} text-white text-sm font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shrink-0 transition-colors`}>
                    <Video className="w-4 h-4"/> {t.cta}
                  </button>
                ) : (
                  <span title="Available on the day of the appointment"
                    className="bg-gray-100 text-gray-500 text-sm font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shrink-0 cursor-not-allowed">
                    <CalendarClock className="w-4 h-4"/> Scheduled
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
