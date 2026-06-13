import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the Vite dev server (port 5173) proxies API and uploaded
// files to the Express backend (port 3001) so the front end can use
// same-origin relative URLs like `/api/photos` and `/uploads/<file>`.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/uploads": "http://localhost:3001"
    }
  }
});
