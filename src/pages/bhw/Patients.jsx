import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, UserPlus, Heart, History, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { usePatients, patientName, patientInitials, barangayOf } from '../../components/bhw/patientUtils'

const PAGE_SIZE = 10

export default function BHWPatients() {
  const navigate = useNavigate()
  const { patients, loading, error, reload } = usePatients()
  const [query, setQuery]       = useState('')
  const [barangay, setBarangay] = useState('all')
  const [page, setPage]         = useState(0)

  // Barangays present in the list, with counts, for the filter.
  const barangays = useMemo(() => {
    const m = new Map()
    patients.forEach(p => { const b = barangayOf(p); if (b) m.set(b, (m.get(b) || 0) + 1) })
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [patients])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return patients.filter(p => {
      if (barangay !== 'all' && barangayOf(p) !== barangay) return false
      if (!q) return true
      return patientName(p.profiles).toLowerCase().includes(q)
        || (p.profiles?.email || '').toLowerCase().includes(q)
        || barangayOf(p).toLowerCase().includes(q)
    })
  }, [patients, query, barangay])

  useEffect(() => { setPage(0) }, [query, barangay])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current   = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const open = (path, p) => navigate(path, { state: { patientId: p.user_id, patientName: patientName(p.profiles) } })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Patients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{patients.length} registered patient{patients.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={reload} className="btn-outline" aria-label="Refresh"><RefreshCw className="w-4 h-4"/></button>
          <button onClick={() => navigate('/bhw/register-patient')}
            className="flex items-center gap-2 bg-bhw-600 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-bhw-700 transition-all">
            <UserPlus className="w-4 h-4"/> Register
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {/* Search + barangay filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input type="text" placeholder="Search by name, email, or barangay..."
            value={query} onChange={e => setQuery(e.target.value)} className="input-bhw pl-9"/>
        </div>
        <select value={barangay} onChange={e => setBarangay(e.target.value)} aria-label="Filter by barangay"
          className="input-bhw sm:w-56">
          <option value="all">All barangays ({patients.length})</option>
          {barangays.map(([b, n]) => <option key={b} value={b}>Brgy. {b} ({n})</option>)}
        </select>
      </div>

      {/* Directory */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">{[1, 2, 3, 4].map(i => <div key={i} className="h-16 animate-pulse bg-gray-50/60"/>)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center gap-3 px-4">
            <Users className="w-12 h-12 text-gray-300"/>
            <p className="font-semibold text-gray-500">{query || barangay !== 'all' ? 'No patients match' : 'No patients registered yet'}</p>
            {!query && barangay === 'all' && (
              <button onClick={() => navigate('/bhw/register-patient')} className="text-bhw-600 text-sm font-medium hover:underline">
                Register first patient →
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pageItems.map(p => (
              <div key={p.user_id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <div className="w-10 h-10 bg-bhw-100 rounded-full flex items-center justify-center text-bhw-700 font-bold text-sm shrink-0">
                  {patientInitials(p.profiles)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{patientName(p.profiles)}</p>
                  <p className="text-gray-500 text-xs truncate">{p.profiles?.email || '—'}</p>
                </div>
                <div className="hidden sm:flex items-center gap-2 shrink-0 w-48 justify-end">
                  {p.blood_type && <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Blood: {p.blood_type}</span>}
                  {barangayOf(p) && <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full truncate max-w-[7rem]">Brgy. {barangayOf(p)}</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => open('/bhw/record-vitals', p)}
                    className="flex items-center gap-1 text-orange-600 text-xs font-semibold bg-orange-50 hover:bg-orange-100 px-2.5 py-1.5 rounded-lg">
                    <Heart className="w-3.5 h-3.5"/> Vitals
                  </button>
                  <button onClick={() => open('/bhw/medical-history', p)}
                    className="flex items-center gap-1 text-purple-600 text-xs font-semibold bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg">
                    <History className="w-3.5 h-3.5"/> History
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-gray-100">
            <button onClick={() => setPage(current - 1)} disabled={current === 0}
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
              <ChevronLeft className="w-3.5 h-3.5"/> Previous
            </button>
            <span className="text-xs text-gray-500">
              {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <button onClick={() => setPage(current + 1)} disabled={current >= pageCount - 1}
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent">
              Next <ChevronRight className="w-3.5 h-3.5"/>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
