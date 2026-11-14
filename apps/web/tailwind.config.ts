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
          // Brand primary from logo green (#079B49); navy = deep brand for surfaces/type.
          navy: '#055A2C',
          primary: '#079B49',
          blue: '#079B49',
          orange: '#FF7A00',
          green: '#079B49',
          bg: '#F5F7FA',
          dark: '#0F172A',
          gray: '#6B7280',
          light: '#F3F4F6',
          border: '#E5E7EB',
          danger: '#EF4444',
        },
        brand: {
          50: '#ecfdf3',
          100: '#d1fae0',
          500: '#079B49',
          600: '#068a41',
          700: '#055A2C',
          900: '#043f1f',
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
