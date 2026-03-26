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
          bg: "#F6F5F3",
          subtle: "#F0EEEA",
          surface: "#FFFFFF",
          "surface-muted": "#ECE8E3",
          sidebar: "#2C2825",
        },
        border: {
          DEFAULT: "#B7AEA5",
          strong: "#8F8882",
        },
        text: {
          title: "#25221F",
          primary: "#25221F",
          secondary: "#5C5650",
          muted: "#77706A",
        },
        brand: {
          DEFAULT: "#3E3935",
          hover: "#2C2825",
          active: "#25221F",
          soft: "#ECE8E3",
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
          DEFAULT: "#57534E",
          soft: "#F1EEEA",
        },
        neutral: {
          badge: "#ECE8E3",
          disabled: "#E2DBD4",
        },
        table: {
          header: "#F0EEEA",
          hover: "#ECE8E3",
        },
        focus: "#67615B",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(37, 34, 31, 0.05), 0 1px 3px rgba(37, 34, 31, 0.08)",
      },
      borderRadius: {
        xl2: "1rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
