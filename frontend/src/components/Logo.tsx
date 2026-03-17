interface LogoProps {
  size?: number
  showText?: boolean
  className?: string
}

export default function Logo({ size = 36, showText = true, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Icon mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
          <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>

        {/* Background rounded square */}
        <rect width="40" height="40" rx="10" fill="url(#grad1)" />

        {/* Chart bars */}
        <rect x="7" y="22" width="5" height="11" rx="1.5" fill="white" fillOpacity="0.9" />
        <rect x="14" y="16" width="5" height="17" rx="1.5" fill="white" fillOpacity="0.9" />
        <rect x="21" y="10" width="5" height="23" rx="1.5" fill="white" fillOpacity="0.9" />

        {/* Copy arrow — circular arrow top right */}
        <path
          d="M30 8 C34 8 37 11 37 15 C37 19 34 22 30 22"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
          strokeOpacity="0.95"
        />
        {/* Arrowhead */}
        <path
          d="M27.5 19.5 L30 22.5 L33 20"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeOpacity="0.95"
        />
      </svg>

      {/* Text */}
      {showText && (
        <div className="leading-none">
          <span className="font-bold text-white tracking-tight" style={{ fontSize: size * 0.5 }}>
            CopyTrader
          </span>
          <span
            className="font-bold tracking-tight"
            style={{
              fontSize: size * 0.5,
              background: 'linear-gradient(90deg, #3B82F6, #06B6D4)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {' '}Pro
          </span>
        </div>
      )}
    </div>
  )
}
