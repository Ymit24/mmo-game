import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  const adminBearerToken =
    env.VITE_ADMIN_API_BEARER_TOKEN?.trim() ??
    env.ADMIN_API_BEARER_TOKEN?.trim() ??
    "";

  return {
    envDir: "../..",
    define: {
      "import.meta.env.VITE_ADMIN_API_BEARER_TOKEN":
        JSON.stringify(adminBearerToken),
    },
    plugins: [react(), tailwindcss()],
    server: {
      port: 5174,
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
