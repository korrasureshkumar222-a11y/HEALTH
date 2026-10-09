/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F8FAFC',
        surface: '#FFFFFF',
        ink: '#0F172A',
        muted: '#475569',
        border: '#CBD5E1',
        brand: '#1D4ED8',
        'brand-dark': '#1E3A8A',
        success: '#166534',
        'success-bg': '#DCFCE7',
        'success-ink': '#14532D',
        warning: '#92400E',
        'warning-bg': '#FEF3C7',
        'warning-ink': '#78350F',
        critical: '#B91C1C',
        'critical-bg': '#FEE2E2',
        'critical-ink': '#7F1D1D',
        'info-bg': '#DBEAFE',
        'info-ink': '#1E3A8A',
      },
      minHeight: {
        touch: '44px',
      },
    },
  },
  plugins: [],
}
