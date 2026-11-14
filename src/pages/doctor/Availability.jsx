import React, { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Plus, Trash2, RefreshCw, Users, Clock, Repeat, CalendarDays } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { WEEKDAYS, manilaToday, formatRange, formatDay, relativeDay, blockPhase } from '../../lib/queue'

function minutesBetween(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

const EMPTY_FORM = {
  mode: 'single',
  date: manilaToday(1),
  start_date: manilaToday(1),
  end_date: manilaToday(28),
  weekdays: [1, 3, 5],
  start_time: '09:00',
  end_time: '12:00',
  avg_minutes: 20,
  max_patients: 9,
}

export default function Availability() {
  const { user } = useAuth()
  const [blocks, setBlocks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [notice, setNotice]   = useState('')
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    setLoading(true)
    const { data, error: loadErr } = await supabase
      .from('availability_blocks')
      .select('*')
      .eq('doctor_id', user.id)
      .gte('date', manilaToday())
      .order('date').order('start_time')
      .limit(120)
    if (loadErr) setError(`Could not load your availability: ${loadErr.message}`)
    setBlocks(data || [])
    setLoading(false)
  }

  const windowMinutes = minutesBetween(form.start_time, form.end_time)
  const capacityLimit = form.avg_minutes > 0 ? Math.floor(windowMinutes / form.avg_minutes) : 0
  const planned       = form.max_patients * form.avg_minutes
  const fits          = windowMinutes > 0 && planned <= windowMinutes

  function set(field, value) {
    setForm(f => {
      const next = { ...f, [field]: value }
      // Keep the patient cap sensible when the window or pace changes.
      if (['start_time', 'end_time', 'avg_minutes'].includes(field)) {
        const limit = next.avg_minutes > 0 ? Math.floor(minutesBetween(next.start_time, next.end_time) / next.avg_minutes) : 0
        next.max_patients = Math.max(1, limit)
      }
      return next
    })
  }

  function toggleWeekday(iso) {
    setForm(f => ({
      ...f,
      weekdays: f.weekdays.includes(iso) ? f.weekdays.filter(d => d !== iso) : [...f.weekdays, iso].sort(),
    }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(''); setNotice('')
    if (windowMinutes <= 0) { setError('The end time must be after the start time.'); return }
    if (!fits) { setError(`${form.max_patients} patients × ${form.avg_minutes} min doesn't fit in this ${windowMinutes}-minute window.`); return }
    if (form.mode === 'recurring' && form.weekdays.length === 0) { setError('Pick at least one weekday.'); return }

    setSaving(true)
    const recurring = form.mode === 'recurring'
    const { data, error: rpcErr } = await supabase.rpc('create_availability_blocks', {
      p_start_date:   recurring ? form.start_date : form.date,
      p_end_date:     recurring ? form.end_date   : form.date,
      p_weekdays:     recurring ? form.weekdays   : null,
      p_start_time:   form.start_time,
      p_end_time:     form.end_time,
      p_max_patients: Number(form.max_patients),
      p_avg_minutes:  Number(form.avg_minutes),
    })
    setSaving(false)
    if (rpcErr) { setError(rpcErr.message); return }
    const n = data?.length || 0
    setNotice(`Created ${n} availability block${n === 1 ? '' : 's'}.`)
    load()
  }

  async function handleDelete(block) {
    if (!confirm(`Delete the ${formatRange(block.start_time, block.end_time)} block on ${formatDay(block.date)}?`)) return
    setDeleting(block.id); setError(''); setNotice('')
    const { data, error: delErr } = await supabase
      .from('availability_blocks').delete().eq('id', block.id).select('id')
    setDeleting(null)
    if (delErr) {
      setError(delErr.code === '23503'
        ? 'This block has booking history (including cancelled spots), so it can\'t be deleted.'
        : `Could not delete the block: ${delErr.message}`)
      return
    }
    if (!data?.length) { setError('Only blocks with no active bookings can be deleted.'); return }
    setBlocks(prev => prev.filter(b => b.id !== block.id))
  }

  const grouped = useMemo(() => {
    const map = new Map()
    blocks.forEach(b => { if (!map.has(b.date)) map.set(b.date, []); map.get(b.date).push(b) })
    return [...map.entries()]
  }, [blocks])

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Availability</h1>
          <p className="text-gray-500 text-sm mt-1">Open time blocks that patients can queue into</p>
        </div>
        <button onClick={load} className="btn-outline"><RefreshCw className="w-4 h-4"/> Refresh</button>
      </div>

      {/* Create */}
      <form onSubmit={handleCreate} className="card space-y-5">
        <p className="font-bold text-gray-900 flex items-center gap-2">
          <Plus className="w-4 h-4 text-doctor-600"/> New Availability Block
        </p>

        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { value: 'single',    label: 'Specific date', icon: CalendarDays },
            { value: 'recurring', label: 'Recurring',     icon: Repeat },
          ].map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" onClick={() => set('mode', value)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                form.mode === value ? 'bg-white shadow text-doctor-600' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon className="w-4 h-4"/> {label}
            </button>
          ))}
        </div>

        {form.mode === 'single' ? (
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
            <input type="date" required min={manilaToday()} value={form.date}
              onChange={e => set('date', e.target.value)} className="input-doctor"/>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">From</label>
                <input type="date" required min={manilaToday()} value={form.start_date}
                  onChange={e => set('start_date', e.target.value)} className="input-doctor"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Until</label>
                <input type="date" required min={form.start_date} value={form.end_date}
                  onChange={e => set('end_date', e.target.value)} className="input-doctor"/>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Repeat on</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(({ iso, short }) => (
                  <button key={iso} type="button" onClick={() => toggleWeekday(iso)}
                    className={`w-14 py-2 rounded-xl text-sm font-semibold border transition-all ${
                      form.weekdays.includes(iso)
                        ? 'bg-doctor-600 text-white border-doctor-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}>
                    {short}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Start time</label>
            <input type="time" required value={form.start_time}
              onChange={e => set('start_time', e.target.value)} className="input-doctor"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">End time</label>
            <input type="time" required value={form.end_time}
              onChange={e => set('end_time', e.target.value)} className="input-doctor"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Minutes / patient</label>
            <input type="number" required min={5} max={240} value={form.avg_minutes}
              onChange={e => set('avg_minutes', Number(e.target.value))} className="input-doctor"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Max patients</label>
            <input type="number" required min={1} max={Math.max(1, capacityLimit)} value={form.max_patients}
              onChange={e => setForm(f => ({ ...f, max_patients: Number(e.target.value) }))} className="input-doctor"/>
          </div>
        </div>

        <p className={`text-xs ${fits ? 'text-gray-500' : 'text-red-600'}`}>
          {windowMinutes > 0
            ? `${form.max_patients} patients × ${form.avg_minutes} min = ${planned} of ${windowMinutes} min in this window${capacityLimit ? ` (up to ${capacityLimit} patients fit)` : ''}.`
            : 'The end time must be after the start time.'}
        </p>

        {error  && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}
        {notice && <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">{notice}</div>}

        <button type="submit" disabled={saving || !fits} className="btn-primary-doctor w-full disabled:opacity-50">
          {saving
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
            : <><Plus className="w-4 h-4"/> {form.mode === 'recurring' ? 'Create Recurring Blocks' : 'Create Block'}</>}
        </button>
      </form>

      {/* Existing blocks */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">Your upcoming blocks</h2>
        {loading ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="card animate-pulse h-20 bg-gray-50"/>)}</div>
        ) : grouped.length === 0 ? (
          <div className="card flex flex-col items-center py-12 text-center gap-2">
            <CalendarClock className="w-10 h-10 text-gray-300"/>
            <p className="font-semibold text-gray-500">No availability blocks yet</p>
            <p className="text-sm text-gray-400">Create one above so patients can book a spot in your queue.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, dayBlocks]) => (
              <div key={date}>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  {relativeDay(date)}{relativeDay(date) !== formatDay(date) ? ` · ${formatDay(date)}` : ''}
                </p>
                <div className="space-y-2">
                  {dayBlocks.map(b => {
                    const phase = blockPhase(b)
                    const pct = Math.round((b.booked_count / b.max_patients) * 100)
                    return (
                      <div key={b.id} className="card p-4 flex items-center gap-4">
                        <div className="w-10 h-10 bg-doctor-50 rounded-xl flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5 text-doctor-600"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900">{formatRange(b.start_time, b.end_time)}</p>
                            {phase === 'live' && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">● Live now</span>}
                            {phase === 'past' && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Ended</span>}
                            {b.is_full && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Full</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <Users className="w-3 h-3"/> {b.booked_count} of {b.max_patients} booked · ~{b.avg_minutes_per_patient} min each
                          </p>
                          <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden max-w-xs">
                            <div className={`h-full rounded-full ${b.is_full ? 'bg-red-400' : 'bg-doctor-500'}`} style={{ width: `${pct}%` }}/>
                          </div>
                        </div>
                        {b.booked_count === 0 && (
                          <button onClick={() => handleDelete(b)} disabled={deleting === b.id}
                            title="Delete block"
                            className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50">
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
