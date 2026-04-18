import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import electron from "vite-plugin-electron/simple"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const electronExternalModules = ["node-llama-cpp"]

export default defineConfig({
  clearScreen: false,
  optimizeDeps: {
    exclude: electronExternalModules,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "tiptap-vendor": ["@tiptap/react", "@tiptap/starter-kit", "@tiptap/extension-placeholder"],
          "ui-vendor": ["lucide-react", "class-variance-authority", "clsx", "tailwind-merge"],
        },
      },
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main/index.ts",
        vite: {
          build: {
            rollupOptions: {
              external: electronExternalModules,
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, "electron/preload/index.ts"),
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
  },
})
