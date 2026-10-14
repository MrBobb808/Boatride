// Bundled typefaces (SIL Open Font License), inlined so the game renders
// correctly offline from the home screen.

import cin400 from '@fontsource/cinzel/files/cinzel-latin-400-normal.woff2';
import cin700 from '@fontsource/cinzel/files/cinzel-latin-700-normal.woff2';
import cin900 from '@fontsource/cinzel/files/cinzel-latin-900-normal.woff2';
import cor400 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2';
import cor500 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2';
import cor600 from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2';
import cor500i from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2';

const faces: [string, string, string, string][] = [
  ['Cinzel', cin400, '400', 'normal'],
  ['Cinzel', cin700, '700', 'normal'],
  ['Cinzel', cin900, '900', 'normal'],
  ['Cormorant Garamond', cor400, '400', 'normal'],
  ['Cormorant Garamond', cor500, '500', 'normal'],
  ['Cormorant Garamond', cor600, '600', 'normal'],
  ['Cormorant Garamond', cor500i, '500', 'italic'],
  ['Cormorant Garamond', cor500i, '400', 'italic'],
];

export async function loadFonts() {
  if (!('FontFace' in window)) return;
  const loads = faces.map(async ([fam, url, weight, style]) => {
    try {
      const f = new FontFace(fam, `url(${url}) format('woff2')`, { weight, style, display: 'swap' });
      await f.load();
      document.fonts.add(f);
    } catch {
      /* fall back to system serif */
    }
  });
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
}
