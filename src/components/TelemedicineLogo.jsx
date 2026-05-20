import React from 'react'

export default function TelemedicineLogo({ className = 'w-9 h-9' }) {
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="22" fill="#00ACC1"/>
      {/* White medical cross */}
      <rect x="42" y="30" width="16" height="45" rx="4" fill="white"/>
      <rect x="25" y="43" width="50" height="16" rx="4" fill="white"/>
      {/* Green heart at top of cross */}
      <path
        d="M50 37 C50 37 47 29 41 32 C35 35 35 42 41 47 L50 55 L59 47 C65 42 65 35 59 32 C53 29 50 37 50 37Z"
        fill="#43A047"
      />
    </svg>
  )
}
