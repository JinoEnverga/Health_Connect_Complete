// Shared helpers for the availability-block queue system
// (see supabase/sql/010_availability_queue.sql for the database side).
//
// All clinic times are Philippine time. The database stores block times as
// plain `date` + `time` (Manila wall-clock) and estimated_time as a real
// timestamptz, so formatting here pins the Asia/Manila zone explicitly
// instead of trusting the viewer's device clock.

export const TZ = 'Asia/Manila'

// Statuses that still need the doctor (shown under "Upcoming").
// 'upcoming' = legacy slot-based appointments from before the queue system.
export const ACTIVE_STATUSES = ['upcoming', 'waiting', 'in_progress']
export const isActive = status => ACTIVE_STATUSES.includes(status)

export const STATUS_META = {
  upcoming:    { label: 'Upcoming',    cls: 'bg-green-100 text-green-700' },
  waiting:     { label: 'Waiting',     cls: 'bg-amber-100 text-amber-700' },
  in_progress: { label: 'In Progress', cls: 'bg-emerald-100 text-emerald-700' },
  completed:   { label: 'Completed',   cls: 'bg-blue-100 text-blue-700' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-red-100 text-red-700' },
  no_show:     { label: 'No Show',     cls: 'bg-gray-100 text-gray-600' },
}

export function statusMeta(status) {
  return STATUS_META[status] || { label: status, cls: 'bg-gray-100 text-gray-600' }
}

// Today's date in Manila as 'YYYY-MM-DD' (matches the DB `date` column).
export function manilaToday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
}

// 'HH:MM[:SS]' (a DB `time`) -> '9:00 AM'
export function formatClock(time) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatRange(start, end) {
  return `${formatClock(start)} – ${formatClock(end)}`
}

// 'YYYY-MM-DD' -> 'Mon, Nov 16'
export function formatDay(date, opts = {}) {
  if (!date) return ''
  // Noon UTC so the calendar day can't shift in any timezone.
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-PH', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...opts,
  })
}

export function relativeDay(date) {
  if (date === manilaToday()) return 'Today'
  if (date === manilaToday(1)) return 'Tomorrow'
  return formatDay(date)
}

// timestamptz -> '9:40 AM' in Manila time
export function formatTimestamp(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
}

// Estimated arrival window: from the estimate to one consultation later.
export function estimateWindow(ts, avgMinutes) {
  if (!ts) return '—'
  const end = new Date(new Date(ts).getTime() + (avgMinutes || 0) * 60_000)
  return avgMinutes ? `${formatTimestamp(ts)} – ${formatTimestamp(end)}` : formatTimestamp(ts)
}

// Is a block's window happening right now / already over (Manila time)?
export function blockPhase(block, now = new Date()) {
  const today = manilaToday()
  if (block.date > today) return 'upcoming'
  if (block.date < today) return 'past'
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
  if (hm < block.start_time.slice(0, 5)) return 'upcoming'
  if (hm >= block.end_time.slice(0, 5)) return 'past'
  return 'live'
}

export const WEEKDAYS = [
  { iso: 1, short: 'Mon' }, { iso: 2, short: 'Tue' }, { iso: 3, short: 'Wed' },
  { iso: 4, short: 'Thu' }, { iso: 5, short: 'Fri' }, { iso: 6, short: 'Sat' }, { iso: 7, short: 'Sun' },
]
