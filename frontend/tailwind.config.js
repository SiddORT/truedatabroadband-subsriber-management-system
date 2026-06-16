import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#1F4959",
          dark: "#011425",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#5C7C89",
          foreground: "#FFFFFF",
        },
        background: "#F5F7F8",
        surface: "#FFFFFF",
        foreground: "#242424",
        border: "#D9E1E5",
        muted: {
          DEFAULT: "#EEF2F4",
          foreground: "#5C7C89",
        },
        destructive: {
          DEFAULT: "#B42318",
          foreground: "#FFFFFF",
        },
        sidebar: {
          DEFAULT: "#011425",
          foreground: "#FFFFFF",
          muted: "#5C7C89",
          active: "#1F4959",
        },
        accent: {
          DEFAULT: "#D72B20",
          foreground: "#FFFFFF",
        },
      },
      borderRadius: {
        sm: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(2, 20, 37, 0.06), 0 4px 16px rgba(2, 20, 37, 0.06)",
        card: "0 1px 2px rgba(2, 20, 37, 0.04), 0 8px 24px rgba(2, 20, 37, 0.05)",
        focus: "0 0 0 3px rgba(31, 73, 89, 0.15)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s ease-out",
      },
    },
  },
  plugins: [animate],
};
