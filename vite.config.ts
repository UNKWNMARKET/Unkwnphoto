import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The front end is a static Vite build; the API lives in /api as Vercel
// serverless functions. Run `vercel dev` locally to get both on one origin.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: "dist" }
});
