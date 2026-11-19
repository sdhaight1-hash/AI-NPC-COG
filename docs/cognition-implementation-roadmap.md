# Cognition implementation roadmap — code-grounded gates

**Status:** Historical planning specification, not the live completion ledger. G0.1–G3.6 have merged implementation slices, and G4.1 blueprint declarations are on `main` as of 2026-11-19; remaining gaps and milestone states require code/CI validation. The gates below describe intended behavior and do not themselves prove it. **Parent epic:** [#21](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/21). Read [the audited code contracts](cognition-codebase-hardening.md) and [research review](cognition-research-audit-2026.md) first.

**Current research update:** [2026-11-19 code-grounded cognitive audit](embodied-cognition-research-agenda-2026-11-19.md) and [follow-up implementation/paper investigation](cognitive-executive-followup-research-2026-11-19.md). The November 18 code references in this document are historical; check current `main` before implementing a ticket.

**Additional evidence (2026-11-19):** [Intention governance, curiosity and cooperation research](agent-autonomy-deep-investigation-2026-11-19.md), [causal evaluation gates](agent-autonomy-benchmark-contract-2026-11-19.md). These are research designs, not completed features.

## Baseline and scope rule

The November 18 snapshot has these sources: `public/app.js` for simulation loop, movement, decision HTTP calls and save v3; `public/emergence.js` for legal actions and hard-coded goals; `public/crafting.js` for finite multi-stage workpieces; `public/biology.js` and `public/civilization.js` for physiology and death; `public/agency.js` for utilities/goals/beliefs; `public/cognition.js` for episodic memory/instinct. Keep adapters surgical; don't port the game, replace functioning crafting or add LLM-per-tick calls.

### Ticket dependency graph

```text
#22 deterministic runtime
 ├── #23 event receipts ── #24 goal benchmarks
 └── #25 activity lifecycle ── #26 reservations & hauling
                                  └── #27 bounded project planner
#22 + #23 ── #28 private perception ── #29 typed memory/retrieval
                         └───────────┘ (goal planner uses evidence)
```

### Phase G0: Make progress verifiable *before* deep AI changes

**[#22 G0.1](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/22): extract simulation runtime.** Existing seam: `app.step` currently calls `AgentWorld.regenerate`, `Civilization.advanceArrivals`, movement, needs/death, task completion and `scheduleIdleAgents`. Separate pure simulation and I/O; inject clock, seed and response schedule. **Gate:** 5 founders × 10,000 1-minute ticks, DOM/HTTP/model-free; matching event and state hashes for two runs; preserve save v3.

**[#23 G0.2](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/23): event receipts.** Existing seam: `AgentWorld.complete` returns only `{ok,message}` and `app.completeActivity` updates counters; `Crafting.begin` and `advance` mutate inventory. Wrap authoritative effects in typed receipts that record before/after revisions, resource deltas, action IDs and precise reasons; narration is a projection. **Gate:** missing-input attempt has zero mutation; two-step craft has exact input/output ledger; save/replay cannot apply receipt twice; inspector distinguishes proposals from physical completions.

**[#24 G0.3](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/24): benchmarks and soak.** Implement fixtures and a headless runner with deterministic/mock model options. **Gate:** water rescue (single-step), known tool craft (3–5), project with 10+ actions, lost tool interruption, mistaken belief, two-party supply competition. Check world predicates, not generated statements. 30-day five-founder soak; bounded queues/memory; no negative inventory; no duplicated workpieces. Each run reports seed, hash, command count, effect count, goals achieved, inference calls, no-op/stale/rejected ratio. Test an intentionally injected mutation bug to ensure a benchmark fails.

```pseudo
runScenario(fixture):
  state = load(fixture.initialWorld, fixture.seed)
  for minute in 1..fixture.maxMinutes:
    responses = fixture.policy(state.publicActorSnapshots)
    state, receipts = Simulation.advance(state, ONE_MINUTE, responses)
    assert invariants(state, receipts)
    if fixture.goalPredicate(state): return PASS(trace, hash(state))
  return FAIL(trace, unmetPredicate, exactBlockReasons)
```

### Phase G1: Build physical work substrate

**[#25 G1.1](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/25): common activity lifecycle.** Extend `n.task.readyAt` from `app.setAction` without breaking stage-based `Crafting.advance`. Normalize `VALIDATED → RUNNING ↔ INTERRUPTED/BLOCKED → COMPLETED/CANCELLED`; a started job owns stable work-progress fields. **Gate:** 20-minute activity interrupted at 9 resumes at 9/20; no early output; save during interruption equivalent to uninterrupted save; no per-tick inference.

**[#26 G1.2](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/26): finite reservations and hauling.** Aggregate counts are now in `n.inventory`, `crate.contents`, `world.items`; craft inputs are consumed by `Crafting.begin`. Introduce canonical lot identity and tokenized claim ledger gradually, with legacy count projections. **Gate:** competing two-NPC claims never reserve > available; retry idempotent; death and cancellation release unconsumed claims; workpiece consumed input is not refunded; hauling costs real time and traversable movement.

**[#27 G1.3](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/27): bounded goals/projects.** Existing `AgentWorld.nextPlanAction` supports only hard-coded stock/fire/shelter/craft projects, and `Agency.outcome` increments goal progress with subaction success. Define goal predicates and legal known-method dependency expansion; keep existing planners as adapters. **Gate:** autonomous shelter chain of 10+ committed physical operations; missing tool produces specific prerequisite; thirst suspends and resumes; goal survives restart; no unlearned recipe execution; two temperaments choose different goals while both obey physical constraints.

```pseudo
plannerTick(npc, world, receipt):
  if npc.goal.predicate(world): completeGoalWithReceipt()
  elif criticalNeed(npc): suspendCurrentActivityPreservingWorkpiece()
  else:
    blocked = findBlockedDependency(npc.project)
    if blocked: repairUsingKnownMethodOrExplainBlock(blocked)
    else: dispatchNextReadyActivityOnlyIfLegalAndReserved()
```

### Phase G2: Knowledge and epistemic boundaries

**[#28 G2.1](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/28): sensory gate.** Fix `app.sceneFor` raw `state.world.nodes` near-neighbor scan, and remove world-object lookups as a source of unauthorized knowledge from `Agency.observe`. **Gate:** walls/darkness mask vision; acoustic reach differs from visual identity; close inspection confirms only reachable facts; deterministic private observations; prompts contain no hidden NPC state.

**[#29 G2.2](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/29): typed memory.** Migrate `Cognition.record/recall` and `Agency.state().beliefs` with stable IDs, first-hand/reported/inferred provenance and contradiction links; do not claim legacy text is observed fact. Separate episodic, semantic, working, procedural and social stores without unnecessary vector dependencies. **Gate:** old relevant water episode beats 20 irrelevant recent ones and changes chosen action; false rumor never silently becomes verified; no leakage between NPCs; supported consolidation bounded and backwards compatible.

### Phase G3: Propose tickets after G0–G2 gates (not pre-authorized implementation)

Social speech/witness/promise/consent with mutual world receipts; shared project commitments; non-LLM animal survival/ecology; reproduction, inheritance, lifespan and upbringing; institutions and settlements. All require independent fixtures and world predicates. Do **not** combine into a large speculative rewrite.

## Required engineering review for every ticket

- Link current function/path and exact data that changes; verify against the current branch before editing.
- State preconditions, state transitions, postconditions, error/recovery matrix and legacy-save mapping.
- Write failing tests first; prove they fail for the intended reason; then implement minimum delta.
- Run complete Node suite and Windows installer workflow where available; do not claim Windows runtime/GPU testing without executing it.
- Verify 5-NPC representative scenario and 30-day soak for high-risk changes; replay with seed and report hashes.
- Include at least one adverse scenario (interrupted craft, actor death, stale LLM response, competing resource claims, or corrupt save), plus idempotency/restart check.
- Never equate a passed unit test, model request count, pleasant conversation or chosen intention with observed world progress.
- Merge only after explicit outcome evidence and review of semantic compatibility. Keep changes in separately reviewable branches/PRs.

## Acceptance principles

**World truth != observation != belief != utterance != intention != receipt.**  
**Progress means an authoritative postcondition became true.**  
**No manufactured items without physical inputs; no social knowledge without communication; no model-powered step spam.**

Docs hardening does not fulfill implementation issues. The baseline must be re-audited if `main` changes during review.
