import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Relative base: this build gets copied verbatim into /biblemem/, /knowledge/,
// and /midi/ (same JS bundle, deployed to multiple paths) so each serves as
// a real top-level path instead of being nested under a root.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      app: path.resolve(__dirname, "./src/app.ts"),
      "@": path.resolve(__dirname, "./src"),
      utils: path.resolve(__dirname, "./src/utils"),
    },
  },
  build: {
    outDir: "dist",
  },
});
