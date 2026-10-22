import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.PROJECTDOCUMENTAI_TEST === '1' ? 'http://127.0.0.1:8001' : 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
});
