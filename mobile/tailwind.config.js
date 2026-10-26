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
      borderRadius: { xl: '12px', '2xl': '16px', '3xl': '18px' },
      boxShadow: { sm: '0 2px 8px rgba(37, 76, 81, 0.05)' },
      colors: {
        primary: {
          50: '#f0f7fa',
          100: '#e2f0f5',
          200: '#c9e2ec',
          300: '#a7cfdf',
          500: '#178db5',
          600: '#147b9d',
          700: '#0e6788',
          900: '#17485a',
        },
        surface: '#ffffff',
        slate: {
          50: '#f8fafb', 100: '#f2f6f7', 200: '#e5ebed',
          300: '#cbd8dc', 400: '#667980', 500: '#53646d',
          600: '#465b64', 700: '#374d56', 800: '#293e47', 900: '#213038',
        },
        brand: { 50: '#eef7f0', 100: '#e2f0e5', 500: '#32875a', 600: '#237347', 700: '#1d613c' },
        blue: { 50: '#f0f7fa', 100: '#e2f0f5', 200: '#c9e2ec', 500: '#178db5', 600: '#147b9d', 700: '#0e6788', 800: '#185b72', 900: '#17485a' },
        emerald: { 50: '#eef7f0', 100: '#e2f0e5', 200: '#c8e1ce', 500: '#32875a', 600: '#237347', 700: '#1d613c', 800: '#204e36', 900: '#1c3d2c' },
        success: '#237347',
        warning: '#c97800',
        danger: '#c13b3b',
      },
    },
  },
  plugins: [],
}