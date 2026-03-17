interface LogoProps {
  size?: number
  showText?: boolean
  className?: string
}

export default function Logo({ size = 36, showText = true, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c8f135" />
            <stop offset="100%" stopColor="#86efac" />
          </linearGradient>
        </defs>
        {/* Background */}
        <rect width="40" height="40" rx="10" fill="#1a1a1a" />
        <rect width="40" height="40" rx="10" fill="url(#logoGrad)" fillOpacity="0.12" />
        <rect x="0.5" y="0.5" width="39" height="39" rx="9.5" stroke="#c8f135" strokeOpacity="0.4" />

        {/* Y letter */}
        <text
          x="20"
          y="27"
          textAnchor="middle"
          fill="#c8f135"
          fontSize="22"
          fontWeight="800"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="-1"
        >
          Y
        </text>

        {/* Connection dot top-left */}
        <circle cx="9" cy="10" r="2.5" fill="#c8f135" fillOpacity="0.6" />
        {/* Connection dot top-right */}
        <circle cx="31" cy="10" r="2.5" fill="#c8f135" fillOpacity="0.6" />
        {/* Line left to Y */}
        <line x1="11" y1="10" x2="16" y2="17" stroke="#c8f135" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" />
        {/* Line right to Y */}
        <line x1="29" y1="10" x2="24" y2="17" stroke="#c8f135" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {showText && (
        <div className="leading-none select-none">
          <span className="font-bold text-white" style={{ fontSize: size * 0.475 }}>
            Ye
          </span>
          <span
            className="font-bold"
            style={{
              fontSize: size * 0.475,
              color: '#c8f135',
            }}
          >
            Connect
          </span>
        </div>
      )}
    </div>
  )
}
