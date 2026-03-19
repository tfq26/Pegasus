/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        neonCyan: '#00f3ff',
        neonPurple: '#bc13fe',
        darkGray: '#121212',
      },
      boxShadow: {
        'neon-cyan': '0 0 5px #00f3ff, 0 0 10px #00f3ff',
        'neon-purple': '0 0 5px #bc13fe, 0 0 10px #bc13fe',
      },
      animation: {
        'pulse-cyan': 'pulseCyan 2s infinite',
      },
      keyframes: {
        pulseCyan: {
          '0%, 100%': { opacity: 1, textShadow: '0 0 10px #00f3ff' },
          '50%': { opacity: 0.7, textShadow: '0 0 2px #00f3ff' },
        }
      }
    },
  },
  plugins: [],
}
