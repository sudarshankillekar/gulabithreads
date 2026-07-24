import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      clientPort: 5173,
    },
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
