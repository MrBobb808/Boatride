# Pixel Art 2.0

The world renders at one pixel per authored world unit, enlarged without smoothing. The HUD, touch controls and menus retain full screen resolution. Sprites, scenery, NPCs, bosses, effects and special poses share a consistent pixel grid.

## Original artwork

Six original transparent raster atlases were created for this game with the built-in image-generation tool, then packed into 384 × 384 indexed PNGs (96 × 96 cells). The runtime atlases total approximately 174 KB and are embedded in the single production HTML by Vite, including for offline play. No third-party game art is used.

| Atlas | Active designs, top to bottom |
| --- | --- |
| foes-ashen.png | Husk, Sentinel, Archer, Knight |
| foes-shinar.png | Brute, Bulwark, Fire-Priest, Scribe |
| foes-beasts.png | Hound, Lion, Drone, Locust Soldier |
| foes-veil.png | Wisp, Vessel; two reserve designs are not used |
| echo-vanguard.png | Sentinel, Archer, Brute, Bulwark |
| echo-sovereign.png | Knight, Marshal, Locust, Lion |

Each active design has four illustrated key poses: ready, stride, anticipation and impact. spriteMotion.ts selects poses from gameplay state; melee Echoes use their real move duration and hit fraction. These are compact keyframe animations, not long hand-drawn cycles. Hit flashes, dying/purification states, Echo materialization, recall, evolution marks and slice clipping remain supported. Bosses and NPCs retain their specialized procedural animations through the pixel world renderer.

sprite-manifest.json records each row's foot origin and reference height. Packing uses a consistent scale per character across poses, preserves transparency and removes isolated atlas-border debris. creatureSprites.ts loads and caches atlases and white hit masks once, without per-frame image allocation. Failed loads fall back to procedural pixel bodies.

Elior retains elior-sprites.png (16 frames, three outfits). Equipment, defensive moves, finishers and Shadow Mantle no longer disable it. Headgear uses pixel overlays; Mantle uses a cached tinted atlas. Equipped weapons and combat trails still use the live skeleton. The ?classicArt query is a developer comparison mode.

## Delivery and validation

- npm ci && npm run build: strict TypeScript, controller checks and production bundle.
- node --test scripts/update.test.mjs: offline behavior, failed-response protection and matching build stamps.
- npx playwright install --with-deps chromium && node scripts/smoke.mjs: desktop/mobile Chromium checks against built /Boatride/ URLs. Covers all regular foes/Echoes, movement, equipment, Mantle, save resume and offline startup. Screenshots are in qa/ and the Actions artifact remnant-browser-checks.
- GitHub Actions gates publication on these checks. Only the default branch deploys.
- version.json, HTML metadata and the worker share one numeric build stamp, readable by older installed copies. Navigation and update probes bypass HTTP caching; failed responses never replace the offline document.
- No save schema or combat-stat changes. Physical iPhone/Safari and Bluetooth hardware remain device checks; Chromium mobile emulation does not replace those.

## Art briefs

Each sheet: transparent 4 × 4 side-view pixel atlas, four original species by four poses, facing right with consistent anatomy, baseline and palette. Corrupted creatures: charcoal/plum and red, orange or cyan accents. Echoes: black, warm gold and ivory.

### foes-ashen

HUSK: gaunt hunched ash-gray corrupted villager in torn burgundy tunic, narrow ragged body, long claw hands, no weapon

SENTINEL: tall broad purple-black armored guard with enclosed hornless peaked helm, long straight sword and tall tombstone shield

ARCHER: slender hooded dark plum ranger with a large recurved bow and arrow, quiver and long asymmetrical coat

KNIGHT: athletic black-steel knight in battered red cape, crested enclosed helmet, long greatsword held in two hands

### foes-shinar

BRUTE: huge round-shouldered stone-and-iron executioner, tiny enclosed head, massive shoulder plates and giant rectangular hammer

BULWARK: stocky bronze fortress guard, enormous rectangular shield and long horizontal spear, spiked helmet

PRIEST: tall Babylonian fire-priest, dark scarlet and burnt gold robes, stepped headdress, long staff with an orange ember brazier

SCRIBE: thin haunted scholar with deep indigo trailing robes, pointed hood, open glowing cyan book and long quill

### foes-beasts

HOUND: low quadrupedal emaciated shadow wolf, purple-black fur, bony spine and long thin tail, glowing red eyes, long fangs

LION: broad muscular quadrupedal brazen lion, layered bronze armor mane, scorched umber body, orange eyes, thick paws and curved tail

DRONE: small flying locust insect, horizontal dark green segmented body, six thin legs, translucent pixelated wings, orange eyes

SOLDIER: tall upright humanoid locust warrior, dark green chitin armor, mandible insect head, folded translucent wings and two long scythe forearms

### foes-veil

WISP: small floating purple flame spirit, sharp eye slit inside hollow black core, three trailing jagged spectral tendrils, no humanoid legs

VESSEL: possessed ornate golden amphora, cracked bulbous bronze urn body, purple fire pouring out of its neck, two floating handle arms and spectral tapered base

MARSHAL: imposing black-steel field commander, crown-like enclosed helmet, huge garnet shoulder cape, ornate gold-edged two-handed sword

WARDEN: tall ceremonial armored executioner, black iron segmented armor, violet visor, heavy broad axe and tattered dark cape

### echo-vanguard

SENTINEL ECHO: tall broad black obsidian armored guardian with gold filigree and white eye slit, enclosed peaked helmet, luminous ivory straight sword and gold-rimmed tombstone shield

ARCHER ECHO: slender white hooded ranger in black-gold coat, gold recurved bow and white arrow, bright white eyes under hood

BRUTE ECHO: enormous broad round-shouldered black obsidian armored juggernaut, gold shoulder slabs and huge ivory rectangular warhammer, tiny sealed glowing-eyed head

BULWARK ECHO: stocky black-gold fortress soldier with huge rectangular gold shield and long white spear, squared crown helmet

### echo-sovereign

KNIGHT ECHO: athletic black obsidian armored knight, bright gold trim, pale cloth cape, crested enclosed helm and long ivory two-handed greatsword

MARSHAL ECHO: towering black-gold commander, narrow crowned helmet, flowing deep red cape edged ivory, enormous gold-edged silver sword

LOCUST ECHO: upright humanoid locust sovereign in obsidian chitin with gold seams, luminous ivory mandibles, pale pixel wings and two long ivory scythe forearms

LION ECHO: broad muscular quadrupedal lion made of black obsidian armor, ornate gold mane, white fire eyes, ivory claws and curved gold tail
