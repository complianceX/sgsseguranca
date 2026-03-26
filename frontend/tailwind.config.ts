import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./context/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "#F7FAFD",
          subtle: "#EDF4FB",
          surface: "#FFFFFF",
          "surface-muted": "#F2F7FD",
          sidebar: "#0E4E7F",
        },
        border: {
          DEFAULT: "#C6D7E8",
          strong: "#96B0CA",
        },
        text: {
          title: "#0F172A",
          primary: "#0F172A",
          secondary: "#36516B",
          muted: "#617B95",
        },
        brand: {
          DEFAULT: "#11598C",
          hover: "#0D4D79",
          active: "#0A3D61",
          soft: "#E8F1FA",
        },
        success: {
          DEFAULT: "#1D6B43",
          soft: "#EEF5F1",
        },
        warning: {
          DEFAULT: "#9A5A00",
          soft: "#FAF1E6",
        },
        danger: {
          DEFAULT: "#B3261E",
          soft: "#F9ECEB",
        },
        info: {
          DEFAULT: "#416E96",
          soft: "#EEF4FB",
        },
        neutral: {
          badge: "#F2F7FD",
          disabled: "#D9E6F2",
        },
        table: {
          header: "#EDF4FB",
          hover: "#F2F7FD",
        },
        focus: "#93C5FD",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.08)",
      },
      borderRadius: {
        xl2: "1rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
