import { defineConfig } from 'vite';
import { copyFile } from 'node:fs/promises';

const serviceWorkerPlugin = {
  name: 'copy-pwa-service-worker',
  apply: 'build',
  async closeBundle() {
    await copyFile('pomodoro-pwa/sw.js', 'dist/sw.js');
  },
};

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://i.ytimg.com; font-src 'self'; connect-src 'self' https://www.googleapis.com https://de1.api.radio-browser.info https://api.open-meteo.com; frame-src https://www.youtube.com; media-src 'self' https: blob:; worker-src 'self' blob:",
};

export default defineConfig({
  plugins: [serviceWorkerPlugin],
  root: 'pomodoro-pwa',
  publicDir: 'public',
  preview: { host: '127.0.0.1', headers: securityHeaders },
  server: {
    host: '127.0.0.1',
    headers: securityHeaders,
  },
  appType: 'spa',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
