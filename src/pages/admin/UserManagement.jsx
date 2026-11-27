import React, { useEffect, useState } from 'react'
import { Search, RefreshCw, CheckCircle, Ban, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const ROLES = ['all', 'patient', 'bhw', 'doctor', 'admin']

const roleBadge = {
  patient: 'badge-patient',
  bhw:     'badge-bhw',
  doctor:  'badge-doctor',
  admin:   'badge-admin',
}

export default function UserManagement() {
  const [users, setUsers]       = useState([])
  const [filtered, setFiltered] = useState([])
  const [query, setQuery]       = useState('')
  const [roleTab, setRoleTab]   = useState('all')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(null)
  const { user: me } = useAuth()

  // Roles and account access change only through admin functions
  // (admin_set_user_role / admin_set_user_active, 017_mobile_contract_part_c.sql);
  // blocking also stops sign-in on the mobile app.
  async function changeRole(u, role) {
    if (role === u.role) return
    if (!window.confirm(`Change ${u.first_name || 'this user'}'s role from ${u.role} to ${role}?`)) return
    setBusy(u.id); setError('')
    const { error: err } = await supabase.rpc('admin_set_user_role', { p_user_id: u.id, p_role: role })
    setBusy(null)
    if (err) setError(`Could not change the role: ${err.message}`); else load()
  }

  async function setActive(u, active) {
    if (!window.confirm(active ? `Restore access for ${u.first_name || 'this user'}?` : `Block ${u.first_name || 'this user'} from signing in (website and mobile app)?`)) return
    setBusy(u.id); setError('')
    const { error: err } = await supabase.rpc('admin_set_user_active', { p_user_id: u.id, p_active: active })
    setBusy(null)
    if (err) setError(`Could not change account access: ${err.message}`); else load()
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    let list = users
    if (roleTab !== 'all') list = list.filter(u => u.role === roleTab)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(u =>
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      )
    }
    setFiltered(list)
  }, [query, roleTab, users])

  async function load() {
    setLoading(true); setError('')
    const { data, error: loadErr } = await supabase
      .from('profiles')
      .select('id, role, first_name, last_name, email, created_at, is_active, last_login_at')
      .order('created_at', { ascending: false })
    if (loadErr) setError(`Could not load users: ${loadErr.message}`)
    setUsers(data || [])
    setFiltered(data || [])
    setLoading(false)
  }

  const counts = ROLES.reduce((acc, r) => {
    acc[r] = r === 'all' ? users.length : users.filter(u => u.role === r).length
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} total users</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition-all">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
          Refresh
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

      {/* Role filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ROLES.map(r => (
          <button key={r} onClick={() => setRoleTab(r)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              roleTab === r
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {roleTab === r && <CheckCircle className="w-3.5 h-3.5"/>}
            <span className="capitalize">{r === 'all' ? 'All' : r.toUpperCase()}</span>
            {counts[r] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                roleTab === r ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {counts[r]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {/* Users list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="card animate-pulse h-20 bg-gray-50"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-14 text-center gap-3">
          <p className="font-semibold text-gray-500">No users found</p>
          <p className="text-sm text-gray-400">Try adjusting the search or filter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => {
            const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown'
            const initials = [u.first_name?.[0], u.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'
            const avatarColors = {
              patient: 'bg-blue-100 text-blue-700',
              bhw:     'bg-teal-100 text-teal-700',
              doctor:  'bg-emerald-100 text-emerald-700',
              admin:   'bg-red-100 text-red-700',
            }
            return (
              <div key={u.id} className="card flex items-center gap-4 p-4">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${avatarColors[u.role] || 'bg-gray-100 text-gray-700'}`}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{name}</p>
                  <p className="text-gray-500 text-xs truncate">{u.email || '—'}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`inline-block ${roleBadge[u.role] || 'badge-pending'} capitalize`}>
                      {u.role === 'bhw' ? 'BHW' : u.role === 'admin' ? 'Admin' : u.role}
                    </span>
                    {u.is_active === false && <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Blocked</span>}
                    {u.last_login_at && <span className="text-[11px] text-gray-400">Last login {new Date(u.last_login_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                  </div>
                </div>
                {u.id !== me?.id && (
                  <div className="flex items-center gap-2 shrink-0">
                    <select value={u.role} disabled={busy === u.id} onChange={e => changeRole(u, e.target.value)}
                      aria-label="Role" className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white disabled:opacity-50">
                      <option value="patient">Patient</option>
                      <option value="doctor">Doctor</option>
                      <option value="bhw">BHW</option>
                      <option value="admin">Admin</option>
                    </select>
                    {u.is_active === false ? (
                      <button onClick={() => setActive(u, true)} disabled={busy === u.id}
                        className="text-xs font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50">
                        <RotateCcw className="w-3.5 h-3.5"/> Restore
                      </button>
                    ) : (
                      <button onClick={() => setActive(u, false)} disabled={busy === u.id}
                        className="text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50">
                        <Ban className="w-3.5 h-3.5"/> Block
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
