// The main URL adopts the original device's three slots once. The original
// keys and any earlier Phaser journeys remain recoverable; preview URLs do
// not perform the switch-over migration.
const here = new URL(location.href).pathname.replace(/index\.html$/, '');
const isMain = !/\/(phaser|classic)\/?$/.test(here);
if (isMain) {
  try {
    const marker = 'remnant-phaser.main-cutover.v1';
    if (!localStorage.getItem(marker)) {
      const migrated: number[] = [];
      for (let slot = 0; slot < 3; slot++) {
        const original = localStorage.getItem(`remnant-save-${slot}`);
        if (!original) continue;
        let save; try { save = JSON.parse(original); } catch { continue; }
        if (save.version !== 1 || typeof save.level !== 'number') continue;
        const key = slot === 0 ? 'remnant-phaser.save.v2' : `remnant-phaser.save.slot${slot}`;
        const old = localStorage.getItem(key);
        if (old && !localStorage.getItem(`remnant-phaser.before-cutover.slot${slot}`)) localStorage.setItem(`remnant-phaser.before-cutover.slot${slot}`, old);
        save.flags ??= {}; save.flags.phaser_loadout_v1 = true;
        localStorage.setItem(key, JSON.stringify(save)); migrated.push(slot);
      }
      if (migrated.length) {
        const last = Number(localStorage.getItem('remnant-last-slot') ?? migrated[0]);
        localStorage.setItem('remnant-phaser.active-slot', String(migrated.includes(last) ? last : migrated[0]));
        const prefs = localStorage.getItem('remnant-settings-v1');
        if (prefs) {
          const old = localStorage.getItem('remnant-phaser.settings.v1');
          if (old) localStorage.setItem('remnant-phaser.before-cutover.settings', old);
          localStorage.setItem('remnant-phaser.settings.v1', prefs);
        }
      }
      localStorage.setItem(marker, JSON.stringify({ at: Date.now(), slots: migrated }));
    }
  } catch { /* A storage failure leaves the source slots intact and import remains available. */ }
}
