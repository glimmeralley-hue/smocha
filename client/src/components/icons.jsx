// SMOCHA custom hand-drawn style line icon set — no emoji

function base(size = 20, className = '') {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
  }
}

// CoffeeIcon
export function CoffeeIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 4c-.8 1.2-.8 2.4 0 3.6" />
      <path d="M13 4c-.8 1.2-.8 2.4 0 3.6" />
      <path d="M5 7h11v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
      <path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16" />
    </svg>
  )
}

// LogoutIcon
export function LogoutIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
      <path d="m15 10 6 5-6 5z" />
      <path d="M15 11V5l6 5-6 5z" />
    </svg>
  )
}

// TrashIcon
export function TrashIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M4.5 6.5h15" />
      <path d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5" />
      <path d="M6.5 6.5 7.5 19a2 2 0 0 0 2 1.9h5a2 2 0 0 0 2-1.9l1-12.5" />
      <path d="M10 10.5v6" />
      <path d="M14 10.5v6" />
    </svg>
  )
}

// HomeIcon
export function HomeIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  )
}

// PlusIcon
export function PlusIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

// UserIcon
export function UserIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.5-3.5 4.2-5 7.5-5s6 1.5 7.5 5" />
    </svg>
  )
}

// UsersIcon
export function UsersIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 19c1.2-2.8 3.4-4.2 6.2-4.2s5 1.4 6.2 4.2" />
      <path d="M15.5 4.9a3.4 3.4 0 0 1 0 6.2" />
      <path d="M17.6 14.9c1.9.8 3.2 2.2 4 4.1" />
    </svg>
  )
}

// ShieldIcon
export function ShieldIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3 4.5 6.5v5c0 4.2 3 8 7.5 9.5 4.5-1.5 7.5-5.3 7.5-9.5v-5z" />
      <path d="m8.5 12 2.3 2.3 4.7-4.7" />
    </svg>
  )
}

// ArrowLeftIcon
export function ArrowLeftIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  )
}

// CheckIcon
export function CheckIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

// MinusIcon
export function MinusIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 12h14" />
    </svg>
  )
}

// XIcon
export function XIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  )
}

// CameraIcon
export function CameraIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1l1.2-1.7A1.5 1.5 0 0 1 10 3.7h4a1.5 1.5 0 0 1 1.3.6L16.5 6h1A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </svg>
  )
}

// InfoIcon
export function InfoIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.5h.01" />
    </svg>
  )
}

// SparkIcon
export function SparkIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 2l1.5 3 3-1.5-1.5 3 3 1.5-3 1.5 1.5 3-1.5 3-3-1.5-1.5 3-3-1.5 1.5-3-3-1.5 1.5-3z" />
      <path d="M7 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
    </svg>
  )
}

// ImageIcon
export function ImageIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8" cy="10" r="2" />
      <path d="m12 18-4-4 2-2 3 3 5-5 3 4z" />
    </svg>
  )
}

// MapPinIcon
export function MapPinIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M20 10.5v9a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-9" />
      <path d="M12 2 4 7v5.5c0 3 2.5 5.5 6 7s6-2.5 6-7V7z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

// CalendarIcon
export function CalendarIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v3M16 3v3M3 11h18" />
    </svg>
  )
}

// WalletIcon
export function WalletIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M20 12V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6z" />
      <path d="M16 12h.01M6 8h12" />
      <rect x="6" y="10" width="10" height="6" rx="1" />
    </svg>
  )
}

// SendIcon
export function SendIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M2 12l20-9v18L10 12l-2-1z" />
    </svg>
  )
}

// EditIcon
export function EditIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 19l9-9-8-2-2-8-9 9 2 8 8 2z" />
      <path d="M18 13l-1.5-7.5L8 9l5 7 5 2z" />
    </svg>
  )
}

// ClockIcon
export function ClockIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

// CompassIcon — events feed
export function CompassIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </svg>
  )
}

// MountainIcon — hiking
export function MountainIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="m3 19 6-10 4 6 2.5-4L21 19z" />
      <path d="m9 9 1.5-2.5L12 9" />
    </svg>
  )
}

// RefreshIcon
export function RefreshIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M20 11a8 8 0 1 0-2.3 6.3" />
      <path d="M20 5v6h-6" />
    </svg>
  )
}

// LinkIcon — import a post URL
export function LinkIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M10 14a5 5 0 0 0 7.1 0l2.4-2.4a5 5 0 0 0-7.1-7.1L11 5.9" />
      <path d="M14 10a5 5 0 0 0-7.1 0l-2.4 2.4a5 5 0 0 0 7.1 7.1L13 18.1" />
    </svg>
  )
}

// EyeOffIcon — hide event
export function EyeOffIcon({ size, className }) {
  return (
    <svg {...base(size, className)}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.2-2.4 3.3" />
      <path d="M6.2 6.2C4 7.7 2.6 9.9 2 12c1 2.5 5 7 10 7 1.5 0 2.9-.4 4.2-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}
