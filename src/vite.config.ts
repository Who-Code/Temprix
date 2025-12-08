import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { fileURLToPath, URL } from 'node:url';

const frontendRoot = fileURLToPath(new URL('./frontend', import.meta.url));

export default defineConfig({
  root: frontendRoot,
  plugins: [
    vue(),
    vuetify({
      autoImport: true,
      styles: { configFile: 'src/styles/vuetify-settings.scss' },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    fs: {
      allow: [
        frontendRoot,
        fileURLToPath(new URL('./src', import.meta.url)),
        fileURLToPath(new URL('./src/src/assets', import.meta.url)),
        fileURLToPath(new URL('./node_modules', import.meta.url)),
      ],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend/src', import.meta.url)),
      '@assets': fileURLToPath(new URL('./src/src/assets', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        settings: fileURLToPath(new URL('./frontend/settings.html', import.meta.url)),
        report: fileURLToPath(new URL('./frontend/report.html', import.meta.url)),
      },
    },
  },
});
