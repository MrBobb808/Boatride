import { defineConfig } from 'vite';

// The Phaser rebuild shares engine-free data (rooms, tiles, items) and the PNG
// sprite sheets with ../remnant until the old engine is retired.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 2000, reportCompressedSize: false },
  server: { host: true, port: 5174, fs: { allow: ['..'] } },
});
