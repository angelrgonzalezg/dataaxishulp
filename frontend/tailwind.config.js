/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6fb',
          100: '#d6eaf5',
          200: '#b3d7ec',
          300: '#85bcdf',
          400: '#5199cc',
          500: '#357eb5',
          600: '#1c6796',
          700: '#185480',
          800: '#17466b',
          900: '#173b59',
          950: '#0f263b',
        },
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(15, 23, 42, 0.08), 0 4px 16px -4px rgba(15, 23, 42, 0.08)',
        glow: '0 0 0 1px rgba(28, 103, 150, 0.2), 0 8px 24px -6px rgba(28, 103, 150, 0.35)',
      },
    },
  },
  plugins: [],
};
