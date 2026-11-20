# Final pre-code research I — Simulation time, ordering and causal replay

**Reviewed:** 2026-11-19. **Status:** Design contract / test-first research. No runtime changes or new benchmark results.  
**Code baseline:** `main` at `32318081588a805d51ac31e0f3e31c91f4291c11`.  
**Tracking:** [#71 time-partition gate](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/71), [#63 survival](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/63), [repository-wide audit](full-repository-audit-ledger-2026-11-19.md).

## Question: fixed step, discrete events, or a hybrid?

**Decision: retain the existing fixed-step authoritative simulator initially.** Add a well-defined **simulated-time advancement contract** and deterministic event-boundary handling only as demanded by failing tests. The renderer's wall-clock cadence and LLM's real latency must remain separate from fictional-world elapsed time.

Source research:

1. [Gaffer on Games, Fix Your Timestep!](https://www.gafferongames.com/post/fix_your_timestep/) explains why fixed integration steps decouple rendering variance from physics and why long catch-up loops can spiral. It is **not** proof that our biological and resource systems are partition-invariant.
2. [SimPy Time and Scheduling](https://simpy.readthedocs.io/en/latest/topical_guides/time_and_scheduling.html) documents deterministic event processing using time, priority and insertion-event ID; the [stable SimPy overview](https://simpy.readthedocs.io/en/stable/index.html) explicitly describes discrete-event simulation as potentially overkill for unrelated fixed-step processes.
3. [Cataclysm: DDA PLAYER_ACTIVITY](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/PLAYER_ACTIVITY.md) separates work that is started, updated per turn, finished, canceled and resumed. This aligns with our `Activities`; no full game scheduler should be imported.
4. [Fluid HTN Planner.cs](https://github.com/ptrefall/fluid-hierarchical-task-network/blob/master/Fluid-HTN/Planners/Planner.cs) replans when state becomes dirty or work fails. Important lesson: a new event does not imply a global search or a model call.
5. [Gillespie exact stochastic simulation survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC6408336/) illustrates why event-driven methods excel for rare stochastic transitions, **not** why we should simulate every game minute as a chemical reaction. Stochastic biology may be a later separate module.

## Source-grounded causal hazards in our current code

### Hazard A — elapsed time can be silently truncated in one subsystem

[`public/simulation.js:advance`](../public/simulation.js) does `state.clock += elapsed`, advances resource regrowth by that elapsed amount and runs one NPC update for each living NPC. But [`Biology.advance`](../public/biology.js) does `dt = Math.min(dt,360)`. For a direct API call of 720 simulated minutes, **the body integrates at most 360**, while the world clock progresses 720. No evidence of such a call in a normal 50-ms browser frame is asserted; this is a public-kernel contract hole.

### Hazard B — crossing an event boundary in one interval changes which conditions apply

`Simulation.advance` updates time and weather to the **end** of the interval, then runs `AgentWorld.regenerate(world,elapsed)`. An interval spanning rainfall or a seasonal transition applies one terminal weather/season rate to the whole elapsed span. It then advances `Civilization.advanceArrivals` for all crossed month boundaries, but their first biological and behavioral update occurs at the terminal clock rather than exact arrival instant. A missed midnight triggers memory consolidation **once** if `Math.floor(before/1440)!==Math.floor(after/1440)`, even if several days elapsed.

This is **expected non-equivalence**, not a demonstrated corruption: `advance(360)` and 360 calls to `advance(1)` are not defined to mean the same thing yet. The contract must decide whether arbitrary batching is allowed or rejected/split.

### Hazard C — task work may finish late if large intervals are allowed

`Activities.progress` uses `task.readyAt - state.clock`. `Simulation.advance` advances physical work and schedules follow-up actions only once at the end of an input interval. A 100-minute interval can finish a five-minute task but not run all subsequently available work, making interval size affect output. `WorldRuntime.move` likewise takes `elapsed`. This is not an argument for manufacturing actions mid-interval; it is an argument for a **canonical slice boundary**.

### Hazard D — time, event order and death are one contract

The code currently updates world state/time/weather/regrowth, spawns arrivals, iterates NPCs in array order, advances physiology, checks death, then completes physical work, then schedules more work. Therefore an NPC may die in a tick in which a previous work completion would have saved it if sub-minute event ordering were different. Preserve existing outcomes initially; any reordering is a **game rule change** and requires explicit scenario/baseline comparison.

## Proposed minimum time contract

- **Canonical unit:** simulated minute for authoritative action/physiology rules; fractional minutes permitted for movement/clock presentation only if the same ordered accumulators are used in browser/headless. Do not require a 60Hz authoritative NPC tick.
- **Advance budget:** `Simulation.advance` will eventually accept bounded canonical substeps; either reject intervals larger than a specified maximum or split them into deterministic units internally. Avoid arbitrarily setting 360 min as the legal maximum merely because `Biology.advance` currently clamps there.
- **Wall clock isolation:** `requestAnimationFrame` and model HTTP latency only determine how often the system *requests* simulated advancement. They never cause NPC resources to progress while game is paused.
- **Tie-breaking:** for future due events use stable `(dueSimMinute, phasePriority, actorId, commandId)` with an incrementing durable event sequence where necessary. No order derived from object iteration of untrusted saves or real HTTP completion timing.
- **RNG:** all world-affecting stochastic choices seeded by stable world/actor/event identity and event number, not ambient `Math.random()` or render callbacks.
- **Time discontinuities:** changes to weather and seasons occur at explicit boundary phases; arrivals occur at their defined instants; birth/death and resource transfers are authoritative receipts.
- **Persistence:** serialize any pending deterministic event state and per-actor progress before an elapsed interval is considered committed. Existing v3 state remains readable.

### Exact proposed integration, without a universal scheduler

```pseudo
advance(state, requestedMinutes):
    requireFinitePositive(requestedMinutes)
    remaining = requestedMinutes
    while remaining > 0:
        dt = min(remaining, CANONICAL_MAX_STEP,
                 untilNextKnownBoundary(state))  // optional boundary before slice
        assert dt > 0
        advanceOneCanonicalSlice(state, dt)       // existing Simulation logic initially
        remaining -= dt
        assert noElapsedBodyTimeLost
```

**Caution:** just splitting a 720-min interval into 720 one-minute calls can be computationally expensive and change current call semantics. The first implementation should be **test-only comparison and explicit accepted range**. If optimized environmental steps are introduced, prove their equivalence or explicitly document approximations.

## Acceptance / benchmark contract (#71)

| Case | Exact observation |
| --- | --- |
| 1 minute vs 10 minute vs 360 minute inputs | Compare state hash, relevant body stores, node stocks, work progress, receipts and death timing at same **simulated timestamp** |
| 720 minute input | Detect/explain body time lost under current 360-min clamp; future implementation must reject/split rather than silently lose it |
| Interval straddling rain/day/season/month | Water/food growth, arrivals and memory consolidation occur under documented boundary semantics |
| Due work at T+5 with T+100 request | Work completion and next legal task schedule cannot mint 95 minutes of prior unworked output |
| Long fast-forward | Dead actors cannot complete tasks afterward; resource reservations cannot complete after death; trace IDs remain monotonic |
| One run vs mid-simulation save/restoration | Exact replay of world and actor checkpoints, holding input schedule and model mock decisions constant |
| Browser vs headless | A common physical action schedule must result in equal world and receipt hashes; presentation never changes authoritative state |

### Minimum safe coding order

1. Instrument comparison fixture on the **current unchanged engine**; state precisely which outputs diverge.
2. Define supported `advance` input range and canonical step. Do not change death or survival balance at the same time.
3. Add a dedicated `advanceBounded` wrapper or behavior behind existing `Simulation.advance` with exact tick/replay tests; preserve ports.
4. Add boundary phases only when a failing fixture exposes a real mismatch.
5. Rebaseline #63 survival and #72 environmental budgets on identical seeds; do not conflate changes to time integration with resource-rate tuning.

**Decision frozen for coding:** no general-purpose discrete-event engine, no server conversion and no mixed time-step optimization until the existing fixed-step invariants and costs are measured.

## Implementation checkpoint — PR #76 (2026-11-19)

- **Changed:** `public/simulation.js` now processes direct `elapsed>1` calls as consecutive full simulated minutes plus a final fractional slice; `elapsed<=1` preserves the existing single-slice browser behavior. Direct inputs over 1,440 simulated minutes raise `RangeError` **before** mutation.
- **Added test:** `tests/time-partition.test.mjs` compares full simulation state and work events for a 720-minute call versus 720 one-minute calls, due physical work, monthly arrival and fractional 0.02-minute ticks; rejects unbounded catch-up. Existing tests that relied on the old one-action-per-call artifact were updated to check physically committed work rather than the last log line.
- **Scope intentionally deferred:** exact equivalence between arbitrary fractional partitions and refined mid-minute weather/event boundaries; those are not claimed by this patch. Current weather still changes based on the end-of-slice timestamp, and no new system-wide event queue is introduced.
- **Validation:** GitHub PR [#76](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/76) is the source of truth for actual test/merge status; this document by itself does not claim CI completion or hardware benchmarking.

## Implementation checkpoint — restore at an event boundary

The initial world clock now agrees with the runtime clock before the first
action. Restoring v3 derives the calendar day and weather from the validated
seed and absolute clock before applying a saved transition. A regression
places an arrival, death, and completed freshwater action at the same month
boundary. It compares 360 one-minute slices, 36 ten-minute calls, one
360-minute call and a midpoint save/reload.

Canonical equivalence applies to schedules that use the same one-minute
slice boundaries. Calls containing different fractional boundaries may
sample movement, weather and checks at different points within a minute.
This distinction matters when comparing browser playback speeds.

The boundary fixture exposed a stale observer selection after headless
mortality. The save codec now normalizes observer selection against living
residents so a restore and an uninterrupted run encode the same state.
