# Full repository audit ledger — architecture, tickets, code, CI, and cross-repo opportunities

**Date:** 2026-11-19  
**Baseline:** `main` at `2ca26b1fefb2aebbeeb1270fbb096e5699c9d992` (research PR #69 merged after successful CI).  
**Status:** Evidence-led design audit. **No runtime implementation or Windows/browser GPU benchmark in this document.**  
**Supporting reports:** [prior cognition analysis](agent-autonomy-deep-investigation-2026-11-19.md); graphics/worldgen and cross-repository analysis to follow. 

## 1. Audited repository shape and boundaries

The GitHub default-branch tree was inspected recursively and is **not truncated**. Distinct code areas and ownership:

| Area | Files reviewed | Current function | Gap / recommendation |
| --- | --- | --- | --- |
| World generation, substrate and calendar | `public/frontier.js` | Seeded 80×52 periodic biome map, finite resource nodes, basic caves and z=-4..3, four seasons in a 108-day year | No explicit elevation/drainage/soil/ecosystem field; no chunk contract or worldgen revision; no complete multi-level excavation |
| Individuals/biology | `public/emergence.js`, `public/biology.js`, `public/civilization.js` | Real time-costed actions, meal and hydration proxy, mortality, five founders, deterministic monthly arrivals | Hard-coded two-adjective traits and universal social need; food/water seeded in initial inventories; fixed population policy, no reproduction/fauna |
| Memory/perception/cognition | `public/cognition.js`, `public/agency.js`, `public/perception.js`, `public/evidence-memory.js` | Bodily cues, lexical episodes, actor-private vision/hearing, inspected and hearsay provenance, source reliability | Overlapping knowledge stores, no single belief projection or stable intentions/attentional cues; potential unwrapped lexical-memory proximity |
| Physical work | `public/activities.js`, `public/reservations.js`, `public/receipts.js`, `public/crafting.js`, `public/projects.js`, `public/construction.js` | Timed resumable activities, reservation groups, effects receipts, multistage crafting, project DAGs; G4.1 inert tile blueprints | No physical mass/volume/hands/liquids or canonical item lot ledger; G4.2 not built; existing shelter is an instant-style completed structure after timed labor |
| Authoritative simulation and world action adapter | `public/simulation.js`, `public/world-runtime.js` | Browser-free fixed world clock, movement, pathfinding, action list, project progression and model-free autonomy | Current 80×52 global actor/world scans and world-sized navigation; chunk-scale/offscreen update policy absent |
| Persistence | `public/persistence.js` | Browser v3 JSON save/restore of actors/world/receipts/actions | LocalStorage prototype, no world chunk deltas, append-only durable server journal, large-world migration, or authoritative cross-process epoch |
| Model service | `server.mjs` | Shared Rein one-token action ranking / optional Hivemind structured choices and dialogue; HTTP inference lane | No open-ended durable intention protocol, measured fairness/semantic capability or persistent multi-instance inference queue; no production-grade identity/auth assumptions |
| Browser/visuals | `public/app.js`, `public/pixel-art.js`, `public/index.html`, `public/style.css`, `public/physics.js` | Original 16px procedural pixel art, Canvas2D whole-map background, actor view and inspector, minimap, camera, optional CC0 sprite atlas | No chunk visual cache, scalable vector asset pipeline, per-region dirty redraw, real indoor cutaway, GPU batch, or artwork LOD |
| Headless validation | `scripts/headless.mjs`, `scripts/benchmarks.mjs`, `tests/*.test.mjs` | Deterministic replay/checkpoint, fixed scenarios, 30-day soak, physics/perception/crafting/lifecycle/inference regression cases | No visual golden/long-range chunk tests, representative multi-seed zero-spawn survival suite, environmental affor­dance ablations, model-quality benchmarks |
| Windows/setup/CI | `scripts/install.ps1`, `scripts/install-art.ps1`, `install*.bat`, `start*.bat`, `.github/workflows/test.yml` | Explicit checked binaries, optional art, Linux Node CI and Windows installer script checks | CI does not prove actual CUDA setup or interactive GPU FPS; add hardware trace and browser visual regression when changes warrant |

### Observed geometry and rendering facts

- `Frontier.WIDTH=80, HEIGHT=52, MIN_Z=-4, MAX_Z=3`; **4,160** surface cells with x/y periodic wrapping. These are finite grids and small enough that chunking is *premature as a performance fix today*.
- `frontier.js:generate` samples periodic interpolated hash noise with biome thresholds; static seed, no generated rivers, drainage or elevation field. Water as a resource node is different from visually rendered water biome tiles.
- `pixel-art.js:drawWorld` builds background for all terrain; `app.js` creates whole-world surface and underground canvases and tiles images across wrap offsets. Dynamic objects and residents are drawn each view; there is no streamed chunk store or renderer.
- `drawWorldObjects` draws most object kinds but visual code has not yet integrated physical floor/wall/door/roof tiles from G4.1. Roof support/indoor cutaway are out of scope in that milestone.
- `WorldRuntime` and `Simulation` run all actors while the browser is observing; future culling must never halt their physiology, goals, or physical conservation.

### Sources of truth and duplication risks

- `n.inventory` is mostly numeric category counters while `bio.pantry` stores a second list of physical food identities; this is a migration blocker for real mass, volume and consumable stacks.
- `Cognition`, `Agency`, `EvidenceMemory` all maintain personal historical/belief information. Do not add a fourth unconstrained truth store; prefer actor-owned evidence projection.
- `public/app.js` and `public/world-runtime.js` retain different scheduling paths even though physical action rules are shared; keep connected vs model-free invariants synchronized and explicitly test equivalence.
- `construction.js` tracks **blueprints** only. Its `world.construction.tiles` stays empty and untrusted finished tiles are rejected on restore until authoritative G4.2 receipts.

## 2. PR, ticket, and document reconciliation

The REST PR and issue indexes through #69 were inspected, including non-PR issues. **Do not equate an open issue with zero code, or a merged PR with full acceptance.**

| Tracking item | Verified related merged work | Assessment / required issue hygiene |
| --- | --- | --- |
| Epic #21 + issues #22/#23/#24 | PR #30 (headless), #31 (receipts), #32 (benchmark harness) | Foundation implemented; tracking issues still open. Reconcile actual acceptance tests, then close/annotate completed portions |
| #25 G1.1 | PR #35 resumable activities | Implemented first lifecycle; issue remains open. Assess all intended invariants before closure |
| #26 G1.2 | PR #36 finite reservations | First slice merged, full hauling/workpiece physical ownership incomplete; **keep outstanding work explicit** |
| #27 G1.3 | PR #38 durable projects | Ticket closed; project planning remains template-based, not autonomous multi-year intention governance |
| #28/#29 G2.1/G2.2 | PR #39/#40 | Private perception and evidence memory foundations; not complete actor knowledge or long-term autobiographical learning |
| G3.1–G3.6 (#41/#43/#45/#47/#49/#51) | PR #42/#44/#46/#48/#50/#52 | Implemented proof-of-concept communication and mutual offline companionship; no full social contract or consent economy |
| #59/#60 G4.1 | PR #67 | Blueprints implemented; issue #60 open; verify G4.1 gate, update status and close completed slice if appropriate |
| #61 G4.2 / #62 G4.3 | No physical-tile execution merged | Still open. Requires inventory/hauling, physical occupancy/collision and receipt-backed work |
| #63 survival | PR #65 mortality observability; PR #66 proactive water seeking | Not resolved. Multi-seed/time-speed evidence and zero possession survival required; keep open |
| #64 art direction | Existing Canvas renderer, discussion RFC | Still research/design. Avoid promising vector/GPU overhaul before measurable A/B prototype |
| PR #68/#69 | Both merged, CI green | Documentation only; no new runtime behavior proved |

**Historical PR handling:** #34 and #37 were closed without merge and succeeded by clean or alternative PRs (#35 and #36). #12/#13 were replaced by integration PR #14. These are not unshipped features solely because one predecessor PR is closed.

**Documentation:** `docs/cognition-codebase-hardening.md` intentionally captures an older pre-implementation snapshot; `docs/cognition-implementation-roadmap.md` is marked historical. `docs/emergent-world-roadmap.md`, `docs/architecture-and-physiology.md`, and `docs/agency-motivation-beliefs.md` need a current-status index so design intentions cannot be confused with feature availability. G4 construction document is more current.

## 3. CI evidence and limitations

`.github/workflows/test.yml` checks source syntax and runs `scripts/headless.mjs` with fixed seeds, a 30-day no-model soak, all `tests/*.test.mjs`, and Windows PowerShell installer validation. The head of previous PR #69 passed CI before merge. This supports code consistency, deterministic baseline and installer script checking; it is **not a Windows GPU, interactive browser, visual, multi-seed or live 4B LLM-quality result**.

`scripts/benchmarks.mjs:runSoak` labels its result `pass:true` provided invariant checks and nonzero completed tasks pass; a positive death count is returned as a diagnostic, not an automatic soak failure. The separate seven-day survival test applies a stricter founder-survivor gate on one seed. Never label a 30-day soak 'everyone survives' because the command exited zero.

## 4. Initial design decisions

1. **Do not make chunk streaming a prerequisite for cognition progress at 4,160 cells.** Begin by defining stable absolute coordinate/seed/revision and persistent edit-layer contracts. Implement chunk generation only when an expanded world/spec/profiler warrants it.
2. **Separate macro geography from local presentation**: stable terrain/climate/hydrology/soil and finite resources -> tile biome/ecology -> settlement/structure affordances -> procedural vector/pixel visuals. Wave Function Collapse belongs to constrained local assemblages, not drainage or NPC reality.
3. **Keep rendering residency independent of simulation residency.** Unseen residents still exist; coarse far-field dynamics may use aggregations only after explicit conservation and replay tests.
4. **Use physical-lot inventory and food/water vessel rules before G4.2 cooperative hauling**; new residents begin with zero possessions, biological fuel remains physiological.
5. **Cognition as an event-driven preference/intention executive**, not an LLM clock; separate actor-private cues, stable traits, deliberate commitments and low-cost physical routines.
6. **Test from deterministic effects to user-observable behavior**. Instrument saved world and region hashes, chunk boundary equivalence, hidden information isolation, long-soak mortality and performance.

## 5. External repository audit scope

The authenticated GitHub account lists **19 repositories** including AI-NPC-COG. Candidate cross-project evidence includes: `Hexel-survival-game` streamed chunks/world source contracts; `Hexel-Game-Engine` independent planetary patch and fields designs; `Voxel-Game-Engine` foliage vector silhouettes and biome authoring; `World-building-Project` tectonic layers; `AI-RP-Program` provenance/actor memory benchmarks and world-epoch stale-reply cancellation; `Gaia` and `Voxel-Survival` hydrology/terrain design. Verify source and design status individually: **do not assume aspirational docs are running game code**.

Further linked research/working designs will be in separate files on this branch.

## 6. Implementation and branch reconciliation checkpoint

The branch inventory was compared with `main` at `9c5ae81`. Of 66
non-main refs, 11 were ancestors and 47 others were the exact heads of
closed, merged PRs. Squash merges account for branch ancestry divergences
with recorded merged PRs. The two death-custody refs were active during
this scan.

| Older branch or PR | Integrated implementation |
| --- | --- |
| #34 resumable activities | #35 uses the same activity lifecycle and ships interrupted checkpoint tests |
| #37 finite reservations | #36 ships `reservations.js`, ordered finite holds, and contention tests |
| #12 season cycle and #13 model selector | #14 integrates the compact calendar, seasonal resource effects, and local model selection |
| `feat/durable-project-planner-g1-3` | #38 owns the hierarchical construction/crafting graphs. Supply goals already execute through the legacy plan and ordinary action kernel |
| `feat/g2-2-evidence-linked-memory` | #40 includes receipt-linked recall, consolidation, migration, and derived beliefs. Later PRs add private reported claims and verification |

The older alternatives are historical refs. The active custody branch
incorporates the merged generator work and retains both commit histories.

| Gate | Current evidence |
| --- | --- |
| #22 browser-free runtime | Merged #30, deterministic headless smoke and mid-activity restore tests |
| #70 generator identity | Merged #94, legacy seed fingerprints, wrapped region checks and checkpoint migration |
| #91 vessel bootstrap | Merged #92, direct source drinking, staged flask manufacture, and constrained collection |
| #90 per-vessel ownership | Still needs vessel instance identities and independent fluid contents |
| #26 lot custody | Still needs canonical ownership of carried and placed material lots |
| #59 real construction | Existing blueprint declarations, with physical tile work and co-operative housing still open |
| #72 ecology | Resource regeneration and finite source work are in place. Conserved environmental budgets remain open |

Major phases still require acceptance fixtures for server-owned world state,
lineages and development, nonhuman ecology, voluntary institutions, and
cultural continuity.
