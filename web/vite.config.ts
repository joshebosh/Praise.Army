import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base: this build gets copied verbatim into both /biblemem/ and
// /knowledge/ (same JS bundle, deployed twice) so each serves as a real
// top-level path instead of Knowledge living behind a #hash under BibleMem.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
