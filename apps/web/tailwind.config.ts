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
          navy: '#1E3A8A',
          primary: '#1E3A8A',
          blue: '#005BEA',
          orange: '#FF7A00',
          green: '#00B889',
          bg: '#F5F7FA',
          dark: '#0F172A',
          gray: '#6B7280',
          light: '#F3F4F6',
          border: '#E5E7EB',
          danger: '#EF4444',
        },
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#FF7A00',
          600: '#FF7A00',
          700: '#1E3A8A',
          900: '#1E3A8A',
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
