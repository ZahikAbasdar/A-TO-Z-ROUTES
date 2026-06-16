import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // ── Brand color palette ──────────────────────────────────────────────
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        // ── A to Z Routes brand tokens ──────────────────────────────────
        brand: {
          50:  "#eef5ff",
          100: "#d9e8ff",
          200: "#bcd5ff",
          300: "#8eb8ff",
          400: "#5990ff",
          500: "#3370f5",  // primary blue
          600: "#1a52e0",
          700: "#1540b8",
          800: "#163595",
          900: "#172f7a",
          950: "#111e4e",
        },
        neon: {
          blue:  "#3370f5",
          cyan:  "#06d6e8",
          green: "#00e5a0",
          amber: "#f5a623",
        },
        surface: {
          0:   "#0a0d14",   // deepest background
          1:   "#0f1219",   // page background
          2:   "#151a25",   // card background
          3:   "#1c2333",   // elevated card
          4:   "#242d40",   // hover / active
          border: "#2a3348",
        },
      },

      // ── Typography ────────────────────────────────────────────────────
      fontFamily: {
        sans:    ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono:    ["var(--font-geist-mono)", "monospace"],
        display: ["var(--font-cabinet)", "var(--font-geist-sans)", "sans-serif"],
      },

      // ── Spacing / sizing ──────────────────────────────────────────────
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },

      // ── Custom keyframes ──────────────────────────────────────────────
      keyframes: {
        "fade-in": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-left": {
          "0%":   { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulse_soft: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.5" },
        },
        "spin-slow": {
          "0%":   { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 8px 0px hsl(var(--primary)/0.4)" },
          "50%":      { boxShadow: "0 0 20px 4px hsl(var(--primary)/0.6)" },
        },
      },
      animation: {
        "fade-in":      "fade-in 0.3s ease-out",
        "fade-in-left": "fade-in-left 0.3s ease-out",
        "slide-up":     "slide-up 0.4s ease-out",
        "scale-in":     "scale-in 0.2s ease-out",
        shimmer:        "shimmer 2s linear infinite",
        pulse_soft:     "pulse_soft 2s ease-in-out infinite",
        "spin-slow":    "spin-slow 3s linear infinite",
        glow:           "glow 2s ease-in-out infinite",
      },

      // ── Box shadows ────────────────────────────────────────────────────
      boxShadow: {
        card:  "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        glow:  "0 0 20px rgba(51,112,245,0.25)",
        "glow-sm": "0 0 10px rgba(51,112,245,0.2)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
