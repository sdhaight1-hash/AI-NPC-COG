# G4 — Tile-by-tile construction architecture

Status: **G4.1 (blueprint declarations) implemented; G4.2–G4.3 planned**. See [epic #59](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/59), [state milestone #60](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/60), [physical tile jobs #61](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/61), [autonomous housing #62](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/62).

## Current grounded architecture

- `public/frontier.js`: each traversable surface tile is a bounded `(x,y,z)` on a wrapped `80×52` toroidal world. `Frontier.neighbors` and `WorldRuntime.pathfind` define movement. Presently, legacy single-tile shelters do **not** block pathfinding.
- `public/emergence.js`: `AgentWorld.complete` presently converts **four wood + three fiber + 75 simulated minutes** into one complete `shelter` object. `stepNeeds` grants shelter within a four-tile proximity, not physical enclosure. These are legacy behaviors until G4.2; they are **not** a tile-building implementation.
- `public/reservations.js` and `public/receipts.js`: authoritative resource holds and committed effects. `public/activities.js` records timed, interruptible work.
- `public/projects.js`: autonomous agent project prerequisites; construction design can become a graph of independently possible work steps.
- `public/persistence.js`: current v3 save; old saves must continue loading with no forced reset.

## G4.1 declarations (this change)

`public/construction.js` maintains `world.construction = {version:1,nextId,blueprints,tiles}`. A planned blueprint is exactly a declaration, **not** a physical object. It has validated `id`, `kind` (floor/wall/door/roof), coordinates, `actorId`, `plannedAt`, `status:'PLANNED'`. Slots are keyed by `z:x:y:layer`; wall and door conflict in the same barrier layer, but a floor and wall may coexist at the same coordinate. Unsupported terrain, invalid identities, duplicate slots and excessive plan counts are rejected.

An explicitly cancelled plan frees its slot. On restore, only valid, bounded, non-overlapping declarations from a version-1 construction payload are accepted. An old v3 save without construction gets an empty layer. **Saved completed tiles are rejected outright for now**: until G4.2 introduces receipt-backed construction, loading a forged tile would mint a building. No current action or NPC planning function creates blueprints, so this milestone has no visible in-game building effect.

## G4.2 required physical path (pseudocode)

```text
NPC considers room plan
  -> inspect terrain/support and known building method
  -> declare a bounded set of desired tiles (no resource cost yet)
  -> choose one reachable pending tile job
  -> reserve the actual materials and an eligible construction work site
  -> travel to adjacent work cell; begin timed Activities work
  -> while work pending, show progress only (no material/roof benefit)
  -> on readyAt: WorldReceipts.execute(actor, commandId,
          verify reservation + materials + skill/method + support + occupancy;
          consume held material;
          commit exactly one physical tile;
          invalidate navigation if wall/door changed;
          record effects + provenance)
  -> release all holds; update project dependencies
  -> interrupted job resumes only remaining labor with valid materials
```

**Key invariants:** work is never granted by a rendering call, blueprint, model speech or restore input; a wall changes `Frontier.traversable` only after a completed physical receipt; roof support is derived from finished tiles; door passability is explicit. Two builders cannot spend the same wood. A roof's visual cutaway cannot change collision/shelter physics.

## G4.3 NPC-origin housing

Start with a physically compact survivable shelter: a rectangular floor region, perimeter walls, one usable door and supported roof segments. Require actual site choice (terrain slope, reachable water/wood, current threat, social proximity), multiple staged trips, and cooperative labor only by voluntary legal actions. Do not assign housing or social roles magically. An old one-tile shelter remains legacy and does not instantly convert to a furnished tile house.

## Rendering direction

Keep physical simulation independent of the drawing backend. Favor a scalable hybrid: procedural/textured pixel world with larger readable assets, vector/SVG/Canvas primitives for selection outlines and task progress, and deterministic roof cutaway on the selected interior. A vector-only renderer would not itself fix work semantics, construction collision, or AI plans. Prototype 1×/2×/3× map readability and runtime cost before committing to a renderer rewrite.

## Regression gates

- Declaration never grants shelter, stamina recovery, collision, materials or inventory.
- Finished tile only after validated `WorldReceipts` action (G4.2).
- Save/restore of partial plan is canonical, secure and backward compatible.
- Blocking walls alter pathfinding only after completion; door remains traversable.
- A roof can be cut away visually while still being physically present.
- Multiple residents can supply and build without duplicated materials.
- Deterministic multi-seed soak and physical conservation tests remain green.
