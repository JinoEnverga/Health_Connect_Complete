// Display names that never read "null null" or "Unknown".

const clean = v => {
  const s = (v ?? '').toString().trim()
  return s && !['null', 'undefined', 'unknown'].includes(s.toLowerCase()) ? s : ''
}

// "Juan Luna" — or the email's username — or the given fallback.
export function displayName(person, fallback = 'Unnamed User') {
  const full = [clean(person?.first_name), clean(person?.last_name)].filter(Boolean).join(' ')
  if (full) return full
  return clean(person?.email).split('@')[0] || fallback
}

// Two-letter initials from the same name the row shows.
export function initialsOf(person, fallback = 'Unnamed User') {
  const name = displayName(person, fallback)
  if (name === fallback) return '?'
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase() || '?'
}
