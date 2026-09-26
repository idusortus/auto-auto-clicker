import { defineConfig } from "vite";

// engine-core is consumed as TypeScript source through an npm-workspace symlink.
// Excluding it from dependency pre-bundling keeps Vite transforming the linked
// source instead of trying to treat it as a pre-built node_modules dependency.
export default defineConfig({
  plugins: [],
  optimizeDeps: {
    exclude: ["@auto-auto-clicker/engine-core"],
  },
});
