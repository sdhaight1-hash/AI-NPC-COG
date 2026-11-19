# Top-down 2D graphics, chunk streaming, and procedural generation — research and proposed architecture

**Date:** 2026-11-19. **Status:** Research-backed proposal, **not implemented**.  
**Code baseline:** [Frontier](../public/frontier.js), [VillageArt](../public/pixel-art.js), [browser camera](../public/app.js), [simulation](../public/simulation.js), [construction](../public/construction.js).  
**Related issue:** [#64 art direction](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/64), [#59 real tile buildings](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/59).  
**Research discipline:** Treat external library documentation as evidence of capability, not benchmark results on the user's graphics hardware.

## 1. Current world and implications

The current map is **80×52**, finite and toroidal; vertical z is [-4,3]. Biomes and world nodes are sampled at generation by `Frontier.generate`. The engine has no 2D chunks, no per-tile elevation/drainage network, no dynamic forest population, and no physical floor/wall/roof completion. The surface `staticCanvas` is pre-drawn for all 4,160 cells; `app.js:drawWorld` repeats that image at torus offsets and redraws dynamic world nodes, NPCs and ambient effects. This is small enough for current Canvas2D; **chunking now is not inherently a performance improvement**.

There is an existing physical simulation: every NPC advances regardless of camera visibility via `Simulation.advance`. Rendering upgrades must not own biology, planning, hydration, inventories, resource availability, or passage of time.

## 2. Distinguish five independent questions

1. **World truth:** What actually exists at each tile (terrain material/elevation, water/soil, resources, actors, physical construction)?
2. **Generation:** Which deterministic fields and features establish the initial world, with what revisions and constraints?
3. **Persistence:** Which changes must survive unload and save (harvests, structures, stores, injuries, depleted water, fire, ecology)?
4. **Residency:** Which cached spatial regions need to be in memory/on GPU/in the active simulation?
5. **Artwork:** How are physical facts transformed into pretty, legible shapes, sprites, lighting and animation?

Do not make a WFC output, SVG image, GPU atlas, or chunk mesh authoritative gameplay state. A forest can look dense because of canopy overlap but only its simulated tree objects/resources can be harvested.

## 3. Research: which algorithm belongs at which scale?

| Algorithm or family | Verified reference | Strong use | Wrong use / unresolved |
| --- | --- | --- | --- |
| Periodic, domain-warped/fractal noise | [NVIDIA GPU Gems terrain noise](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu); existing `Frontier.noise` | Large-scale visual variation, elevation and ecological suitability | Fractal noise alone does not create connected drainage or a historical landscape |
| Drainage graphs, depression filling, flow accumulation | [Barnes et al., Priority-Flood](https://arxiv.org/abs/1511.04463); [Génevaux et al. river networks](https://perso.liris.cnrs.fr/apeytavi/website/publication/hal-01339224/) | Hydrologically connected rivers, watersheds, lakes, wetland sites and plausible freshwater | A periodic torus has **no exterior raster edge**; must explicitly designate an ocean mask or basin outlets for priority flood. Do not fill intended lakes away |
| Tiled/overlapping **Wave Function Collapse** (WFC) | [Maxim Gumin's implementation](https://github.com/mxgmn/WaveFunctionCollapse); [constraint-solver analysis](https://adamsmith.as/papers/wfc_is_constraint_solving_in_the_wild.pdf) | Small local ground motifs, flooring, ruin interiors, village architectural decoration, transition tiles with known adjacency constraints | WFC does **not** automatically enforce global trail connectivity, river drainage, causal history, support physics, or cross-chunk consistency. Solver failure needs bounded retry/fallback |
| **Space colonization** (likely intended by 'rspace colonization') | [Runions et al. 2007](https://diglib.eg.org/items/b5d756ee-0ab3-436e-a5cb-617d50df78fb); [working raylib C implementation](https://github.com/jakobrichert/space-colonization) | Tree crowns, branch forms, roots, organic tendrils and potentially constrained trail/network ideation | It grows structures toward attraction samples; it is **not** a complete climate, terrain, river, forest or social settlement simulator |
| Variable-radius blue-noise / Poisson disk | [Bridson blue-noise placement, as discussed in PCG implementations](https://www.construct.net/en/game-assets/game-templates/forest-generator-923) | Object placements such as forest clumps with spacing/canopy clearance | Must be seeded by **absolute world coordinates/region ownership**, not a fresh local RNG per chunk; cannot decide ecology by itself |
| Graph/path generation | [Hydrology-first terrain generation](https://doi.org/10.1145/2461912.2461996) | Roads/trails connecting *existing* settlements, river crossings and human-built infrastructure after actual world state exists | Do not spawn an imposed town/network at founding; genuine NPC infrastructure comes from physical work records |
| Tilemap chunk records | [Tiled JSON infinite-map chunk specification](https://docs.mapeditor.org/en/latest/reference/json-map-format/) | Lightweight asset interchange; coordinates, width/height and tile data per spatial region | Tiled file chunks are not a simulation scheduler or substitute for persistent mutable world objects |
| Dirty tile layer updates | [Godot TileMapLayer](https://docs.godotengine.org/en/4.6/classes/class_tilemaplayer.html) | Example of batching tile updates instead of rebuilding everything each frame | Godot docs note expensive runtime tile updates; importing an engine isn't justified by the current 4,160-cell demo |

### Recommended generation pipeline (world initialization, not every frame)

```pseudo
descriptor = (seed, worldgenRevision, topology, width, height, zBounds)
macro = periodicElevationClimateSoil(descriptor)
oceanOutlets = chooseSealedOrOpenBasins(macro)
hydrology = drainageFlowAndPersistentLakes(macro, oceanOutlets)
biomes = classifyBy(temperature, rainfall, elevation, soil, hydrology)
staticFeatures = placeNaturalObjectsByAbsoluteWorldHash(biomes, hydrology, ecology)
validateWorld(seed, riversContinuous, founderAccessibleFoodWaterWood, traversable)
persist worldDescriptor + immutable macro boundary contract + initial resource stores
render = decorate(authoritativeBiomeObjects, visualSeed)
```

**If staying small:** begin by adding a field/feature contract, no expensive erosion or tectonics. For larger worlds, generate low-frequency macro fields across the *whole periodic world* once, then refine local details on demand. A generator revision, seed and macro checksum must be saved before edits are allowed.

### Toroidal caveat

Most published hydrology techniques assume an outlet at the edge of a raster; AI-NPC-COG has no edge. Ocean mask cells can serve as explicit drains, but an entirely land-covered torus needs chosen lake basins/spillways or a deliberate closed-basin policy. A drainage pass must avoid directional bias at x=0/y=0. All gradients, neighbor tests, distant feature intersections and WFC boundary ports should be tested across both periodic seams.

## 4. Chunk architecture for a future *larger* world

### What we can borrow from the user's other repositories

[Hexel-survival-game P3 streamer](https://github.com/sdhaight1-hash/Hexel-survival-game/blob/main/docs/p3-2-streamed-world.md) already demonstrates deterministic generation from **absolute world cells**, stable nearest-first section residency, bounded generation budget, independent buffer upload/eviction, and the critical rule **unloaded ≠ empty**. It explicitly lacks persistent edits and the final torus mapping, so it is an *algorithmic reference*, not a finished plugin for this JavaScript square-tile world.

[Hexel-Game-Engine planetary_world.rs](https://github.com/sdhaight1-hash/Hexel-Game-Engine/blob/main/src/planetary_world.rs) shows explicit generator and save schema revisions plus sparse override records; [planetary_chunks.rs](https://github.com/sdhaight1-hash/Hexel-Game-Engine/blob/main/src/planetary_chunks.rs) uses integer patch identities and camera-relative rendering. Topology there is cube sphere, **not this toroidal square grid**.

### Proposed minimum data contract (not a fixed chunk-size mandate)

```ts
WorldDescriptor {
  seed, worldgenVersion, savedWorldVersion,
  topology: 'finite-2d-torus', widthTiles, heightTiles,
  zMin, zMax, macroFieldFingerprint
}
ChunkKey { cx, cy, z }                    // canonical torus wrapping
BaseChunk { key, terrainIds, staticFeatureIds } // deterministic, regenerable
ChunkDelta { key, revisions, editedCells, resourceStocks, builtTiles, placedObjects }
ChunkCache { base, presentation, lastUsed, dirty } // disposable
```

Identity and physics live in **absolute canonical world tile coordinates**, not sprite/pixel positions. Query order:

```pseudo
canonical = wrapCoordinate(tile, descriptor)
key, local = worldToChunk(canonical)                 // floor-div, non-negative modulo
base = generateOrSampleCanonicalBase(descriptor, key, macro)
delta = persistedEditsFor(key)
return authoritativeOverlay(base[local], delta[local]) // even if no texture loaded
```

Evaluate 16×16 and 32×32 as experiments, not predetermined engine constants. The current 80×52 torus contains a **partial final row of chunks** at a 16×16 tile size: last row has four tiles. Any chunk-space implementation must handle dimensions not divisible by chunk size, and a periodic seam crossing must not mint duplicate owner cells.

**Immutable base:** generator version + seed + macro data determines unedited terrain exactly.  
**Mutable overlay:** every harvested/depleted stock, constructed wall, stored item, tree death, soil modification and placed object persists as an authoritative delta; no renderer eviction may erase it.  
**Actors:** identity, biology, memory and actions live at world scope, not inside cache eviction. An off-screen NPC continues to act.  
**Residency:** render chunks may evict freely. Exact physical queries must remain possible for nonresident positions (sampler+delta), or the simulation explicitly materializes a physical region independent of camera.  
**Movement:** navigation cannot treat unresident cells as impassable or empty by default; global/coarse path planning uses the same authoritative topology.  
**Time:** offscreen environmental aggregates may use coarser simulation only if reconciled deterministically with conserved stores, witnessed events and return-to-view transitions.

### Chunk boundary validation

- Generate N distinct chunks forward/reverse/random order; hashes and shared borders identical.
- Render and traverse x=width-1 -> 0, y=height-1 -> 0 at every supported zoom and all z-levels.
- Cross boundary while extracting terrain, moving an actor, hauling goods, casting vision, transferring water, and completing a roof tile.
- Save partial woodpile/depleted spring near seam; unload/reload and restart without resetting stock or double-spending.
- Test negative temporary view coordinates, non-divisible dimensions, and concurrent requests for identical chunk key.
- Measure generation time, resident bytes, eviction time, dirty redraws, CPU/GPU upload, frame variance and physics-step variance independently.

No new chunk system should be written until the test harness can demonstrate need or until world-size growth has a concrete specification.

## 5. Vector top-down graphics: research and decision

The desired art direction can be created **from vector sources without requiring a vector-only runtime**. Our present `VillageArt` makes 16px colored rectangles/atlas tiles. The difference between **authoring** and **displaying** is key.

| Rendering alternative | Strength | Risks | Recommendation |
| --- | --- | --- | --- |
| Existing Canvas2D static raster + dynamic paths | Already integrated, deterministic, no dependency; supports curves, gradients, compositing | Whole-map canvas no longer viable at extremely large size; objects redrawn; limited batching | **Baseline**, improve art using vector-authored assets and small cached subregions |
| SVG DOM for all terrain/entities | Crisp editable geometry, scalable, helpful for editor overlays | Potentially huge DOM nodes, updates/layout and expensive rendering of many animated entities | **Do not** make entire animated world thousands of SVG nodes |
| Pre-rendered SVG/path/SDF artwork to layered atlas | Vector-defined proportions/biomes/tree crowns with low runtime CPU | Needs stable style tokens, atlas/mipmap and resolution/zoom cache policy | **Preferred initial art workflow** |
| PixiJS v8 Graphics + sprite batching | GPU-friendly scene graph; retained GraphicsContext and cacheAsTexture with textures for static shapes ([official docs](https://pixijs.com/8.x/guides/components/scene-objects/graphics)) | Framework migration, geometry tessellation, layering, texture/culling discipline; path holes not always accurately triangulated | A/B prototype only after baseline measured; avoid switching for aesthetics alone |
| Custom WebGL/WebGPU vector paths | Fine-grained GPU control, high-quality curves and large sprite sets | Shader/material pipelines and GPU memory/testing complexity, high maintenance | Defer until profiler proves need |
| Native Rust + wgpu renderer | Proven concepts in user's other projects; control and authoring systems | Full game-port is massive and risks losing browser/local-model workflow | Reference concepts only, not approved rewrite |

[PixiJS docs](https://pixijs.com/8.x/guides/components/scene-objects/graphics) explicitly note that shape geometry is built and reused, and suggest caching complex static shapes as textures. [Godot TileMapLayer](https://docs.godotengine.org/en/4.6/classes/class_tilemaplayer.html) likewise batches changes; these are principles rather than benchmarks for our code.

### Proposed hybrid illustration layers

```text
z-specific authoritative ground materials
  -> cached terrain color/texture and coastline/river curves
  -> ground decals, paths, leaves and water details
  -> durable underlays: floors, rubble, footprints
  -> physical structures: walls, stairs, doors, furniture, production stations
  -> actors/animals/items, stable depth sorting and y-foot anchors
  -> tree trunk/canopy overlap, occlusion and roof cutaway (view-only)
  -> local light/weather/ambient overlay
  -> observer gizmos: selection, active jobs, goals, stock/knowledge inspection
```

Do not draw a roof solely because a blueprint exists. Do not let roof cutaway affect whether a room protects from rain. Optional artwork variants should be cosmetics determined by source item/species/age and stable visual seed.

### Species-aware procedural vector plants

The user's [Voxel-Game-Engine `leaf_vector.rs`](https://github.com/sdhaight1-hash/Voxel-Game-Engine/blob/main/src/leaf_vector.rs) includes actual implemented species-specific oak/willow/cottonwood silhouettes built from distance functions, Bézier curves and deterministic subpixel raster coverage. This is unusually reusable *in concept*. For 2D overhead, author independent **tree crown silhouettes** and trunks with species, maturity, season, wind and damage parameters. Space-colonization branch skeletons can control crown shape. The physical object remains a sparse entity, with growth/harvest persisted, and the vector asset cache produces sprites or textures at zoom/detail tiers.

Do not copy the Rust files verbatim into the browser or import the entire foliage engine. Define a small vector-asset schema and implement a renderer-specific baker.

### Minimum meaningful A/B prototype

On a **fixed, immutable** seeded world snapshot, render the exact same scene in three modes: (A) current 16px art, (B) vector-authored high-resolution raster art in current Canvas2D, (C) limited PixiJS scene equivalent. Evaluate separately at 1×/2×/3× zoom, normal and high-DPI device pixel ratio, daylight/night, dense forest, shoreline, three unfinished buildings, multiple NPCs and visible work actions.

Log FPS/p50/p95 frame time, Canvas2D draw calls or driver draw calls where available, cache misses, CPU memory, GPU texture bytes and redraw dirtiness. Check topdown silhouettes, collision legibility, roof cutaway, text readability, event visualization and color-vision contrast. Do not choose a graphics API solely by one attractive screenshot.

## 6. New design questions surfaced

- How will seasonal/regenerating vegetation be represented without re-running worldgen or destroying tree identity?
- At what zoom/size are tree branches and leaves actually identifiable? Might small zoom show whole-canopy sprite while near zoom resolves procedural branches?
- Can rivers be drawn with smooth vector banks but evaluated physically on a discrete hydrology/terrain layer?
- How do roads and paths **emerge from NPC footfall, labor and deliberate construction** without hard-coded villages?
- Is a global world generator even necessary now, or should we first improve one compelling local ecology/hydrology island fixture to test cognition?
- What is the desired camera resolution and target tile density? A change from current 16px source artwork is not equivalent to changing physical grid metres or NPC time cost.

## 7. Research-linked implementation gate proposals

**V0 — rendering-neutral world snapshot & art benchmark**: no physics changes; capture stable scene and A/B comparisons; no generated tile grants collision.  
**W0 — worldgen identity and geometry contract**: explicit seed+version+torus+z semantics, whole-world base reproducibility; no chunk streaming.  
**W1 — elevation/hydrology/soil feasibility**: seeded coherent drainage on 80×52 first; demonstrate valid water budgets and founder access; inspect closed-basin and seam behavior.  
**W2 — optional deterministic chunk sampler+delta**: only after larger map need; split exact world truth from cache; save and streaming tests first.  
**V1 — vector-authored tree/terrain/structure atlas**: multi-zoom clarity at tolerable CPU/GPU budget, no gameplay changes.  
**W3 — WFC/space-colonization local visuals**: deterministic, bounded, decor-only; compare against cheaper procedural placement and tree formulas before adopting.

These gates do not authorize rewriting the renderer or adopting a new graphics engine.
