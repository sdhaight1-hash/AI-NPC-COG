# Architecture decisions, development order and test gates — full-repository audit synthesis

**Date:** 2026-11-19. **Status:** Proposed design decisions; no game code modified.  
**Baseline:** `main` at `2ca26b1fefb2aebbeeb1270fbb096e5699c9d992`. Subsequent feature branches may change facts; re-audit before implementation.

**Read first:** [Full audit ledger](full-repository-audit-ledger-2026-11-19.md); [worldgen/vector/chunks study](topdown-vector-chunk-worldgen-research-2026-11-19.md); [cross-repo transfer](cross-repository-architecture-transfer-2026-11-19.md); [ecology/time research](ecology-time-and-emergent-paths-research-2026-11-19.md); [WFC/space-colonization code review](procgen-implementation-code-review-2026-11-19.md); [prior cognition designs](agent-autonomy-deep-investigation-2026-11-19.md).

**Finalized research contracts (2026-11-19):** [time/causality](final-research-time-causality-contract-2026-11-19.md), [item ownership](final-research-physical-ownership-contract-2026-11-19.md), [LLM cognitive executive](final-research-cognitive-executive-contract-2026-11-19.md), and [sequenced implementation handoff](final-research-implementation-handoff-2026-11-19.md). These refine rather than replace this audit's historical evidence and are research-only.

## 1. Architectural North Star

**Persistent world truth is separate from AI knowledge, procedure, visual projection and caching.**

```text
World descriptor (seed, revision, toroidal coordinates, environmental macro fields)
      + immutable deterministic base terrain
      + durable edits and finite resource/entity stores
      |                                  |
      v                                  v
Physics, biology, ecology, inventory     Actor-private observations and memory
and verified action receipts             -> stable traits + needs + commitments
      ^                                  -> cue priority and model budget
      |                                  -> validated plans and intentions
      +----- existing activity + reservation + world execution ------+
      |
      v
Presentation: chunk/view cached terrain, vector-authored sprites, WFC decoration,
dynamic actors, visibility/roof cutaways and observer UI
```

World facts cannot be granted by prompts, authored visual features, render cache or chunk generation order; speech alone cannot grant social commitments; save/restore must preserve physical and epistemic states without minting.

## 2. Actual implementation versus desired system

| Domain | Today | Desired next truthful milestone |
| --- | --- | --- |
| Core sim | Deterministic headless 80×52, bounded z, interval updates | Time partition test, event ordering and no missing elapsed metabolism |
| Survival | Real eating/drinking/death; founders seeded food/water | Zero possessions, accessible source drinking, conserved carrying/containers, multi-seed viability |
| Logistics | Finite counts and reservations, crates | Mass, volume, hands, vessels, item/lot identity and conserved death/haul outcomes |
| Character | Utility drives, adjective tags, bounded Rein menu | Seeded persisted traits, individualized social drives, goals vs intentions, private cues, stale model response rejection |
| Memory | Separate legacy episodes, evidence memory and agency beliefs | Actor-owned read projection, provenance-retrieval-to-decision effect test, toroidal locality |
| Society | Real speech receipt, hearsay, mutual companionship | Independent invitations/consent, bounded promises, physical cooperation, conflict and explicit source belief |
| Construction | Inert physical tile blueprints, legacy single shelter | G4.2 validated material delivery and per-tile completion, supported roof/collision; G4.3 autonomous houses |
| Nature | Biome threshold-noise + regenerating point resources | Conservation-reviewed water stores, soil/vegetation/rock classes, biodiversity/animals and terrain-derived cause |
| Art | 16px sprite and Canvas2D background | Vector-authored cached layered assets, visible action work, roof cutaway, A/B benchmark |
| World size | 4,160-tile whole map | Versioned deterministic worldgen source first; chunk caches only if larger map and profiler justify them |
| Persistence | Browser localStorage v3 | Generator version and immutable source/edit overlay; later server journal/epochs if persistence needs grow |

## 3. Priority sequence (not a giant rewrite)

### P0 — integrity and measured baseline, minimal code footprint

**P0.A** [#71 time partition invariance](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/71): build deterministic unit fixture and document allowable dt, before coarse or offscreen ticking.  
**P0.B** [#63 survival quality](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/63): separate 30-day state integrity from mortality/viability thresholds; run more seeds and weather patterns, include one known impossible world control.  
**P0.C** [#73 stale LLM decision basis](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/73): add actor-relevant revision checks and mocked slow-backend experiments without waiting on actual hardware.  
**P0.D** Existing epic [#21](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/21): mark G0/G1/G2/G3 foundations as merged, but leave untested acceptance criteria and hardware claims explicitly open.

**Stop gate:** no physics or autonomy claim based on just text output, CI green on one seed, or a diagram.

### P1 — physical ownership, living world causal rules and cognition

**P1.A** [#26 physical lots/hauling](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/26): zero new-spawn possessions, mass+volume+hands+vessels, direct source drinking, old-save migration, death drops, reservation overlap. This should precede real G4.2 delivery; preserve normal bodily hydration reserves.  
**P1.B** [#72 ecological conservation](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/72): code-backed classification (stone nonrenewable, biomass conditional, water catchment), test resource budgets without nerfing survival blindly.  
**P1.C** Evidence-driven traits/cues/intentions: use [prior benchmark contract](agent-autonomy-benchmark-contract-2026-11-19.md), initial simple trait/social setpoints and private cue router, then strategic LLM intent contracts if the low-cost baseline cannot meet meaningful behavioral-quality goals.  
**P1.D** G4.2 [#61](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/61): physical construction tiles (wall/door/floor/roof), body/workspace prerequisites, exact-once resource and job receipts, navigation/roof support and interior overlays.  
**P1.E** [#70 worldgen identity](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/70): pinned generator identity and immutable-base/delta proof prior to any expanded world size or save schema migration.

**Stop gate:** no resource minted by WFC, render cache, actor imagination, construction declaration or recurring source magic.

### P2 — authored art and optional terrain realism, independently benchmarked

**P2.A** [#64 rendering RFC](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/64): exact-scene 1/2/3x baseline vs vector-authored raster atlas vs small Pixi scene; evaluate readability + frame/CPU/cache/GPU cost. **Prefer Canvas2D + baked vector sprites first**; do not assume WebGL is better until observed.  
**P2.B** small `80×52` coherent river/spring/shoreline + geology/soil input fixture: explicit basin/torus sink policy, continuous flow and finite water; no full Earth generator.  
**P2.C** WFC for local transition art and physically existing structure decoration; space colonization for baked tree crowns/roots; optional seeded path-wear simulation from actual traffic. Bound retries/cache and save only physical world edits.  
**P2.D** hierarchical pathfinding/spatial buckets and independent 16/32-tile chunks only when a bigger map is specified and measured; keep NPC simulation independent of camera.  
**P2.E** natural ecology, wildlife, heredity, culture and economy after food/resource/population constraints and private commitments are stable.

## 4. Tests that decide architecture, not just implementation success

| Test | Required discriminating comparison | Instrumentation |
| --- | --- | --- |
| Fixed-step vs coarse advancement | 360×1min / 36×10min / 1×360min, mid-save, seasonal change | hashes, life/death, health/hydration, stocks, time-costed work, duplicate receipts |
| Zero-spawn carrying | all inventory counts zero vs old possessions preserved on migration | mass/volume/hand/vessel rejections, source drinking, death drops, conserved lot sums |
| Causal memories and traits | identical world under alternate private memory or trait vector | legal action choices, actual world predicates, shared 4B inference calls |
| Attentional routing | deterministic vs fixed Rein cadence vs event-triggered Rein/Hivemind | deaths, goal completions, stale replies, missed cues, p95 wait |
| WFC vs simple autotile | same physical tile skeleton, periodic seam constraints | no physics hash changes, visual clarity, bounded retries, time |
| Vector art vs current Canvas | exact seeded scene and 1/2/3x at matching viewport/zoom | scene legibility, frame-time p50/p95, CPU memory, GPU texture bytes |
| Chunk order independence | same seed, shuffled region load, cross-seam, sparse edited state | source hashes, no disappearing resources/actors, saved delta identity |
| Conservation / fertility | harvested stone vs biomass vs freshwater under controlled weather | source/sink budget, no stone regrowth, growth rate, viable NPC needs |
| Footfall paths | agents with/without path-wear, no invented roads | actual traffic overlay, route stability, changed movement costs |
| Multi-actor collaboration | physically distinct tasks with/without communication and refusal | material receipts, actor consent, conflicts, actual agreed work |

Set quantitative performance/behavior targets **after** measuring current baseline; don't invent a percent improvement in an issue title. Source-controlled golden screenshot tests must not require an artist-controlled runtime asset file for physics.

## 5. Ticket/PR hygiene

Full initial code/PR audit found prior issue-state mismatch: #22, #23, #24, #25, #26 and #60 remain open even though corresponding **partial or full** PRs merged. Add evidence comments and reconcile remaining validation gates before selective closure; do not close all epics blindly.

The current docs in this research series are deliberately separate from the historical `cognition-codebase-hardening.md` baseline and are to be referenced by new implementation PRs. Each PR should state: **problem/observed evidence, changed modules, exact postconditions, test and CI results, save migration, renderer-neutral world effects, hardware claims/limits, and remaining risks.**

### Explicitly rejected proposals

- A shared LLM used for metabolism, route motion, animation ticks, stock mutation or room collision.
- One global cognition director that assigns professions, towns, relationships or social bonds.
- A full new Rust/wgpu engine as the first step of a renderer improvement.
- WFC solving groundwater, continental hydrology, species population balance or resource conservation.
- Infinite/silent stone regeneration because its current node stock has a maximum.
- Chunking a 4,160-cell map before there is a larger-world specification and profiling evidence.
- Automatically declaring all CI green as proof of believable NPC choices or good visual aesthetics.

## 6. Fresh research questions still open

1. Should the game stay a **small, dense, richly interactive torus** for emergent society, or move to many geographically distinct regions? This is a product-scale decision, not primarily an optimization task.
2. How should macro geography and periodic hydrology be **reproducibly authored** in a dedicated Rust studio yet game-safe in a JavaScript runtime without different generators diverging?
3. At what population and world size do linear spatial searches become the dominant cost instead of inference on a 6 GB GPU?
4. Which minimal ecological variables actually change survival/behavior meaningfully? Soil moisture may be enough for the first pass; plate kinematics likely aren't.
5. Will personally learned source reliability and inferred promise adherence remain consistent through years of resource scarcity, death and gossip?
6. Do vector tree silhouettes remain readable and distinguishable when the camera is zoomed out enough to observe a settlement, while still avoiding false collisions and occlusion?
7. Could an observer-focused provenance inspector show **why** each NPC believes a river is safe, a person is trustworthy, or a building project is worthwhile without revealing hidden world truth?
8. How should meaningful nature and culture persist over seasons when humans die, rather than resetting on a fixed spawn schedule?

This document answers design *direction* but intentionally does not claim any new feature implementation or hardware benchmark.
