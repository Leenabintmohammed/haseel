import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        env.VITE_SUPABASE_URL
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_KEY
      ),
    },

    resolve: {
      tsconfigPaths: true,
    },

    plugins: [
      cloudflare({
        viteEnvironment: {
          name: "ssr",
        },
      }),
      tailwindcss(),
      tanstackStart({
        server: {
          entry: "server",
        },
      }),
      react(),
    ],
  };
});
