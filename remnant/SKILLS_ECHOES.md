# Combat loadouts and evolved Echoes

Menu → Skills now has **Equip abilities**, **Super moves**, and **Passive skills** pages. Pick one of three named ability slots, then equip from the complete twelve-skill catalog. Locked skills show how to unlock them; equipping a skill already in another slot exchanges the two skills. Touch buttons show the equipped skill's icon and accessible name. Keyboard and controller bindings remain unchanged.

Four new active skills join the eight existing ones: Chain Snare (pull and interrupt), Rift Assault (safe blink and guard break), Mending Light (18% maximum health over six seconds), and Winter Halo (area damage and four seconds of chill). Recovering the relic unlocks Snare and Mending; Assault unlocks at level five, Halo at ten. Existing story and passive-tree unlocks remain intact. Saves with the relic receive eligible new choices on load, and leveling unlocks later choices.

All supers use the existing battle-earned gauge. Choose Rally the Remnant for army-wide damage, Umbral Tempest for five targeted teleport cuts, Dawnfall for three area strikes, or Covenant Renewal for 45% health, full Energy, active Echo revival, and a brief barrier. Empty or obstructed targets do not spend Tempest's gauge. The Shadow Mantle stays a separate transformation, retaining pursuit and weapon throw/blink combos.

**Regeneration** is a three-rank Guardian passive, one skill point each. Each rank restores 0.5% maximum health per second after four seconds without taking damage. Blocked damage also interrupts recovery. It pauses during cutscenes, respects the health cap, and cannot revive a dead hero. The Character screen shows its rate. Mending Light and Renewal supply healing during combat.

## Echo roles and evolution

Every owned Echo can freely choose one of six roles from its detail card. Its original creature silhouette, identity, level, order, and evolution remain. Small colored role emblems and caster orbs identify the new jobs. Signatures have independent cooldowns; role changes cannot reset a running cooldown. Echoes gain improved health and damage, keep a hero-level assistance bonus, and earn their own combat levels up to 100. Every earned level raises health and attack, including when the hero is much stronger.

| Role | Behavior | Evolution additions |
| --- | --- | --- |
| Guardian | Shields and intercepts, draws attacks, brief ally barriers | Longer barriers and improved blocks |
| Mage | Homing arcane volleys from range | Targeted pillars, then chain lightning |
| Ninja | Blink strings and throwing stars | Attacking shadow doubles, then a third double and spiral energy burst |
| Fighter | Fast strings and a launching guard-break strike | Seismic waves, then health recovery on landed melee blows |
| Healer | Nearby party healing and supporting bolts | Stronger heals and Energy recovery |
| Ranger | Ranged arrows and spacing | Piercing shots and a six-arrow rain |

Defaults: Sentinel → Guardian; Archer → Mage; Bulwark → Healer; Knight/Marshal/Locust King → Ninja; Brute/Lion → Fighter. Every role is selectable on every Echo. Heavy enemies and bosses retain their resistance to displacement.

Choose **Rematch original form** on an Echo's card to enter an unranked, escalating series against its actual original creature. The Marshal and Locust King use their real boss encounters. Defeats earn matching imprints, saved until absorbed in Menu → Echoes. Matching bosses in the standard Boss Gauntlet also award their imprints. First absorption recruits; repeating a matching form advances the same Echo immediately to Stage II and then III, with no material or level requirement. Further absorptions heal and raise Echo level up to 100. Older duplicate roster entries merge once by species, combining lifetime experience and absorptions, advancing evolution and adding reinforcement experience. The first active identity, role and nickname take priority; commander status and all squad/formation references are preserved. The migrated roster is saved immediately. Rematches do not change campaign completion, quests, or ranked gauntlet records.

Save additions are optional: equippedSuper, echoImprints, EchoInst.role, and EchoInst.absorptions. Migration fills older saves; New Game+ carries these choices forward. No new runtime dependencies.

## Verification

Build and strict TypeScript, ten controller checks, five offline/update checks, desktop/phone production smoke, existing combat/boss-gauntlet coverage, and scripts/skills-echoes.mjs. The new production-browser checks cover old saves, unique slot swaps, unlocks, passive training, actual casts and supers, resource/cooldown guards, regeneration interruption and death, role-specific attacks/support, walls, absorption identity/cost, original rematches, and phone equip/super input. QA screenshots are retained by CI. Physical iPhone/Safari and controller hardware remain device checks.
