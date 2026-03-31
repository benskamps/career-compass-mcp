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
          base: "#110f0d",
          surface: "#1c1a17",
          elevated: "#272421",
        },
        border: "#3a3632",
        text: {
          primary: "#E8E0D5",
          secondary: "#968f87",
          muted: "#686260",
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
          rejected: "#D44460",
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
