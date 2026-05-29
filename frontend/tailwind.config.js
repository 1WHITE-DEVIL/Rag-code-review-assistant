/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-base':      'var(--bg-base)',
        'bg-surface':   'var(--bg-surface)',
        'bg-elevated':  'var(--bg-elevated)',
        'bg-border':    'var(--bg-border)',
        'accent-green': 'var(--accent-green)',
        'accent-blue':  'var(--accent-blue)',
        'accent-amber': 'var(--accent-amber)',
        'accent-red':   'var(--accent-red)',
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-dim':       'var(--text-dim)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
