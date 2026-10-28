/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // "Game night" palette: a felt card table, playing-card stock, gold tokens
      colors: {
        felt: { DEFAULT: '#0E3B34', deep: '#0A2E28' },
        table: { DEFAULT: '#155247', rim: '#1F6B5D' },
        chalk: '#CFE3DB',
        card: '#FFFDF9',
        ink: { DEFAULT: '#1A2421', soft: '#56635F' },
        gold: { DEFAULT: '#FFC23D', deep: '#E8A817', edge: '#B9800A' },
        signal: '#FF5C4D',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        rest: '0 10px 24px -8px rgba(3, 20, 16, 0.55)',
        lift: '0 22px 40px -14px rgba(3, 20, 16, 0.75)',
      },
    },
  },
  plugins: [],
}
