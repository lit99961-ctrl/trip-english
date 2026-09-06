import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function normalizeBasePath(value = "/"): string {
  const segments = value.split("/").filter(Boolean);
  return segments.length === 0 ? "/" : `/${segments.join("/")}/`;
}

const base = normalizeBasePath(process.env.BASE_PATH);

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      base,
      scope: base,
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Trip English · 旅行英语冲刺",
        short_name: "Trip English",
        description: "意大利与瑞士旅行前的口语、阅读冲刺小游戏",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: base,
        scope: base,
        background_color: "#f8f0df",
        theme_color: "#f8f0df",
        lang: "zh-CN",
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png" },
          { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png" },
          { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,json,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: []
      }
    })
  ]
});
