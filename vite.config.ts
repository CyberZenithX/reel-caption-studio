import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// COOP/COEP are harmless here and keep the door open for the multi-threaded
// ffmpeg core if you ever swap it in. The single-thread core used by default
// does not require them.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
});
