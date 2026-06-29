import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        atrium: {
          bg:           '#0a0c1a',
          surface:      '#10132a',
          elevated:     '#181c35',
          border:       '#252945',
          text:         '#e0e2f0',
          muted:        '#6a6e90',
          dim:          '#3a3e60',
          accent:       '#7c6af7',
          'accent-dim': '#1e1a40',
          success:      '#4ade80',
          error:        '#f87171',
          warning:      '#fbbf24',
          info:         '#60a5fa',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
