import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site under https://<user>.github.io/<repo>/
// so assets must be referenced from that subpath. Set VITE_BASE to "/<repo>/"
// (with leading and trailing slashes) when building for Pages, e.g.:
//   VITE_BASE=/shiftapp/ npm run build
// For a user/organization page (https://<user>.github.io/) or a custom domain,
// leave it as "/".
export default defineConfig(() => {
  const base = process.env.VITE_BASE || "/";
  return {
    base,
    plugins: [react()],
    build: {
      outDir: "dist",
      sourcemap: false,
    },
  };
});
