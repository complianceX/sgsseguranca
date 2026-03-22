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
          bg: "#FFFFFF",
          subtle: "#F6F8FB",
          surface: "#FFFFFF",
          "surface-muted": "#FBFCFE",
          sidebar: "#F8FAFC",
        },
        border: {
          DEFAULT: "#E2E8F0",
          strong: "#CBD5E1",
        },
        text: {
          title: "#0F172A",
          primary: "#1E293B",
          secondary: "#475569",
          muted: "#94A3B8",
        },
        brand: {
          DEFAULT: "#1D4ED8",
          hover: "#1E40AF",
          active: "#1E3A8A",
          soft: "#EAF2FF",
        },
        success: {
          DEFAULT: "#15803D",
          soft: "#ECFDF3",
        },
        warning: {
          DEFAULT: "#B45309",
          soft: "#FFF7ED",
        },
        danger: {
          DEFAULT: "#B91C1C",
          soft: "#FEF2F2",
        },
        info: {
          DEFAULT: "#0369A1",
          soft: "#F0F9FF",
        },
        neutral: {
          badge: "#F1F5F9",
          disabled: "#F1F5F9",
        },
        table: {
          header: "#F8FAFC",
          hover: "#F8FBFF",
        },
        focus: "#93C5FD",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
      },
      borderRadius: {
        xl2: "1rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
