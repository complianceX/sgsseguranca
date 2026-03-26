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
          bg: "#F5F5F4",
          subtle: "#EFEEEC",
          surface: "#FFFFFF",
          "surface-muted": "#F6F3EF",
          sidebar: "#2F2B28",
        },
        border: {
          DEFAULT: "#D8D2CB",
          strong: "#C2BBB4",
        },
        text: {
          title: "#23201D",
          primary: "#2F2B28",
          secondary: "#66615B",
          muted: "#8A847E",
        },
        brand: {
          DEFAULT: "#4A443F",
          hover: "#37322E",
          active: "#262320",
          soft: "#ECE8E3",
        },
        success: {
          DEFAULT: "#15803D",
          soft: "#ECF7F1",
        },
        warning: {
          DEFAULT: "#B45309",
          soft: "#FBF1E6",
        },
        danger: {
          DEFAULT: "#B91C1C",
          soft: "#FBEDED",
        },
        info: {
          DEFAULT: "#6E6862",
          soft: "#F2EFEB",
        },
        neutral: {
          badge: "#EFEAE5",
          disabled: "#E7E1DA",
        },
        table: {
          header: "#F2EFEB",
          hover: "#EFEAE5",
        },
        focus: "#B8AEA6",
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
