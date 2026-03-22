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
          sidebar: "#071A2F",
        },
        border: {
          DEFAULT: "#D9E2EC",
          strong: "#C5D0DD",
        },
        text: {
          title: "#0B1324",
          primary: "#243447",
          secondary: "#526277",
          muted: "#7C8CA3",
        },
        brand: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          active: "#1E40AF",
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
          header: "#F4F7FB",
          hover: "#F4F8FD",
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
