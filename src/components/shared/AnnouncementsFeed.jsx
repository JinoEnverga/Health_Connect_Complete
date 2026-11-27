import React, { useEffect, useState } from 'react'
import { Megaphone, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const DISMISS_KEY = 'hc-dismissed-announcements'

function readDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')) } catch { return new Set() }
}

/**
 * Live announcements for the signed-in user's role, from the admin (website
 * or mobile). The database only returns announcements that are active, not
 * expired and meant for this user's role. Users can dismiss one on this device.
 *
 * tone: 'patient' | 'doctor' | 'bhw' — the portal's colour.
 */
export default function AnnouncementsFeed({ tone = 'patient' }) {
  const [items, setItems] = useState([])
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    let alive = true
    const load = () => supabase.from('announcements')
      .select('id, title, content, published_at')
      .order('published_at', { ascending: false }).limit(5)
      .then(({ data }) => { if (alive) setItems(data || []) })
    load()
    const ch = supabase.channel('announcements-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [])

  function dismiss(id) {
    setDismissed(prev => {
      const next = new Set(prev).add(id)
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...next])) } catch { /* storage unavailable */ }
      return next
    })
  }

  const visible = items.filter(a => !dismissed.has(a.id))
  if (!visible.length) return null

  // Tailwind needs complete class strings.
  const cls = {
    patient: 'bg-patient-50 border-patient-100 text-patient-900',
    doctor:  'bg-emerald-50 border-emerald-100 text-emerald-900',
    bhw:     'bg-teal-50 border-teal-100 text-teal-900',
  }[tone]

  return (
    <div className="space-y-2">
      {visible.map(a => (
        <div key={a.id} className={`border rounded-2xl px-4 py-3 flex items-start gap-3 ${cls}`}>
          <Megaphone className="w-5 h-5 shrink-0 mt-0.5 opacity-70"/>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{a.title}</p>
            <p className="text-sm opacity-90 whitespace-pre-line">{a.content}</p>
            <p className="text-[11px] opacity-60 mt-0.5">
              {new Date(a.published_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button onClick={() => dismiss(a.id)} aria-label="Dismiss announcement"
            className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 shrink-0">
            <X className="w-4 h-4"/>
          </button>
        </div>
      ))}
    </div>
  )
}
