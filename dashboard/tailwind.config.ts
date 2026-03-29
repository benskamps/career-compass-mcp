import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0d0d0d",
          surface: "#1a1a1a",
          elevated: "#242424",
        },
        border: "#333333",
        text: {
          primary: "#E8E0D5",
          secondary: "#999999",
          muted: "#666666",
        },
        accent: {
          DEFAULT: "#D97706",
          hover: "#F59E0B",
          muted: "rgba(217, 119, 6, 0.2)",
        },
        status: {
          discovered: "#64748B",
          applied: "#3B82F6",
          screening: "#6366F1",
          interviewing: "#D97706",
          offer: "#059669",
          negotiating: "#EAB308",
          accepted: "#22C55E",
          rejected: "rgba(244, 63, 94, 0.7)",
          withdrawn: "#6B7280",
          ghosted: "#4B5563",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)"],
        mono: ["var(--font-geist-mono)"],
      },
      borderRadius: {
        card: "8px",
        button: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
