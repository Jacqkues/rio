import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The console is served by the Worker as static assets (wrangler.toml [assets]).
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  // VITE_* from the repo .env (h-tutor/.env), e.g. VITE_POSTHOG_KEY.
  envDir: "../..",
  build: { outDir: "dist", emptyOutDir: true },
  // App icons are shared with the Rio app (../../src/assets/apps).
  server: { fs: { allow: ["..", "../.."] } },
});
