# Cross-project architecture transfer audit — source-backed opportunities

**Date:** 2026-11-19. **Status:** Research/design only; no code imported, no assumption that another project is stable or fully implemented.

The GitHub account's repository inventory contains 19 repositories (including AI-NPC-COG). I read the relevant source and design materials in the more promising engines and authoring tools. The strongest lessons concern **generator identity**, **streaming/edit ownership**, **vector-authored assets**, **world epochs**, **private-memory evaluation**, and **conserved water**.

## Direct source inspection and recommended transfers

| User repo / code | What exists in the inspected code | Transfer to AI-NPC-COG | Do not transfer blindly |
| --- | --- | --- | --- |
| [Hexel-survival-game `generated_terrain.rs`](https://github.com/sdhaight1-hash/Hexel-survival-game/blob/main/src/generated_terrain.rs) | Pure absolute-coordinate terrain sampler; generator revision; tests for chunk order, boundary and seed parity | Use the same **absolute world coordinate + seed + pinned generator version** invariant for future 2D tiles | Geometry is axial hexes in Rust, not toroidal square tiles; final seamless torus explicitly unresolved |
| [Hexel-survival-game streamed-world design](https://github.com/sdhaight1-hash/Hexel-survival-game/blob/main/docs/p3-2-streamed-world.md) | Opt-in moving 95-section residency, nearest-first generation, one-section-per-update work budget, incremental GPU meshes; missing-neighbor terrain falls back to source | Distinguish base world query from render cache, avoid loading-order effects; bound generation budget | No persistent edits, final torus topology, full environmental simulation or asynchronous workers in that prototype |
| [Hexel-Game-Engine `planetary_world.rs`](https://github.com/sdhaight1-hash/Hexel-Game-Engine/blob/main/src/planetary_world.rs) | Save schema / generator version, canonical surface cell identities, sparse edited cells, reject incompatible saves | World descriptor and edit-overlay design; separate immutable generation from mutable effects | Planet is cube-sphere topology and a different game problem |
| [Hexel-Game-Engine `planetary_chunks.rs`](https://github.com/sdhaight1-hash/Hexel-Game-Engine/blob/main/src/planetary_chunks.rs) | Face+patch integer address, independent mesh generation, f64 positions before camera-relative conversion | Rebase visual coordinates if the world becomes genuinely large; spatial identities must be integer | No reason to port 3D mesh/cube-face logic into today's 80×52 Canvas |
| [Hexel-Game-Engine field-based hydrology design](https://github.com/sdhaight1-hash/Hexel-Game-Engine/blob/main/Design%20ideas/Field-Based%20World%20Simulation%20and%20Finite%20Hydrology.md) | Well-scoped proposal for terrain/geology/weather/soil/hydrology/ecology fields and finite water | Use **fields as explanatory constraints**, stores/entities as actual objects, and independent update rates | This reference is marked exploratory, **not a completed ecosystem implementation** |
| [Voxel-Survival `hydrology.rs`](https://github.com/sdhaight1-hash/Voxel-Survival/blob/main/src/hydrology.rs) | Finite per-cell liter amounts, active/dirty sets, local transfer and an explicitly finite atmosphere; tests of conservation, displacement and torus wrap | Build finite water budgets and region dirty tracking; do not grant an infinite container refill | 3D voxel capacities and ocean volume are not appropriate for exact 2D surface water without redefining units |
| [World-building-Project `terrain_generation.rs`](https://github.com/sdhaight1-hash/World-building-Project/blob/main/studio/src/terrain_generation.rs) | Geological province/craton/crust forcing, seeded multiscale terrain hypotheses, export and tests for independence from legacy heightfield | Establish precedence of macro geography, terrain material, slope and rainfall before decorating sprites | Scientific/provenance caveats: geology categories are synthetic; planet sphere unlike our torus |
| [Voxel-Game-Engine `leaf_vector.rs`](https://github.com/sdhaight1-hash/Voxel-Game-Engine/blob/main/src/leaf_vector.rs) | Implemented, tested vector-like species-specific oak/willow/cottonwood silhouettes with subpixel coverage baker | Vector-authored foliage and retained species identity; deterministic alpha/baked sprite at 1x/2x/3x | Leaf cards from voxel renderer aren't ready-made overhead tree crowns or a 2D engine |
| [AI-RP-Program `world/epoch.mjs`](https://github.com/sdhaight1-hash/AI-RP-Program/blob/main/world/epoch.mjs), [reply commit design](https://github.com/sdhaight1-hash/AI-RP-Program/blob/main/docs/npc-reply-epoch-and-commit.md) | Durable SQL mutation epoch and one-use response ticket; checks whether world changed during model inference | Apply **state-revision validity** to asynchronous NPC goal/intention proposals; reject obsolete model decisions before changing goals | Not a drop-in protocol; AI-NPC-COG is currently browser-v3, not SQLite server-owned |
| [AI-RP-Program memory evaluation](https://github.com/sdhaight1-hash/AI-RP-Program/blob/main/docs/actor-memory-evaluation.md), [candidate selection](https://github.com/sdhaight1-hash/AI-RP-Program/blob/main/memory/candidates.mjs) | Provenance-based tests for stored->retrieved->prompt-packed evidence, private/fork negative cases; explicit discovered failure of implicit retrieval | Build **causal memory intervention** tests and bounded actor-scoped evidence packing. Semantic/vector memory may be a later option, not a default | Roleplay memory quality metrics and synthetic numbers are not actual survival NPC goal achievement; avoid sharing actor memories by accident |
| [Gaia](https://github.com/sdhaight1-hash/Gaia), [World-building-Project](https://github.com/sdhaight1-hash/World-building-Project) | Separate terrain authoring/hydrology/graph tools; source and docs inspected for relevance | Prefer exporting **versioned authored macro fields** as optional worldgen inputs, not running an editor at game tick time | Editor architecture and asset graphs are not the production game runtime |
| [AI-RP-Program](https://github.com/sdhaight1-hash/AI-RP-Program), [Solo-RP-Engine](https://github.com/sdhaight1-hash/Solo-RP-Engine) | Stronger narrative/persistent character simulation direction vs physical survival focus | Consider player-facing character inspection, belief and intention histories, not their whole RP engine | Different world authority: conversation narration vs physically committed actions |

### Other repositories considered

`World-building`, `Santa-Aurelia-Vally`, `American-Frontair-`, and `The-New-World` are principally world/culture/story content in this audit. `Webgl-The-Broken-Empires`, `Broken-empires-SRD`, and `Casual-Thread-Solo-RPG-Engine` are stronger references for game rules/interface than procedural geology. `Reverse-Engineer-HavenCraft` and `The-Observatory-` were not identified as necessary dependencies for the core physical simulation. `Lola` and `Hexel-Game-Engine` may be useful for asset workflows but 3D content cannot be ported as a 2D procedural runtime. This is a **relevance triage**, not a line-by-line audit of all 19 repositories.

## Unexpected conceptual overlap: world epochs and asynchronous NPC cognition

AI-NPC-COG already discards an asynchronous Rein action when the NPC moved or became invalid during inference (`public/app.js:deliberate`); it checks action membership, location, pause, survival. But a character can remain at the same position while **resources, reservations, known facts, urgent needs, promises or available actions change**. A location-only stale response gate is not enough for durable higher-order goals.

Instead of importing AI-RP-Program's SQL implementation, first record a minimal actor-private decision basis:

```ts
DecisionBasis {
  actorId, actorRevision, observedEvidenceIds[],
  activeGoalRevision, relevantActionSetFingerprint,
  worldEffectRevision, issuedAt, cueIds[]
}
```

When the model responds, revalidate its **current legal prerequisites** and the specific belief/goal conflict that triggered it. Do not require every unrelated world mutation to invalidate every NPC decision; use relevance-checked revisions to avoid starving the shared model lane. Model speech remains speculative until an actual exchange and verified receipt.

**Tests:** source depleted during model call; new critical thirst during model call; original choice still legal but no longer strategically relevant; actor dies; target disappears; another actor reserves the same stack. Reject stale intent without dropping body safety or authoritatively injecting text.

## Another overlap: procedural art and environmental simulation

The vector-leaf generator in Voxel-Game-Engine demonstrates an effective **data->deterministic authoring bake->lightweight runtime image** contract. The hydrology fields in Hexel and terrain generators in World-building-Project demonstrate a separate **world-model->field->render projection** contract. These are complementary. Build a tiny, versioned `renderAsset(species, age, season, style, seed)` recipe before choosing Pixi/WebGL; cache raster or GPU sprite variants and maintain physical object identities outside the art system.

## Additional questions generated by cross-repo review

1. Is a server-owned SQLite world journal justified **before** growing beyond browser v3 localStorage? What replay/import safety would it require?
2. Could an export format for worldgen *macro* fields be shared by a standalone Rust authoring tool and the JS game with checksum/revision parity tests?
3. Should gameplay time use multiple update cadences (NPC minute, ecology hour/day, long-term culture month) with deterministic event queues rather than processing every subsystem every rendered frame?
4. Can active/dirty spatial field updates from Voxel-Survival support a bounded 2D finite-water ecology without simulating each liter every minute?
5. How do we preserve observer-relevant NPC lives in offscreen regions even if rendering becomes chunked?
6. Would the simplest meaningful near-term art improvement be a cached vector-authored species atlas rather than any new engine dependency?

## Transfer priorities

**Immediately valuable:** memory evaluation/provenance approach, stale-decision basis, versioned generator and edit-layer contracts, conceptual vector-bake pipeline.

**Dependent on growth:** chunk residency and world-field authored inputs; incremental renderer cache and spatial LOD.

**Research only:** full planetary engine, GPU hydrology solver, migration to Rust/wgpu, biological long-form generative model, general-purpose civilization director.

These conclusions do **not** establish code portability or runtime speedups. The next validation step is tiny reference implementations in isolated PRs **only after a measured baseline**.
