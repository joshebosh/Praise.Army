import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base: this build gets copied verbatim into /biblemem/, /knowledge/,
// and /midi/ (same JS bundle, deployed to multiple paths) so each serves as
// a real top-level path instead of being nested under a root.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
