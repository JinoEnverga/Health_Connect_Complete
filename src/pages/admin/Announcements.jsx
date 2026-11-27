import React, { useEffect, useState } from 'react'
import { Megaphone, Send, Trash2, Bell, Users, Stethoscope, Shield, EyeOff, Eye } from 'lucide-react'
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

const audienceLabel = roles =>
  !roles?.length || roles.includes('all') ? 'All users'
  : roles.map(r => r === 'bhw' ? 'BHWs' : `${r[0].toUpperCase()}${r.slice(1)}s`).join(', ')

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
    setNotice('Announcement posted. It now shows on the website and in the mobile app.')
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

  function formatDate(ts) {
    return new Date(ts).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Announcements</h1>
        <p className="text-sm text-gray-500 mt-0.5">Post announcements to users on the website and the mobile app</p>
      </div>

      {/* Compose */}
      <div className="card space-y-4">
        <p className="font-semibold text-gray-800 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-admin-600"/> New Announcement
        </p>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Send To</label>
          <div className="flex flex-wrap gap-2">
            {TARGETS.map(({ value, label, icon: Icon }) => (
              <button key={value} onClick={() => setTarget(value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                  target === value
                    ? 'bg-admin-600 text-white border-admin-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                <Icon className="w-3.5 h-3.5"/> {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</label>
          <input type="text" value={form.title} maxLength={150}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Announcement title..."
            className="input mt-1"/>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</label>
          <textarea rows={4} value={form.body} maxLength={2000}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder="Write your announcement here..."
            className="input mt-1 resize-none"/>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Show until (optional)</label>
          <input type="date" value={expires} onChange={e => setExpires(e.target.value)} className="input mt-1 w-auto"/>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">{notice}</div>}

        <button onClick={send} disabled={sending || !form.title.trim() || !form.body.trim()}
          className="btn-primary-admin w-full disabled:opacity-50">
          <Send className="w-4 h-4"/>
          {sending ? 'Posting...' : 'Post Announcement'}
        </button>
      </div>

      {/* History */}
      <div>
        <h2 className="font-semibold text-gray-800 mb-3">Announcements</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="card animate-pulse h-20 bg-gray-50"/>)}
          </div>
        ) : announcements.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
            <Megaphone className="w-10 h-10 text-gray-300"/>
            <p className="text-gray-500 text-sm font-medium">No announcements posted yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map(a => {
              const expired = a.expires_at && new Date(a.expires_at) < new Date()
              return (
                <div key={a.id} className={`card p-4 space-y-1.5 ${!a.is_active || expired ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Megaphone className="w-4 h-4 text-admin-600 shrink-0 mt-0.5"/>
                      <p className="font-semibold text-gray-900 truncate">{a.title}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(a.published_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{a.content}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs text-admin-600 font-medium">→ {audienceLabel(a.target_roles)}</span>
                    {!a.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Hidden</span>}
                    {expired && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Expired</span>}
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
  )
}
