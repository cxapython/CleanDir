/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-purple': 'linear-gradient(135deg, #1A0B2E 0%, #2A1B3D 100%)',
        'gradient-pink-orange': 'linear-gradient(90deg, #FF0080 0%, #FF8C00 100%)',
      },
    },
  },
  plugins: [],
}



