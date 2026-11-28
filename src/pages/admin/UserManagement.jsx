import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, RefreshCw, CheckCircle, Ban, RotateCcw, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { displayName, initialsOf } from '../../lib/names'

const ROLES = ['all', 'patient', 'bhw', 'doctor', 'admin']
const PAGE_SIZE = 10

const roleBadge = {
  patient: 'bg-blue-100 text-blue-700',
  bhw:     'bg-teal-100 text-teal-700',
  doctor:  'bg-emerald-100 text-emerald-700',
  admin:   'bg-red-100 text-red-700',
}
const roleLabel = r => r === 'bhw' ? 'BHW' : r ? r[0].toUpperCase() + r.slice(1) : '—'

export default function UserManagement() {
  const { state } = useLocation()
  const { user: me } = useAuth()
  const [users, setUsers]     = useState([])
  const [query, setQuery]     = useState('')
  const [roleTab, setRoleTab] = useState(ROLES.includes(state?.role) ? state.role : 'all')
  const [page, setPage]       = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [busy, setBusy]       = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    const { data, error: loadErr } = await supabase
      .from('profiles')
      .select('id, role, first_name, last_name, email, created_at, is_active, last_login_at')
      .order('created_at', { ascending: false })
    if (loadErr) setError(`Could not load users: ${loadErr.message}`)
    setUsers(data || [])
    setLoading(false)
  }

  // Roles and account access change only through admin functions
  // (admin_set_user_role / admin_set_user_active, 017_mobile_contract_part_c.sql);
  // blocking also stops sign-in on the mobile app.
  async function changeRole(u, role) {
    if (role === u.role) return
    if (!window.confirm(`Change ${displayName(u)}'s role from ${roleLabel(u.role)} to ${roleLabel(role)}?`)) return
    setBusy(u.id); setError('')
    const { error: err } = await supabase.rpc('admin_set_user_role', { p_user_id: u.id, p_role: role })
    setBusy(null)
    if (err) setError(`Could not change the role: ${err.message}`); else load()
  }

  async function setActive(u, active) {
    if (!window.confirm(active ? `Restore access for ${displayName(u)}?` : `Block ${displayName(u)} from signing in (website and mobile app)?`)) return
    setBusy(u.id); setError('')
    const { error: err } = await supabase.rpc('admin_set_user_active', { p_user_id: u.id, p_active: active })
    setBusy(null)
    if (err) setError(`Could not change account access: ${err.message}`); else load()
  }

  const counts = useMemo(() => ROLES.reduce((acc, r) => {
    acc[r] = r === 'all' ? users.length : users.filter(u => u.role === r).length
    return acc
  }, {}), [users])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter(u =>
      (roleTab === 'all' || u.role === roleTab) &&
      (!q || displayName(u).toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)))
  }, [users, query, roleTab])

  useEffect(() => { setPage(0) }, [query, roleTab])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current   = Math.min(page, pageCount - 1)
  const pageItems = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} total users</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition-all">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/> Refresh
        </button>
      </div>

      {/* Search + role pills */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <input type="text" placeholder="Search by name or email..."
            value={query} onChange={e => setQuery(e.target.value)} className="input pl-9"/>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0 shrink-0">
          {ROLES.map(r => (
            <button key={r} onClick={() => setRoleTab(r)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                roleTab === r ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {roleTab === r && <CheckCircle className="w-3.5 h-3.5"/>}
              {r === 'all' ? 'All' : r.toUpperCase()}
              <span className={`text-xs px-1.5 rounded-full ${roleTab === r ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{counts[r]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {/* Directory */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">{[1, 2, 3, 4].map(i => <div key={i} className="h-16 animate-pulse bg-gray-50/60"/>)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
            <Users className="w-10 h-10 text-gray-300"/>
            <p className="font-semibold text-gray-500">No users found</p>
            <p className="text-sm text-gray-400">Try adjusting the search or filter</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pageItems.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${roleBadge[u.role] || 'bg-gray-100 text-gray-700'}`}>
                  {initialsOf(u)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm truncate">{displayName(u)}</p>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${roleBadge[u.role] || 'bg-gray-100 text-gray-600'}`}>{roleLabel(u.role)}</span>
                    {u.is_active === false && <span className="text-[11px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Blocked</span>}
                  </div>
                  <p className="text-gray-500 text-xs truncate">
                    {u.email || '—'}
                    {u.last_login_at ? ` · Last login ${new Date(u.last_login_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  </p>
                </div>
                {u.id === me?.id ? (
                  <span className="text-xs text-gray-400 shrink-0">You</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <select value={u.role} disabled={busy === u.id} onChange={e => changeRole(u, e.target.value)}
                      aria-label={`Role of ${displayName(u)}`}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50">
                      <option value="patient">Patient</option>
                      <option value="doctor">Doctor</option>
                      <option value="bhw">BHW</option>
                      <option value="admin">Admin</option>
                    </select>
                    {u.is_active === false ? (
                      <button onClick={() => setActive(u, true)} disabled={busy === u.id}
                        className="w-24 justify-center text-xs font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50">
                        <RotateCcw className="w-3.5 h-3.5"/> Restore
                      </button>
                    ) : (
                      <button onClick={() => setActive(u, false)} disabled={busy === u.id}
                        className="w-24 justify-center text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50">
                        <Ban className="w-3.5 h-3.5"/> Block
                      </button>
                    )}
                  </div>
                )}
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
