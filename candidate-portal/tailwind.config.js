/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#C62828',
          hover: '#B71C1C',
          light: '#FFEBEE',
          50: '#FFEBEE',
          100: '#FFCDD2',
          600: '#E53935',
          700: '#C62828',
          800: '#B71C1C',
          900: '#7F0000',
        },
        surface: {
          DEFAULT: '#F9FAFB',
          secondary: '#F3F4F6',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
        modal: '0 20px 40px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)',
      },
      maxWidth: {
        content: '720px',
        wide: '1024px',
        page: '1280px',
      },
    },
  },
  plugins: [],
};
