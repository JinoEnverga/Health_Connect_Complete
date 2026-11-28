import React, { useEffect, useState } from 'react'
import { Megaphone, Send, Trash2, Bell, Users, Stethoscope, Shield, EyeOff, Eye, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// Shared with the mobile app's admin screen: public.announcements
// (title, content, target_roles text[], is_active, created_by, published_at,
// expires_at). Empty target_roles = everyone. See 017_mobile_contract_part_c.sql.
const TARGETS = [
  { value: 'all',     label: 'All Users',  icon: Users },
  { value: 'patient', label: 'Patients',   icon: Bell },
  { value: 'doctor',  label: 'Doctors',    icon: Stethoscope },
  { value: 'bhw',     label: 'BHWs',       icon: Shield },
]

const AUDIENCE_CLS = {
  all:     'bg-gray-100 text-gray-700',
  patient: 'bg-blue-50 text-blue-700',
  doctor:  'bg-emerald-50 text-emerald-700',
  bhw:     'bg-teal-50 text-teal-700',
}

// One badge per audience; empty or 'all' = everyone.
function audiences(roles) {
  if (!roles?.length || roles.includes('all')) return [{ key: 'all', label: 'All Users' }]
  return roles.map(r => ({ key: r, label: TARGETS.find(t => t.value === r)?.label || r }))
}

const fmt = ts => new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const fmtDay = ts => new Date(ts).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })

export default function Announcements() {
  const { user } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const [busy, setBusy]         = useState(null)
  const [target, setTarget]     = useState('all')
  const [expires, setExpires]   = useState('')
  const [form, setForm] = useState({ title: '', body: '' })
  const [error, setError]       = useState('')
  const [notice, setNotice]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('announcements')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(50)
    if (err) setError(`Could not load announcements: ${err.message}`)
    setAnnouncements(data || [])
    setLoading(false)
  }

  async function send() {
    if (!form.title.trim() || !form.body.trim()) return
    setSending(true); setError(''); setNotice('')
    const { error: insertErr } = await supabase.from('announcements').insert({
      title: form.title.trim(),
      content: form.body.trim(),
      target_roles: target === 'all' ? [] : [target],
      is_active: true,
      created_by: user?.id,
      expires_at: expires ? new Date(`${expires}T23:59:59+08:00`).toISOString() : null,
    })
    setSending(false)
    if (insertErr) { setError(`Could not post announcement: ${insertErr.message}`); return }
    setNotice('Posted. It now shows on the website and in the mobile app.')
    setForm({ title: '', body: '' }); setExpires('')
    load()
  }

  async function toggle(a) {
    setBusy(a.id); setError('')
    const { error: err } = await supabase.from('announcements').update({ is_active: !a.is_active }).eq('id', a.id)
    setBusy(null)
    if (err) setError(err.message); else load()
  }

  async function remove(a) {
    if (!window.confirm(`Delete "${a.title}"? This can't be undone.`)) return
    setBusy(a.id); setError('')
    const { error: err } = await supabase.from('announcements').delete().eq('id', a.id)
    setBusy(null)
    if (err) setError(err.message); else load()
  }

  const live = announcements.filter(a => a.is_active && !(a.expires_at && new Date(a.expires_at) < new Date())).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Announcements</h1>
        <p className="text-sm text-gray-500 mt-0.5">Post announcements to users on the website and the mobile app</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Composer */}
        <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4 lg:sticky lg:top-6">
          <p className="font-semibold text-gray-800 flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-admin-600"/> New Announcement
          </p>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Send To</label>
            <div className="flex flex-wrap gap-2">
              {TARGETS.map(({ value, label, icon: Icon }) => (
                <button key={value} onClick={() => setTarget(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                    target === value ? 'bg-admin-600 text-white border-admin-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                  <Icon className="w-3.5 h-3.5"/> {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</label>
            <input type="text" value={form.title} maxLength={150}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Announcement title..." className="input mt-1"/>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</label>
            <textarea rows={4} value={form.body} maxLength={2000}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Write your announcement here..." className="input mt-1 resize-none"/>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Show until (optional)</label>
            <input type="date" value={expires} onChange={e => setExpires(e.target.value)} className="input mt-1"/>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
          {notice && <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">{notice}</div>}

          <button onClick={send} disabled={sending || !form.title.trim() || !form.body.trim()}
            className="btn-primary-admin w-full disabled:opacity-50">
            <Send className="w-4 h-4"/> {sending ? 'Posting...' : 'Post Announcement'}
          </button>
        </div>

        {/* Published feed */}
        <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <p className="font-semibold text-gray-800 flex items-center gap-2">
              Published Announcements
              <span className="text-xs font-semibold bg-admin-50 text-admin-700 px-2 py-0.5 rounded-full">{live} live</span>
            </p>
            <button onClick={load} aria-label="Refresh" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
            </button>
          </div>

          {loading ? (
            <div className="divide-y divide-gray-100">{[1, 2].map(i => <div key={i} className="h-24 animate-pulse bg-gray-50/60"/>)}</div>
          ) : announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
              <Megaphone className="w-10 h-10 text-gray-300"/>
              <p className="text-gray-500 text-sm font-medium">No announcements posted yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {announcements.map(a => {
                const expired = a.expires_at && new Date(a.expires_at) < new Date()
                const status = !a.is_active ? { label: 'Hidden', cls: 'bg-gray-100 text-gray-500' }
                  : expired ? { label: 'Expired', cls: 'bg-amber-50 text-amber-700' }
                  : { label: 'Live', cls: 'bg-green-50 text-green-700' }
                return (
                  <div key={a.id} className={`px-5 py-3 space-y-1 ${!a.is_active || expired ? 'opacity-70' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-gray-900 text-sm">{a.title}</p>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${status.cls}`}>{status.label}</span>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-line line-clamp-3">{a.content}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {audiences(a.target_roles).map(x => (
                        <span key={x.key} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${AUDIENCE_CLS[x.key] || AUDIENCE_CLS.all}`}>{x.label}</span>
                      ))}
                      <span className="text-xs text-gray-400">
                        {fmt(a.published_at)}{a.expires_at ? ` · ${expired ? 'expired' : 'until'} ${fmtDay(a.expires_at)}` : ''}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => toggle(a)} disabled={busy === a.id}
                          className="text-xs font-semibold text-gray-600 hover:bg-gray-100 px-2 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50">
                          {a.is_active ? <><EyeOff className="w-3.5 h-3.5"/> Hide</> : <><Eye className="w-3.5 h-3.5"/> Show</>}
                        </button>
                        <button onClick={() => remove(a)} disabled={busy === a.id}
                          className="text-xs font-semibold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50">
                          <Trash2 className="w-3.5 h-3.5"/> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
