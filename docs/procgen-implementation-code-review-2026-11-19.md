# Algorithm implementation review — WFC, space colonization, procedural paths

**Date:** 2026-11-19. **Status:** inspected public source implementations; no source copied or local benchmark run.  
**Related overall design:** [Top-down vector/chunk/worldgen study](topdown-vector-chunk-worldgen-research-2026-11-19.md).

## 1. Wave Function Collapse: what code actually does

- [Maxim Gumin original `Model.cs`](https://github.com/mxgmn/WaveFunctionCollapse/blob/master/Model.cs) has a `periodic` flag in its tile compatibility propagation and entropy/observation logic. This is a **solver-global torus rule**, not automatically a generator for *independent streaming chunks*. For streamed chunks you must preagree boundary states, solve with halo/port constraints, or generate one deterministic coarser macro layout whose chunk interiors follow it.
- [Original `SimpleTiledModel.cs`](https://github.com/mxgmn/WaveFunctionCollapse/blob/master/SimpleTiledModel.cs) builds adjacency propagators from declared tile-neighbor rules. It is excellent for correct wall/corner/transitional variants, but local adjacency alone cannot prove door access, coherent rivers or room occupancy.
- [tinywfc `include/tinywfc/tinywfc.h`](https://github.com/varnholt/tinywfc/blob/main/include/tinywfc/tinywfc.h) and [README](https://github.com/varnholt/tinywfc/blob/main/README.md) support AC-4-style constraint propagation, bounded backtracking/restarts, explicit settings for periodicity/seed, and contradiction handling. Good reference for bounded failure but C++23, not a drop-in JS dependency. Its benchmarks are on different hardware and tile sets and cannot establish our own performance.
- [Unity2D WFC streamer](https://github.com/dfaruqi/WaveFunctionCollapse) is another actively updated implementation with editor-side tile modules, but adopting its Unity runtime is unnecessary.

**Decision:** use WFC for **visual variants and modular interiors after spatial topology is authoritative**. E.g., physical G4 built a support-valid roof and door; artwork WFC chooses coherent shingle, plaster, floor seam or ruins decorations, subject to the actual geometry. A model failure falls back to a simpler deterministic tile rule and logs a bounded diagnostic; it does not make an area impossible to traverse.

```pseudo
authoritative = getPhysicalRoomAndGroundRegion(region)
boundaryPorts = deriveImmutableNeighborVisualEdges(authoritative)
seed = hash(globalWorldSeed, visualGeneratorVersion, regionOwnerKey)
result = solveDecorationsWithBoundedBacktracking(authoritative, boundaryPorts, seed)
if result.failed: result = simpleDeterministicAutotile(authoritative)
assert physicalWorldHashUnchanged()
```

For a toroidal 80×52 world, a whole-map decoration solver may be simpler than per-chunk streaming. For a big world, solve per canonical region with signed border ports and explicit halos; compare generation-order permutations, seam tile adjacency and fallback frequency on many seeds before release.

## 2. Space colonization: the right use is plant branch geometry

- [Runions, Lane & Prusinkiewicz (2007)](https://doi.org/10.2312/NPH/NPH07/063-070) introduced growing branches toward attraction points, consuming nearby points and producing naturalistic trees.
- [jakobrichert `src/tree.c`](https://github.com/jakobrichert/space-colonization/blob/main/src/tree.c) shows an implementation with sampled crown attraction points, trunk nodes, influence radius and kill distance, dynamic node growth and spatial grid acceleration. It is a 3D raylib C prototype, not topdown gameplay logic.
- [Voxel-Game-Engine `src/leaf_vector.rs`](https://github.com/sdhaight1-hash/Voxel-Game-Engine/blob/main/src/leaf_vector.rs) already renders/test-bakes species silhouettes. A topdown 2D authoring pipeline can combine small tree-specific 2D branch skeletons and silhouette falloff, bake atlases, and keep trunk/biomass identities as physical entities.

**Decision:** do not generate the forest or the entire ecology with space colonization. Use it offline/at authoring time for distinct crowns/roots and *maybe* natural stream or fungal-vein ornament. Drive species and presence from actual biome/light/moisture and stable tree ages, not the renderer's attraction points.

**Potential expensive trap:** 50-500 attraction points per branch skeleton, updated for hundreds of trees every frame, is needless. Bake a small number of parameterized geometry variants per species/season/maturity, cache by `(spec, version, assetSeed)`, and adapt visual swaying/aging cheaply in runtime. Measure performance before generating thousands of variants.

## 3. Footfall paths: empirical and simple implementation references

- [Simple agents – complex emergent path systems (2023)](https://journals.sagepub.com/doi/full/10.1177/23998083231184884) models accumulated pedestrian choices and observed desire paths.
- [Predicting Desire Paths (2025)](https://www.sciencedirect.com/science/article/pii/S0198971525000043) studies route optimisation, spatial perception and collective behaviour in informal routes.
- [JakeWitter `paths/pathfinder_astar.py`](https://github.com/JakeWitter/desire-paths/blob/main/paths/pathfinder_astar.py) provides a concrete A* cache and updated grid path calculations. [Repository](https://github.com/JakeWitter/desire-paths) describes trampling/wear as route costs. This is an illustrative simulation, not an established high-performance wilderness engine.

**Decision:** ensure every path in AI-NPC-COG originates from actual traversed movement receipts. Store low-resolution traffic pressure, soil compaction/ground cover and path material. Do not seed roads or houses and then call them emergent, and do not apply every footstep as a slow global world replay. This can later become input to NPC goal preferences and settlement formation.

## 4. Three algorithm competition experiments

**WFC vs autotile:** same authoritative G4 tile skeleton and dense tile seams, 1/2/3x zoom, compare visual coherence, failures/retries, stable hashes, CPU cost, and whether any geometry is falsely represented.

**Tree authoring:** seeded oak, willow and cottonwood instances; compare pure silhouette template, signed distance vector bake, and small space-colonization skeleton+bake on distinct shapes, leaf readability at typical zoom, caching cost, variants per MB and CPU bake ms. Never let attractiveness change tree biomass or collision.

**Emergent routes:** five agents same world with/without footfall/vegetation effects, no direct road material generation, compare actually traversed tiles, bottlenecks, movement costs, safe water access, and repeated-work efficiency. Only adopt a route-feedback mechanic if it changes useful physically grounded behavior without locking NPCs into loops.

## 5. General graphics principles

Vector source paths, polygons, Bézier outlines and signed distances can be stored at authoring resolution; runtime display as raster atlases or PixiJS textures. PixiJS itself [recommends caching costly graphics shapes as textures](https://pixijs.com/8.x/guides/components/scene-objects/graphics), and [performance guidance](https://pixijs.com/8.x/guides/concepts/performance-tips) warns that many complex graphics shapes and repeated cache updates may be slow. At 4,160 cells Canvas2D remains the baseline; GPU is an **experiment**, not an automatic improvement.
