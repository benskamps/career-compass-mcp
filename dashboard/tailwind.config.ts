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
          base: "var(--color-bg-base)",
          surface: "var(--color-bg-surface)",
          elevated: "var(--color-bg-elevated)",
        },
        "brand-border": "var(--color-brand-border)",
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          muted: "var(--color-accent-muted)",
        },
        status: {
          discovered: "var(--color-status-discovered)",
          applied: "var(--color-status-applied)",
          screening: "var(--color-status-screening)",
          interviewing: "var(--color-status-interviewing)",
          offer: "var(--color-status-offer)",
          negotiating: "var(--color-status-negotiating)",
          accepted: "var(--color-status-accepted)",
          rejected: "var(--color-status-rejected)",
          withdrawn: "var(--color-status-withdrawn)",
          ghosted: "var(--color-status-ghosted)",
        },
        priority: {
          high: "var(--color-priority-high)",
          medium: "var(--color-priority-medium)",
          low: "var(--color-priority-low)",
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
