import { defineConfig, type Plugin } from 'vite';
import { resolve, relative, sep } from 'node:path';

// The Phaser rebuild shares engine-free data (rooms, tiles, items) and the PNG
// sprite sheets with ../remnant until the old engine is retired. The original
// bosses and foes run on Phaser through the classic layer (src/classic): when
// one of their modules imports an engine service, it gets the Phaser-side
// stand-in from src/classic/shim instead.
const ORIGINAL = resolve(__dirname, '../remnant/src');
const SHIMS: Record<string, string> = {
  'game/ctx.ts': 'src/classic/shim/ctx.ts',
  'audio/audio.ts': 'src/classic/shim/audio.ts',
  'audio/music.ts': 'src/classic/shim/music.ts',
  'core/settings.ts': 'src/classic/shim/settings.ts',
  'render/lighting.ts': 'src/classic/shim/lighting.ts',
  'core/input.ts': 'src/classic/shim/input.ts',
};

function classicShims(): Plugin {
  return {
    name: 'classic-shims',
    enforce: 'pre',
    async resolveId(source, importer, opts) {
      if (!importer || !importer.startsWith(ORIGINAL)) return null;
      const r = await this.resolve(source, importer, { ...opts, skipSelf: true });
      if (!r) return null;
      const shim = SHIMS[relative(ORIGINAL, r.id).split(sep).join('/')];
      return shim ? resolve(__dirname, shim) : null;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [classicShims()],
  build: { target: 'es2020', chunkSizeWarningLimit: 2000, reportCompressedSize: false },
  server: { host: true, port: 5174, fs: { allow: ['..'] } },
});
