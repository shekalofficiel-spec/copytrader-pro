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

        {/* Chart bars - green gradient */}
        <rect x="7" y="24" width="5" height="9" rx="1.5" fill="#c8f135" fillOpacity="0.5" />
        <rect x="14" y="18" width="5" height="15" rx="1.5" fill="#c8f135" fillOpacity="0.75" />
        <rect x="21" y="12" width="5" height="21" rx="1.5" fill="#c8f135" />

        {/* Copy arrow - white */}
        <path
          d="M29 9 C33.5 9 37 12.5 37 17"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          strokeOpacity="0.9"
        />
        <path
          d="M27 14.5 L30 18 L33.5 15"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeOpacity="0.9"
        />
      </svg>

      {showText && (
        <div className="leading-none select-none">
          <span className="font-bold text-white" style={{ fontSize: size * 0.475 }}>
            Copy
          </span>
          <span
            className="font-bold"
            style={{
              fontSize: size * 0.475,
              color: '#c8f135',
            }}
          >
            Trader
          </span>
          <span
            className="font-semibold text-white opacity-60"
            style={{ fontSize: size * 0.38 }}
          >
            {' '}Pro
          </span>
        </div>
      )}
    </div>
  )
}
