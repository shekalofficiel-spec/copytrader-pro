/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#0a0a0f',
          900: '#0f0f18',
          800: '#1a1a2e',
          700: '#252540',
        },
        gold: '#f0b429',
        'green-profit': '#00d084',
        'red-loss': '#ff4d6d',
      },
    },
  },
  plugins: [],
}
