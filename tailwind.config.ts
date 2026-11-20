import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.tsx", "./components/**/*.tsx"],
  theme: { extend: { colors: { ink: "#0B2A33", teal: { DEFAULT: "#0F766E", soft: "#E3F3F0", deep: "#0A4F4A" }, amber: { token: "#F2A33A" }, mist: "#F5F8F8" }, fontFamily: { sans: ["Figtree", "system-ui", "sans-serif"] } } },
} satisfies Config;
