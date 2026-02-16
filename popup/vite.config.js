import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [react()],

  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "../core"),
    },
  },

  server: {
    fs: {
      // Allow serving files from the core directory for development.
      allow: [path.resolve(__dirname, "..")],
    },
  },

  build: {
    outDir: path.resolve(__dirname, "../extension/popup"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, "index.html"),
        options: path.resolve(__dirname, "options.html"),
      },
    },
  },
});
