import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/finance/",
  server: {
    host: "::",
    port: 5173,
    proxy: {
      // Frontend always calls /finance/api/*. In dev the backend runs at the
      // root (app.main:app), so strip the /finance prefix before proxying.
      "/finance/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/finance/, ""),
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
