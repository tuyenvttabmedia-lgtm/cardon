import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        admin: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
          950: '#4c0519',
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px rgb(15 23 42 / 0.04)',
        'panel-hover': '0 4px 12px rgb(15 23 42 / 0.08), 0 16px 36px rgb(15 23 42 / 0.06)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
