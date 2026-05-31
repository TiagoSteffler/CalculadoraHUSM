import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'images/app_icon192x192.png',
        'images/app_icon512x512.png',
        'images/app_icon180x180.png',
        'images/app_icon167x167.png',
        'images/app_icon152x152.png',
        'images/app_icon.png',
        'images/ampola.svg'
      ],
      manifest: {
        name: 'Calculadora HUSM',
        short_name: 'Calculadora HUSM',
        description: 'Calculadora HUSM',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f3fbf9',
        theme_color: '#0f766e',
        icons: [
          {
            src: 'images/app_icon192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'images/app_icon512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      }
    })
  ],
  base: './'
})
