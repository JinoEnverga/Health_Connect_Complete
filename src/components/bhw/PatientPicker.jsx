import React, { useState } from 'react'
import { Search, Users } from 'lucide-react'
import { patientName, patientInitials, barangayOf } from './patientUtils'

/**
 * Left column of the BHW master-detail pages (Record Vitals, Medical
 * History): searchable patient list with the selected one highlighted.
 */
export default function PatientPicker({ patients, loading, selectedId, onSelect, title = 'Select Patient' }) {
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const shown = patients.filter(p =>
    !q || patientName(p.profiles).toLowerCase().includes(q)
       || (p.profiles?.email || '').toLowerCase().includes(q)
       || barangayOf(p).toLowerCase().includes(q))

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden lg:sticky lg:top-6">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 space-y-3">
        <p className="font-semibold text-gray-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-bhw-600"/> {title}
          <span className="text-xs font-semibold bg-bhw-50 text-bhw-700 px-2 py-0.5 rounded-full">{patients.length}</span>
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input type="text" placeholder="Search name, email or barangay..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="input-bhw pl-9 py-2"/>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
        {loading ? (
          [1, 2, 3, 4].map(i => <div key={i} className="h-14 animate-pulse bg-gray-50/60"/>)
        ) : shown.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">{q ? 'No patients match.' : 'No patients registered yet.'}</p>
        ) : shown.map(p => {
          const active = p.user_id === selectedId
          return (
            <button key={p.user_id} onClick={() => onSelect(p)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${active ? 'bg-bhw-50 border-l-4 border-bhw-600 pl-3' : 'hover:bg-gray-50'}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${active ? 'bg-bhw-600 text-white' : 'bg-bhw-100 text-bhw-700'}`}>
                {patientInitials(p.profiles)}
              </div>
              <div className="min-w-0">
                <p className={`text-sm truncate ${active ? 'font-semibold text-bhw-800' : 'font-medium text-gray-900'}`}>{patientName(p.profiles)}</p>
                <p className="text-xs text-gray-400 truncate">
                  {[barangayOf(p) && `Brgy. ${barangayOf(p)}`, p.blood_type && `Blood: ${p.blood_type}`].filter(Boolean).join(' · ') || (p.profiles?.email || '—')}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
