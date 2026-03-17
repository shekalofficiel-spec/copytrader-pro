/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0f0f0f',
          surface: '#171717',
          card: '#1f1f1f',
          elevated: '#242424',
        },
        border: {
          DEFAULT: '#2a2a2a',
          light: '#333333',
        },
        neon: {
          DEFAULT: '#c8f135',
          hover: '#a8cc2a',
          dim: 'rgba(200,241,53,0.12)',
          glow: 'rgba(200,241,53,0.25)',
        },
        tx: {
          primary: '#ffffff',
          secondary: '#8a8a8a',
          muted: '#555555',
        },
        profit: '#4ade80',
        loss: '#f87171',
        // Keep backwards compat aliases
        dark: {
          950: '#0f0f0f',
          900: '#171717',
          800: '#1f1f1f',
          700: '#2a2a2a',
          600: '#333333',
        },
        gold: {
          DEFAULT: '#c8f135',
          light: '#d4f55a',
          dark: '#a8cc2a',
        },
        green: {
          profit: '#4ade80',
        },
        red: {
          loss: '#f87171',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        'neon': '0 0 20px rgba(200,241,53,0.2)',
        'neon-sm': '0 0 10px rgba(200,241,53,0.15)',
        'card': '0 2px 8px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}
