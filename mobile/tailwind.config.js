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
      colors: {
        primary: {
          50: '#eef8ff',
          100: '#d9efff',
          500: '#1677c8',
          600: '#0f64ad',
          700: '#0d508b',
          900: '#123652',
        },
        surface: '#f5f7fa',
        success: '#16865c',
        warning: '#c97800',
        danger: '#c13b3b',
      },
    },
  },
  plugins: [],
}