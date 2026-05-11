import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages from repo root: set base to repo name if needed, e.g. base: "/A-Song-of-Ice-and-Fire/"
export default defineConfig({
  plugins: [react()],
  base: "./",
  publicDir: "public",
});
