# Weapon mastery, armor sets and contracts

The pause menu's **Progression** tab shows permanent weapon-family practice,
all set pieces, and the active two/three-piece bonuses. Equipment also links
to that screen and shows a selected item's set requirements.

## Weapon mastery

Blade, spear and greatsword each have ten ranks. Landed weapon hits grant one
point and finishers grant two; a foe pays at most eight points across weapon
swaps. Misses, absorbed blocks and invulnerable targets do not count. The
Mantle's thrown weapon counts on actual damage. Each rank grants 3% melee
damage for that family. Ranks 3/6/10 grant different family perks shown in
`game/progression.ts`. Greatsword perks affect heavy attacks and finishers;
spear recharge stacks with run blessings. Practice survives death and NG+.

## Five-wave contracts

Find the optional contract board in **Settings → Game modes** or **Chapters**.
Choose any unlocked starting wave, then take one contract:

| Contract | Rules | Set |
| --- | --- | --- |
| Iron Oath | No Balm; +20% enemy HP and damage | Unbroken Vigil |
| Rift Hunt | +20% enemy HP; +25% enemy tempo | Riftstalker |
| War of the Remnant | +60% enemy HP; +20% enemy damage | Remnant Legion |

Five fully cleared consecutive waves award the next deterministic set piece,
silver and covenant fragments directly to the save. The first three victories
guarantee a helm, armor and boots; repeats improve the same items up to +10.
No random drop requirement, duplicate gear, clock or daily gate. Every three
victories raises that contract's enemy tier, capped at eleven (+100% HP and
+50% damage, multiplied with its base rules). Rewards still grant materials
at the gear cap. Forge upgrades are preserved if already higher.

The run continues after completion with contract rules lifted. The clear-wave
blessing card names the saved reward. Leaving or dying before five clears
abandons the attempt, while earned mastery and other normal loot remain.
Contract runs never enter the standard leaderboard, even after completion.
Ordinary Survival, checkpoint starts, milestone weapons, sector changes,
blessings, the Boss Gauntlet and original-form rematches remain available.

## Set powers

| Set | Two equipped pieces | Three equipped pieces |
| --- | --- | --- |
| Unbroken Vigil | +20% parry window; +0.5% safe health regen/sec | Perfect parry restores 5% HP and 8 extra energy, 3s cooldown |
| Riftstalker | +25% ability power; +8% move speed | Mantle throw and blink pursuit recharge 75% faster |
| Remnant Legion | +30% Echo damage; +25% Echo HP | Kills restore 3% maximum HP to living summoned permanent Echoes |

Ownership does not activate a set. Counts use correctly equipped slots; bonuses
end when a piece is removed. Legion never revives downed Echoes or heals temporary
shadows. No new per-frame entity scans, assets, effects pools or dependencies.

## Save compatibility and checks

Optional `SaveData.weaponMastery` and `SaveData.contracts` are normalized on
load. Existing inventory, story and Trial records remain intact. NG+ explicitly
carries both progression maps and the gear. Active contract attempts reset on
reload; permanent claims are saved at wave completion. Leaving the arena clears
the selected contract so later ordinary entries do not inherit its rules.

`scripts/progression.test.mjs` checks bounds, migration, reward rotation and caps.
`scripts/replay-progression.mjs` exercises production desktop/phone builds:
real damage/practice, family perks, set powers, keyboard Balm restrictions,
five real cleared waves, one reward per attempt, repeat upgrades, unranked
records, abandonment, blessings and save reload. CI runs both plus all existing
combat, wave-access, Echo, visual and performance regressions before deployment.
