/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '24px' },
      boxShadow: { sm: '0 2px 8px rgba(32, 65, 116, 0.06)' },
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#e3efff',
          500: '#1673f4',
          600: '#0f6bea',
          700: '#095ac9',
          900: '#123264',
        },
        surface: '#f3f7fd',
        slate: {
          50: '#f8fbff', 100: '#edf3fb', 200: '#e1eaf6',
          300: '#cbd8eb', 400: '#657590', 500: '#586d8d',
          600: '#465d7f', 700: '#304a70', 800: '#1d3456', 900: '#101c35',
        },
        success: '#16865c',
        warning: '#c97800',
        danger: '#c13b3b',
      },
    },
  },
  plugins: [],
}