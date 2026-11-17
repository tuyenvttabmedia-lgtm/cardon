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
        cardon: {
          // UI brand tone #02603f (logo wordmark keeps its own greens).
          navy: '#014530',
          primary: '#02603f',
          blue: '#02603f',
          orange: '#FF7A00',
          green: '#02603f',
          bg: '#F5F7FA',
          dark: '#0F172A',
          gray: '#6B7280',
          light: '#F3F4F6',
          border: '#E5E7EB',
          danger: '#EF4444',
        },
        brand: {
          50: '#e8f5ef',
          100: '#cfe8db',
          500: '#02603f',
          600: '#014f34',
          700: '#014530',
          900: '#012a1c',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 20px rgba(15, 23, 42, 0.06)',
        'card-hover': '0 8px 30px rgba(15, 23, 42, 0.1)',
      },
      maxWidth: {
        site: '1200px',
      },
    },
  },
  plugins: [],
};

export default config;
