import type { Config } from "tailwindcss";

// Design tokens 1:1 overgenomen uit design_handoff_groomy_mvp/tokens/*.css
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#111111",
        accent: {
          DEFAULT: "#0EA5A4",
          dark: "#0B8584",
          soft: "#E6F5F5",
        },
        surface: "#F8F8F8",
        border: {
          DEFAULT: "#E5E7EB",
          soft: "#F1F2F4",
        },
        success: {
          DEFAULT: "#22C55E",
          soft: "#EAF9F0",
          text: "#15803D",
        },
        error: {
          DEFAULT: "#EF4444",
          soft: "#FDF1F1",
          text: "#B91C1C",
        },
        text: {
          primary: "#111111",
          secondary: "#6B7280",
          tertiary: "#9CA3AF",
          inverse: "#FFFFFF",
          accent: "#0EA5A4",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "-apple-system", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "10px",
        md: "14px",
        lg: "18px",
        xl: "24px",
        pill: "999px",
      },
      spacing: {
        "page": "20px",
      },
      height: {
        "ctrl-lg": "56px",
        "ctrl-md": "48px",
        "ctrl-sm": "36px",
      },
      boxShadow: {
        "focus-ring": "0 0 0 3px rgba(14,165,164,.35)",
      },
      transitionDuration: {
        fast: "150ms",
        med: "250ms",
      },
      transitionTimingFunction: {
        groomy: "cubic-bezier(.2,.8,.2,1)",
      },
      maxWidth: {
        phone: "390px",
      },
      maxHeight: {
        phone: "844px",
      },
    },
  },
  plugins: [],
};
export default config;
