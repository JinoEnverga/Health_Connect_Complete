import React, { useEffect, useState } from 'react'
import { Megaphone, Send, Trash2, Bell, Users, Stethoscope, Shield } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const TARGETS = [
  { value: 'all',     label: 'All Users',  icon: Users },
  { value: 'patient', label: 'Patients',   icon: Bell },
  { value: 'doctor',  label: 'Doctors',    icon: Stethoscope },
  { value: 'bhw',     label: 'BHWs',       icon: Shield },
]

export default function Announcements() {
  const { user } = useAuth()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const [target, setTarget]     = useState('all')
  const [form, setForm] = useState({ title: '', body: '' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('type', 'announcement')
      .order('created_at', { ascending: false })
      .limit(20)
    setAnnouncements(data || [])
    setLoading(false)
  }

  async function send() {
    if (!form.title.trim() || !form.body.trim()) return
    setSending(true)

    const { data: usersData } = await supabase
      .from('profiles')
      .select('id')
      .eq(target === 'all' ? 'id' : 'role', target === 'all' ? undefined : target)

    const recipients = (usersData || [])
    const inserts = recipients.map(u => ({
      user_id: u.id,
      type: 'announcement',
      title: form.title,
      body: form.body,
      data: { target, posted_by: user?.id },
      is_read: false,
    }))

    if (inserts.length > 0) {
      await supabase.from('notifications').insert(inserts)
    }

    setForm({ title: '', body: '' })
    setSending(false)
    load()
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Announcements</h1>
        <p className="text-sm text-gray-500 mt-0.5">Post system-wide announcements to users</p>
      </div>

      {/* Compose */}
      <div className="card space-y-4">
        <p className="font-semibold text-gray-800 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-admin-600"/> New Announcement
        </p>

        {/* Target */}
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
          <input type="text" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Announcement title..."
            className="input mt-1"/>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</label>
          <textarea rows={4} value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            placeholder="Write your announcement here..."
            className="input mt-1 resize-none"/>
        </div>

        <button onClick={send} disabled={sending || !form.title.trim() || !form.body.trim()}
          className="btn-primary-admin w-full disabled:opacity-50">
          <Send className="w-4 h-4"/>
          {sending ? 'Sending...' : 'Send Announcement'}
        </button>
      </div>

      {/* History */}
      <div>
        <h2 className="font-semibold text-gray-800 mb-3">Recent Announcements</h2>
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
            {announcements.map(a => (
              <div key={a.id} className="card p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-admin-600 shrink-0 mt-0.5"/>
                    <p className="font-semibold text-gray-900">{a.title}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{formatDate(a.created_at)}</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{a.body}</p>
                {a.data?.target && (
                  <span className="text-xs text-admin-600 font-medium capitalize">
                    → {a.data.target === 'all' ? 'All users' : a.data.target + 's'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
