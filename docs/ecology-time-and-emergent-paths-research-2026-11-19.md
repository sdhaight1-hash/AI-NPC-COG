# Systemic rabbit holes: ecological conservation, simulation time, trails, and cognition latency

**Date:** 2026-11-19. **Status:** Source-verified research hypotheses, no gameplay changes.

## 1. Confirmed issue: bounded source stock is not the same as conserved material

In [public/emergence.js `regenerate`](../public/emergence.js), all depleted finite source nodes gain stock under a periodic increment:
- water: `0.027 * (precipitation ? 1.5 : 0.8)` stock units / simulated minute;
- food: `0.018 * seasonalGrowth`;
- fiber: `0.012 * seasonalGrowth`;
- **all other nodes, including stone and wood, regrow at `0.008` units/minute**.

Node stock never exceeds its starting `max`, but there is no corresponding upstream reservoir or resource flux, no soil nutrient constraint, and stone regrowth is not supported by geological deposition. At this code rate a depleted deposit can produce an additional unit roughly every 125 simulated minutes. This is **not material conservation**: it's a bounded refill policy. It may be a conscious short-session gameplay abstraction, but it conflicts with long-run world ecology and mineral economics. A single `max` cap does not make cumulative extraction finite.

Water currently has a finite **point-source stock**, but regen is rainfall-modulated without precipitation volume debits, catchment inflow, groundwater or recharge accounting. Rain and surface flows cannot yet be used to infer a lake's mass.

### Proposed resource-class rules

| Source class | Initial rule | Long-term causal transition |
| --- | --- | --- |
| Exposed rock/ore/mineral | Nonrenewable in ordinary timeframe; depleted deposit remains depleted | Geological uplift, erosion, mining exposes other *existing* finite strata, not simple clock refill |
| Harvestable woody biomass | Regrows only where a living tree/shrub persists and has water/nutrients/light | Tree health, age, biomass store, growth, harvest and death; cut tree does not regrow logs from the same point arbitrarily |
| Berries, roots, fiber | Seasonal harvest tied to species biomass and reproduction | Pollination or seed propagation, soil/climate/moisture, disturbance, grazing, uptake |
| Freshwater | Reservoir in liters (or volume-unit contract), runoff, inflow/outflow, rain and evaporation | Mass-conserving local catchment and subsurface/atmosphere exchange, or explicitly labelled simplified water budget |
| Animals | Individual for large fauna, counted cohorts for abundant small creatures | Birth/death/migration/predation/foraging; never respawn a deer from a static resource counter with no ancestry |

`Voxel-Survival/src/hydrology.rs` already has an **actual finite water** test kernel using cell quantities and an atmosphere reservoir. Transfer its conservation *invariant*, not its 3D liter-per-voxel implementation. `Hexel-Game-Engine` describes coupled weather/soil/biomass fields as an *exploratory* design. Build an 80×52 controlled environmental fixture before continent-scale climate work.

### A causal survival test

Choose one forest, one spring, one rock deposit on a small seed, and extract a known number of units; record sources, sinks, stored totals, biomass and time. With zero rainfall, water may drain or dry but must not refill from nothing; stone may not spontaneously reappear; mature trees can regenerate biomass only if biological prerequisites remain. Run with 1/60/240/3600× and compare total extraction, environmental state and death causes at identical simulated timestamps.

**Do not silently change these gameplay balances in a documentation PR.** Physical source conservation could make existing founders nonviable until navigation, direct drinking, containers and food stocks are redesigned together.

## 2. New concern: one simulated interval is not automatically equivalent to many smaller intervals

The current [Simulation.advance](../public/simulation.js) increments world time and invokes resource regrowth, arrival updates, body advancement, physical work, planning and scheduling **once per supplied elapsed interval**. [Biology.advance](../public/biology.js) explicitly caps its own `dt` at 360 simulated minutes while the simulation clock may move farther on a direct API call. [app.js](../public/app.js) normally runs fixed 50-ms steps, but headless callers and future coarse/offscreen schedules can supply different dt values. This creates a **partition-invariance question**, not yet an observed gameplay regression.

Simulated-age, inventory, weather, work-progress and world-stock outcomes must be compared for:
- advancing 360 minutes as 360 one-minute ticks;
- 36 ten-minute ticks;
- one 360-minute call;
- save/restore halfway;
- a 3600-minute catch-up call (if supported).

Not every system must be bitwise identical under variable step sizes; some approximations may be deliberate. What matters is a documented time-resolution contract, explicit max catch-up policy, and *no* conservation or mortality misaccounting.

**Recommendation:** Before any 'coarse NPC ticks' or offscreen ecology, define canonical event-time integration by subsystem: physics and timed work at short, fixed time slices, biology closed-form or bounded slices, weather/season changes at event boundaries, flora growth daily, culture/lineage monthly, atomic events ordered by deterministic `(clock, priority, actorId, commandId)`. A queue is useful only if it reduces work while retaining outcomes; don't introduce a general scheduler until measurement justifies it.

## 3. New opportunity: roads and settlement history can *emerge* physically

Current seed world has no preset town, roads or leader. Rather than introducing random roads to make maps interesting, build a persistent **footfall field** or trail material that changes *after actual NPC/animal travel*. The study [Simple agents – complex emergent path systems (2023)](https://journals.sagepub.com/doi/full/10.1177/23998083231184884) examines desire paths arising from repeated agent movement; a [2025 neighbourhood route-planning study](https://www.sciencedirect.com/science/article/pii/S0198971525000043) further examines perception, affordances and route choice.

### Suggested physical rules

```pseudo
onCompletedMovement(fromTile, toTile):
    for each valid traversed surface tile:
        tile.traffic += verifiedFootfall(bodyMass, surfaceKind)
        tile.vegetationCover -= boundedTrampling(soilMoisture, species)
onEcologyDay():
    tile.traffic = ageWithRainAndRegrowth(tile.traffic)
    if repeatedWearExceedsThreshold:
        tile.groundState = 'informal_path'   // not a built road
onExplicitRoadBuildingReceipt():
    consume labor + actual aggregate/wood/stone
    tile.groundState = 'constructed_path'
```

- **Informal paths** emerge from travel; deliberate roads require physical construction.
- Repeated crossings can compact ground or improve an established track, but flooding, regrowth and maintenance can reverse it.
- Trails can influence perceived route cost only when actor has actually seen or learned about them.
- Footpaths must not solve water crossings or collision magically and must not create faction/land ownership.
- NPC social interactions and trade can produce attraction centers, making travel a cause of settlement layout rather than a globally preplanned decorative result.

**Test:** equal agent/craft goals plus identical world under (a) footfall disabled (b) footfall material + unchanged navigation (c) footfall influences nav. Measure actual paths, costs, material wear and emergence near real destinations. Compare whether low transport friction reduces or increases cooperative work, rather than assuming all roads improve emergence.

## 4. New opportunity: causal offscreen ecology, not just chunked graphics

`public/simulation.js` currently advances **every resident**, irrespective of visibility. This must remain a core guarantee. Rendering chunk eviction should never remove biological or memory state. A wider world should separate three residency systems:

1. **Visual:** only nearby tile bitmaps, overlays, sprites and selected distant icons.
2. **Physical/agent:** active moving agents and local interactions with correct elapsed time; a nonresident region is still physically queryable by authoritative base+edits.
3. **Environmental update cadence:** rainfall/plant biomass/water can be aggregated by region only if conservation is provable and re-entry uses deterministic catch-up.

We cannot claim per-frame 100-NPC real-world scalability from a passing 5-NPC soak. First benchmark 5/25/100 actors at current world size with model-free logic, then deliberately measure 25×25, 256×256 and 1024×1024 worlds only after the generator state can represent them. At large sizes, world-global linear scans in `AgentWorld.available`, `WorldRuntime.pathfind/reachability`, `drawWorldObjects`, `Civilization.founders`, and `Perception.snapshot` must be indexed or region-bucketed. Avoid premature R-tree infrastructure; start with integer spatial buckets.

## 5. Long-horizon social/ecological rabbit holes

- **Migration and founder viability:** On a 4,160-tile torus, periodic newcomer arrivals with no births/deaths balancing policies are a demographic *input*, not an emergent population. What triggers migration? Is arrival pressure tied to observed scarcity, hospitality or access? If immigration stays externally scripted, identify it explicitly in the world history.
- **Age/lifespan:** `Civilization.updateHealth` has age-related decline after 80 but no childhood, reproductive life, genetics, or household continuity. This is okay for an early prototype, but ecological stability and intergenerational culture require food and reproduction constraints. Avoid importing CK3 genealogy logic before life-stage identity exists.
- **Ecology as information:** NPC knowledge of edible plants, seasons, animal trails, flooded crossings and safe freshwater should come from private observation/experience. Terrain systems are valuable only when they create perceivable, learnable and actionable differences.
- **Resource ownership and social conflict:** Once finite lots and transport exist, who is permitted to collect a shared pile? Distinguish physical possession, consented custody, social claims and enforceable ownership rules. Culture and law should emerge from histories of claims/disputes rather than get assigned at spawn.
- **Threat and fauna:** Animals can be simulated with lightweight sensory and need/drive policies, rather than 4B LLM agents. Predation and environmental threats should provide genuine cues for human NPCs; do not burn model calls on every wandering prey animal.

## 6. Validation and sequencing

**First next tests:** (1) variable-step partition equivalence, (2) resource-category regen/conservation audit, (3) no-LLM actor time and offscreen progression parity, (4) emerging desire path without minted infrastructure, (5) survival across multiple viable seeds **without starter possessions** after inventory redesign.

**What we should not do:** install large general ECS, try to simulate tectonic uplift per NPC tick, write a whole Rust engine port, add speculative 50-parameter personality model, or claim Earth-like biology. The high-confidence gain is an authoritative contract with tested boundaries, not system size.

## Implementation checkpoint — fractional regeneration persistence (2026-11-19)

Tracked in [#72](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/72) and [PR #78](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/78).

- **Implemented:** `AgentWorld.restoreWorld` restores a valid per-source fractional `regrow` accumulator instead of resetting the saved progress. Invalid or legacy missing values normalize to zero. Tests cover all existing source kinds and wood yield parity across a save/restore boundary.
- **Important observed regression during development:** an initial code attempt stopped stone regrowing immediately. The existing seven-day viability benchmark then reported **one founder dead of dehydration** (expected zero). The mineral change was **reverted**, not the benchmark; this proves that scarcity changes the existing agents' behavior and that resource-class conservation needs a coordinated survival/planning intervention.
- **Not implemented:** nonrenewable mineral classification, finite water mass cycles, tree species/biomass and soil budgets. Today's bounded stock refill remains a temporary gameplay rule, explicitly not long-term conservation.
- **Next gate:** separate diagnostic mortality traces for depleted minerals and new water-seeking policies, then rerun multi-seed survival before reintroducing a physical mineral budget. Keep #72 and #63 open.
