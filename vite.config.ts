import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Trip English · 旅行英语冲刺",
        short_name: "Trip English",
        description: "意大利与瑞士旅行前的口语、阅读冲刺小游戏",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        background_color: "#f8f0df",
        theme_color: "#f8f0df",
        lang: "zh-CN",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,json,aiff,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: []
      }
    })
  ]
});
