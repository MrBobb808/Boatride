// The Boss Rush's keys and names in story order, apart from the boss classes, so a screen that only counts beaten
// bosses (the home screen, chapter select) does not load every boss (NEXT_PLAN A3).
export const RUSH_KEYS: readonly { key: string; name: string; music?: string }[] = [
  { key: 'idol', name: 'The Gilded Idol' },
  { key: 'gatekeeper', name: 'The Gatekeeper' },
  { key: 'marshal', name: 'The Crimson Marshal' },
  { key: 'locust_king', name: 'The Locust King' },
  { key: 'golden_image', name: 'The Image of Gold' },
  { key: 'weigher', name: 'The Weigher' },
  { key: 'storm_prince', name: 'The Prince of the Storm', music: 'storm' },
  { key: 'persia_prince', name: 'The Prince of Persia', music: 'persia' },
  { key: 'beast_monarch', name: 'Varkhos, Crown of the Hunt' },
  { key: 'plague_monarch', name: 'Morvane, Crown of Pestilence' },
  { key: 'cinder_monarch', name: 'Azkar, Crown of Cinders' },
  { key: 'grecia_prince', name: 'The Prince of Grecia' },
  { key: 'nation_gods', name: 'The Gods of the Nations' },
  { key: 'north_king', name: 'The King of the North' },
  { key: 'tyrus_prince', name: 'The Prince of Tyrus' },
];
/** The bosses this save has beaten, as rush keys in story order. */
export const rushRoster = (defeated: readonly string[]) => RUSH_KEYS.filter((b) => defeated.includes(b.key)).map((b) => b.key);
export const rushName = (key: string) => RUSH_KEYS.find((b) => b.key === key)?.name ?? key;
