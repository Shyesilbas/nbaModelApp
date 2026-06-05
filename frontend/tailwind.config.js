/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nba: {
          dark: "#060a13",
          darker: "#03050a",
          card: "rgba(15, 23, 42, 0.45)",
          gold: "#e2b857",
          teal: "#06b6d4",
        }
      }
    },
  },
  plugins: [],
}
