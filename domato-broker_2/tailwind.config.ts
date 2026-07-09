import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light "operating console" surface — base app background, card
        // surfaces and hairline borders.
        ink: {
          DEFAULT: "#F4F5F7",
          panel: "#FFFFFF",
          border: "#E7E9EE",
        },
        // Primary accent — reused across the app as the CTA/active-state
        // color. Kept as a near-black tone (not literal gold) to match the
        // Eureka reference: solid dark buttons, not tinted ones.
        gold: {
          DEFAULT: "#171A21",
          bright: "#2E3341",
        },
        gain: "#1FAE6D",
        loss: "#E5484D",
        warn: "#D97706",
        // Primary text on light surfaces (was the light-on-dark body copy
        // color; same role, new value).
        paper: "#171A21",
        muted: "#6E7684",
        // Dark sidebar — the one place the console stays black, echoing
        // the reference dashboard's fixed dark rail against a light canvas.
        sidebar: {
          DEFAULT: "#14171C",
          hover: "#1D212B",
          active: "#22262F",
          text: "#E7E9EE",
          muted: "#868FA0",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};
export default config;
