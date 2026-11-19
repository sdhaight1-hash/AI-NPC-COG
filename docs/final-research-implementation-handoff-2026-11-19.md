# Final research synthesis — stop researching; begin measured implementation

**Date:** 2026-11-19. **Research-only release candidate.**  
**Baseline:** `main` at `32318081588a805d51ac31e0f3e31c91f4291c11`.

This document resolves the three architecture choices left open by the [full-repository audit](full-repository-audit-ledger-2026-11-19.md). It is deliberately a coding handoff, **not** a new multi-month architecture program.

## Final source-checked design decisions

| Question | Decision | Implementation owner | Test gate |
| --- | --- | --- | --- |
| Fixed step or general event simulation? | **Keep fixed-step `Simulation.advance`**, formally bound/split elapsed time and handle meaningful calendar/event boundaries without losing metabolism or action work | `public/simulation.js`, `public/biology.js`, current runtime adapter | [#71](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/71), [time contract](final-research-time-causality-contract-2026-11-19.md) |
| Counts or physical ownership? | **One canonical physical lot/custody ledger**; all-or-nothing operations, zero possessions for new residents, real vessels and carrying limits; projections for legacy counts | `AgentWorld`, `Crafting`, `Reservations`, `WorldReceipts`, `Persistence` | [#26](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/26), [inventory contract](final-research-physical-ownership-contract-2026-11-19.md) |
| Constant model polling or event-driven cognition? | **Code owns physiology/reflexes/routine work; actor-private cues trigger bounded selective LLM intention review**, with explicit persistent goal commitment and stale-response refusal | `WorldRuntime`, `Agency`, `Activities`, `Projects`, `Perception`, `EvidenceMemory`, connected `app.js` | [#73](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/73), [executive contract](final-research-cognitive-executive-contract-2026-11-19.md) |

## The extra optional question: procedural generation versus persistent evolution

Decision: **generation establishes initial immutable potential, receipts and scheduled ecology create later history**. A map render, WFC decoration, chunk cache or seeded visual tree cannot directly increase stone, water, tools or living population.

- `Frontier.generate`: initial geology, biomes, source/node identities and climate as a versioned seed input.
- `world.edits` and later physical tile/lot tables: save every tree harvest, source depletion, building, migration/arrival and entity transition explicitly.
- Ecosystem updates: actual finite stocks and transfers from sunlight/rain/runoff/biomass/reservoirs, with scheduled update rates and [#72](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/72) conservation tests.
- Rendering: cached vector assets/WFC/space-colonization artwork project **existing** world state and never create gameplay effects.
- Chunk eviction: presentation-only; actor biology/commitments and physical resources persist and remain queryable.

See already completed [top-down worldgen, WFC and chunk research](topdown-vector-chunk-worldgen-research-2026-11-19.md). No further deep dive is necessary before the next code PR.

## Implementation sequence: deliberately small PRs

1. **#71-A: observational time-difference fixture only**. Same seed/schedule, compare one-minute slices vs coarse intervals, midnight/month transition, body clock clamp and 5-minute work ending inside 100-minute interval. Record observed divergences. No balance or physics change.
2. **#71-B: bounded canonical advance**, only after fixture identifies exact contract. Re-run headless canonical hash, founder survival and save/restore tests.
3. **#26-A: physical inventory foundation**. One item-definition table, actor hands, ground objects, lot identity, mass/volume caps and direct drinking. Introduce zero possessions for *new* NPCs; preserve historical saves.
4. **#26-B: transactional crafting, workpiece and storage integration**. Atomically consume/create lots and prove old-command deduplication beyond receipt retention; death disposition and crate/waterskin transfer. Only then implement physically delivered G4.2 materials.
5. **#73-A: actor-private cue and stale-intent fixture**. Mock delayed model, actor evidence/revision, new bodily danger, target depletion and unrelated distant events. Keep safety working while model is busy.
6. **#73-B: minimal durable intention and conditional strategic call**, measured vs current Rein one-token action ranker; traits/social setpoints and emotion can follow with separate behavior gates.
7. **#72: finite environmental stores** after inventory and timestep contract make material budgets measurable, then G4.2 physical building and optional vector art A/B.

**Parallelism:** the #71 time fixture and #73 mocked stale-response fixtures can progress independently of physical lot implementation, as long as they do not change physical-authority semantics. New ecology must wait until stock units and timestep semantics are defined. The art prototype is independent and optional.

## Quantitative proof required for declaring success

- State/replay equality under canonical schedule and stable item lots.
- Negative controls: dead NPC, stale world resource, water with no vessel, full hands/full mass/full volume, expired reservation, malformed v3 save, duplicate command, hidden observation.
- Behavioral outcomes: survival on **multiple viable seeds** (with at least one impossible control), actual completed work/goal predicates, independent social decisions, cue missed/duplicated counts.
- Costs: CPU wall time and memory for headless simulation, model requests and p95 queue time for one shared 4B inference lane, render FPS only in art-specific studies.
- No assertion of Windows RTX 2060 results unless the actual device is used. Documentation CI is not a model/hardware benchmark.

## Final research cautions

1. The library comparison establishes viable architectural *patterns*, not performance claims for our project.
2. The [code-derived physical transaction risks](final-research-physical-ownership-contract-2026-11-19.md) need regression fixtures before declaring exploitable duplication. A thrown post-mutation exception is a semantic danger, not a tested live repro.
3. Time partition equivalence for coarse calls is **not currently promised** by `Simulation.advance`. Test first; don't describe differences as regressions before defining which inputs are supported.
4. Some reference implementations (e.g. Cataclysm: DDA's current committed-NPC-goal loop) are much larger than this project. Borrow their commitment and interruption concepts, **not their architecture wholesale**.

**Research exit criterion met:** three explicit module contracts, source-backed alternatives, narrow issue owners, measurable acceptance criteria and a safe implementation order. The next useful action is coding the #71 fixture, not another broad literature sweep.
