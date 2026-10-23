import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const linkShim = new URL("./shared/shell/NextLinkPreview.tsx", import.meta.url).pathname;
const imageShim = new URL("./shared/shell/NextImagePreview.tsx", import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "lucide-react"],
    alias: [
      { find: "next/link", replacement: decodeURIComponent(linkShim) },
      { find: "next/image", replacement: decodeURIComponent(imageShim) },
    ],
  },
  server: { port: 3321, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
