// A static server for dist/ at /Boatride/phaser/, as GitHub Pages serves it.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const dist = resolve('dist');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
export async function serve() {
  const server = createServer(async (req, res) => {
    let path = new URL(req.url, 'http://localhost').pathname.replace(/^\/Boatride\/phaser\//, '');
    if (!path || path.endsWith('/')) path += 'index.html';
    try {
      const file = resolve(dist, path);
      if (!file.startsWith(dist + '/')) throw Error('Path');
      res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://localhost:${server.address().port}/Boatride/phaser/`, close: () => server.close() };
}
