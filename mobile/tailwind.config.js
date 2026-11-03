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
      borderRadius: { xl: '9px', '2xl': '12px', '3xl': '14px' },
      boxShadow: { sm: '0 2px 0 rgba(16, 35, 50, 0.12)' },
      fontWeight: { medium: '600', semibold: '700', bold: '700' },
      fontSize: { xs: ['13px', {lineHeight:'19px'}], sm: ['14px', {lineHeight:'21px'}], base: ['16px', {lineHeight:'24px'}], lg: ['18px', {lineHeight:'26px'}], xl: ['20px', {lineHeight:'28px'}], '2xl': ['24px', {lineHeight:'31px'}], '3xl': ['28px', {lineHeight:'34px'}] },
      colors: {
        primary: {
          50: '#eef5f8',
          100: '#dfeef5',
          200: '#a9ccdc',
          300: '#a7cfdf',
          500: '#178db5',
          600: '#096e91',
          700: '#075671',
          900: '#12394a',
        },
        surface: '#ffffff',
        canvas: '#eef2f5',
        slate: {
          50: '#eef2f5', 100: '#e9eef2', 200: '#cbd5df',
          300: '#b7c6d2', 400: '#536879', 500: '#435667',
          600: '#3c5264', 700: '#334b5c', 800: '#203849', 900: '#102332',
        },
        brand: { 50: '#eef7f0', 100: '#e2f0e5', 500: '#32875a', 600: '#087443', 700: '#075c35' },
        blue: { 50: '#eef5f8', 100: '#dfeef5', 200: '#a9ccdc', 500: '#178db5', 600: '#096e91', 700: '#075671', 800: '#185b72', 900: '#12394a' },
        emerald: { 50: '#eef7f0', 100: '#e2f0e5', 200: '#c8e1ce', 500: '#32875a', 600: '#087443', 700: '#075c35', 800: '#204e36', 900: '#1c3d2c' },
        success: '#087443',
        warning: '#c97800',
        danger: '#c13b3b',
      },
    },
  },
  plugins: [],
}