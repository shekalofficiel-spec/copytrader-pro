/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#0a0a0f',
          900: '#0f0f18',
          800: '#1a1a2e',
          700: '#252540',
          600: '#2e2e50',
        },
        gold: {
          DEFAULT: '#f0b429',
          light: '#f5c842',
          dark: '#c9921a',
        },
        green: {
          profit: '#00d084',
        },
        red: {
          loss: '#ff4d6d',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
