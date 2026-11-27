# Remnant's physics core (WebAssembly)

`remnant_phys.c` is the game's own physics library: tile-grid collision for every body in the journey (Chapters, the
Trial, Extreme, the Gauntlet, the Rush, the Daily Challenge, Remnant's Rest), compiled to a 4 KB WebAssembly module with
no libc and no allocator.

## What it does

- **Two grids in its own memory.** Grid 0 is the classic world's (`Grid.t` of `remnant/src/game/world.ts`), grid 1 the
  Phaser World's (`World.grid`). The game's arrays become views into the module's memory (`phys.bindHero`, and the
  classic grid bound on first use), so a broken wall or a closed gate is seen at once, with nothing copied each frame.
  The memory is fixed (2 × 256 K cells) and never grows, so the views stay valid.
- **The shared rules, exactly.** `move_body`, `body_fits` and `los` reproduce `moveBody`, `bodyFits` and `los` from
  `remnant/src/game/physics.ts` operation for operation in doubles: a body crosses every tile on its path (no
  tunnelling), across and then up or down, one-way platforms hold only what falls onto them from above unless it is
  dropping, and a body within a hair of a floor stands on it. The Phaser build installs the module as that file's
  backend (`setPhysicsBackend`), so every shared foe, Echo, prop and classic boss moves through it. The original
  edition installs none and runs the JS.
- **Arcade bodies.** `step_body` takes the hero's and the Arcade-bodied bosses' steps after Arcade has integrated
  them (World's `WORLD_STEP`): from `prev` by the displacement, through grid 1, with the map's edges open (the world's
  own bounds take over there). This replaces Arcade's tilemap collider. A body found inside a wall is first eased out
  to the nearest free place within a tile, as Arcade's separation did.

Tile solidity is passed as a bitmask over the tile kinds, worked out from the caller's predicate on each call, since
the classic world's `solid` follows the arena gate.

## Building

```sh
node scripts/build-phys.mjs
```

It needs clang with the wasm32 target and wasm-ld (LLVM 15 or later), and writes `remnant_phys.wasm` and
`src/game/physWasm.ts` (the module as base64, so the game carries it with no fetch, offline too). Both are committed,
so `npm run build` does not need clang. Rebuild and commit both whenever the C changes.

## Checking

`scripts/phys.mjs` (in `ci-tests.txt`):
- **Parity.** 60 000 random moves, fits and sightlines on random rooms through both the WebAssembly and the JS
  (`phys.parity`, which any debug page can call); they must agree exactly.
- **The hero:**
  - a wall stops him flush;
  - a body at 6000 px/s stops at a one-tile wall;
  - a one-way ledge lets him up through, holds him, and lets him drop with Down + Jump;
  - a body set inside stone is eased out.
- **A Trial round.** The shared foes move through the core.

## Speed

Measured in V8 (node, 64 bodies a frame on a 120 × 40 room), the JIT runs the small JS `moveBody` faster than the
module: about 2 µs a frame for the JS and 3 to 5 µs for the WebAssembly, whose call and copying in and out cost more
than the loop saves. Either is a tiny share of a 120 Hz frame (8333 µs). The gains are elsewhere:
- **One set of rules.** The hero, the native bosses and every shared foe step by the same code.
- **No tunnelling.** The hero's sweep cannot pass through a wall however fast he moves; Arcade's overlap test could.
