import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" lets the built site work from any folder on your hosting
export default defineConfig({ base: "./", plugins: [react()] });
