import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Every build is stamped, so an installed copy can tell when GitHub Pages
// has a newer one and update itself.
const BUILD = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const buildStamp: Plugin = {
  name: 'remnant-build-stamp',
  transformIndexHtml: (html) => html.replace('</head>', `<meta name="remnant-build" content="${BUILD}"></head>`),
};

// One self-contained index.html: the game runs offline from the home screen
// with nothing but the HTML, the manifest, the icons and the service worker.
export default defineConfig({
  base: './',
  plugins: [buildStamp, viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    reportCompressedSize: false,
  },
  server: { host: true, port: 5173 },
});
