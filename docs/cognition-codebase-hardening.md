# Codebase-grounded architecture hardening — 2026-11-18

**Status:** Design only, no runtime implementation. **Baseline:** `main` inspected 2026-11-18; tree SHA `980994b1467af864088dde8171cabce9f7e8b9ec`. **Epic:** [#21](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/21). [Implementation gates](cognition-implementation-roadmap.md) and [research audit](cognition-research-audit-2026.md).

## 1. Observed system, not aspirational system

| Actual code | Verified behavior | Architectural limitation / migration seam |
| --- | --- | --- |
| [`public/app.js`](../public/app.js) `step`, `scheduleIdleAgents`, `deliberate` | Browser clock advances world, arrivals, movement, needs, death, activity completion, plans and asynchronous inference | Sim uses `performance.now`, DOM/render context, HTTP and `localStorage`; headless deterministic replay is unavailable as an extracted boundary |
| [`public/app.js`](../public/app.js) `sceneFor`, `backgroundOptions` | NPC context includes own physiology/agency, recent recollection and nearby world nodes/people; utility-ranked action options | Raw global `state.world.nodes` filtered by distance is **not** line-of-sight/hearing/knowledge isolation; legality and visibility are conflated |
| [`public/app.js`](../public/app.js) `setAction`, `completeActivity`, `advancePlan` | Timed task scheduling, physical completion, some interruption and failure accounting | No universal validated resumable activity object; `readyAt` is a completion deadline, not recoverable elapsed work |
| [`public/emergence.js`](../public/emergence.js) `available`, `complete`, `nextPlanAction` | World-level option generation, action-specific mutations and finite supply/shelter/campfire project rules | Fixed goal switches, no dependency graph or cause-coded repair; `complete` mutates directly with free-form text result |
| [`public/crafting.js`](../public/crafting.js) `begin`, `advance`, `interact`, `restore` | Material-consuming workpiece stages, authored recipes, quality and persistence | Stage-level completion only; no partial stage progress, global reservation ledger, atomic receipt or shared task protocol |
| [`public/agency.js`](../public/agency.js) `drives`, `score`, `observe`, `outcome` | Personality and needs score action options; observations maintain bounded, revisable personal beliefs | Belief evidence lacks provenance IDs; `observe` looks up authoritative object on successful action; goal progress increments per successful subaction rather than predicate |
| [`public/cognition.js`](../public/cognition.js) `record`, `recall`, `restore` | Up to 160 episodes, overlap-based retrieval, recent failure penalty, survival instincts | No separate working/semantic/procedural/social stores; no immutable observation citations; memory quality not yet benchmarked behaviorally |
| [`public/biology.js`](../public/biology.js), [`public/civilization.js`](../public/civilization.js) | Deterministic nutritional/physiological proxies and health/death consequences | Must be advanced exactly once by future runtime; death must also release claims/reservations |
| [`public/app.js`](../public/app.js) `save`, `restore` | Browser `localStorage` save v3 with guarded restore of NPCs, tasks, memories, crafting and plans | New schemas need migration, checkpoint sequencing and equivalence against uninterrupted run |
| [`server.mjs`](../server.mjs) | Separate local model proxy | Model output must remain an intention proposal; external response order/latency must not affect deterministic simulation clock |

**Do not claim:** current memory is BM25, current planner is an HTN/GOAP general solver, current perception obeys occlusion, current work is mid-stage resumable, or existing CI establishes deterministic long-horizon execution.

## 2. Contracts, ownership and minimal module seams

Authoritative world runtime owns `WorldState`, tick, command validation, resource mutation, physiology and immutable effect receipts. NPC-specific cognition owns `Observation`, `Evidence`, `Belief`, `Goal`, `Plan`, and model-facing context derived *only* from actor-visible facts. Renderer owns projections and controls. Model adapter owns HTTP and decoding. Policy/scoring is pure and calls no model.

Prefer moving existing functions over rewriting them, **one seam at a time**:
- `Simulation.advance(world, dt, injectedCommands)` — extracted orchestration of `app.step`, world regeneration, arrivals, motion, needs, death and completions.
- `Affordances.legal(actor, world)` — server-authoritative **executability**, derived from `AgentWorld.available` but evaluated again on commitment; not itself model-visible.
- `Perception.observe(world, actor, event)` — bounded knowledge gate; produces observation IDs, never raw omniscience.
- `ActivityExecutor` — shared lifecycle adapter; existing `Crafting.begin/advance` remain initial effect kernels.
- `Planner.advance(actor, knowledge, receipts)` — choose a legal next prerequisite using learned methods, bounded resources and interruptions.
- `NarrativeContext.forActor(actor, observations, retrievedEvidence)` — replaces direct `sceneFor` world scans.
- `InferenceAdapter` — asynchronous deliberation with explicit snapshot revision, budget, timeout and stale-response discard.

### Authority types

```text
WorldFact     {entity_id, component, value, world_revision} // INTERNAL ONLY
Observation   {id, actor_id, sense, event_id?, entity_id?, observed_at,
               position, payload, visibility_quality, evidence_kind:"firsthand"}
ReportedClaim {id, speaker_id, hearer_id, speech_event_id, proposition,
               heard_at, evidence_kind:"reported"} // not first-hand truth
Belief        {id, owner_id, proposition, confidence, support_ids[],
               contradict_ids[], updated_at, source_kind}
Goal          {id, owner_id, predicate, priority, deadline?, state,
               committed_at, reason, evidence_ids[]}
PlanNode      {id, goal_id, method_id, prereq_ids[], requires[], produces[],
               activity_id?, state, blocked_reason?, attempts}
Activity      {id, actor_id, kind, target_id?, state, work_done, work_required,
               workpiece_id?, reservation_ids[], started_at, last_tick,
               interrupt_reason?, revision}
Receipt       {id, sequence, tick, actor_id, command_id, activity_id?,
               status, rejection_code?, consumed[], produced[],
               before_revision, after_revision, events[]}
```

No response or memory is allowed to contain a `WorldFact` merely because one exists. Immutable receipts cite real world transitions; model-produced text is never a receipt.

## 3. Deterministic world loop

```pseudo
advance(world, fixedDelta, acceptedCommands):
    assert fixedDelta == SIM_TICK
    for command in stableSort(acceptedCommands, by=(submittedTick, actorId, commandId)):
        if dedupLedger.contains(command.id): emit existing result; continue
        validateCommandAgainstCurrentWorld(command)
        registerIntentOrRejection(command)   // no effect from prose
    advanceWeatherAndEcologyOnce(world)
    advanceArrivalsOnce(world)
    for actor in sortByStableId(world.livingActors):
        advanceMovementAndActivities(actor, world, fixedDelta)
        advancePhysiologyOnce(actor, fixedDelta)
        resolveInjuryAndDeathAndReleaseClaims(actor)
    for effect in committedEffects:
        atomicValidateAndApply(effect)
        appendMonotonicReceipt(effect)
    for actor in sortedLivingActors:
        derivePerceptionsOnlyFromAccessibleWorldEvents(actor)
        updatePrivateEvidenceAndGoalPredicates(actor)
        runInstinctOrRoutineIfDue(actor) // no LLM required
    return immutableSnapshot, receipts, modelDecisionRequests
```

**Ordering to decide and lock in tests before extraction:** existing `app.step` moves, then needs, then health/death, then completes actions, then schedules agents. Exact compatibility must be measured; altering order can cause an agent to finish work after death, consume newly regenerated stock differently or skip a deadline. Prefer current order until a versioned semantics change is explicitly authorized. Run fixed one-minute steps; accelerated simulation executes N one-minute steps rather than a single enlarged `dt`. Clock, PRNG state and command schedule must be serialized. Never use `Math.random`, `Date.now`, wall-clock request completion order or DOM values in authority.

## 4. Activity state machine and atomic conservation

```pseudo
start(command):
    require actor alive, target reachable, method learned, prerequisites valid
    require unique commandId and activityId
    reserve exact material LOT IDs + quantities (if multi-actor competition possible)
    create Activity(state=RUNNING, work_done=0); receipt(STARTED)

tick(activity, delta):
    if precondition lost: interrupt(activity, REASON); return
    if actor criticalNeed: interrupt(activity, PREEMPTED); return
    consume bounded energy/elapsed time
    activity.work_done += delta * effectiveness
    if activity.work_done >= activity.work_required:
        finishExactlyOnce(activity)

finishExactlyOnce(activity):
    validate current target, reservation tokens and remaining prerequisites
    transaction:
        consume reserved lots once
        apply effect once using authoritative recipe/action kernel
        release excess reservations
        mark COMPLETED and append receipt with exact deltas
    reject retries with same activityId and commandId

cancel(activity):
    if terminal: return prior outcome
    release unconsumed reservations; preserve physical workpiece consumed inputs
    mark CANCELLED; record why; never mint input refunds or finished output
```

Stage-progress migration: `Crafting.begin` currently **consumes ingredients immediately** and `Crafting.advance` changes stage only at deadline. Preserve that rule for legacy workpieces. A new general executor may reserve inputs before start, then transfer consumed ingredients to the durable physical workpiece on actual commit; `Crafting.begin` must not additionally consume the same inputs. Do not implement two competing consumption authorities.

**Invariants:** at most one authoritative owner per fungible material lot; `inventory + containers + ground + reserved-but-unconsumed + workpieces` conserves items apart from explicitly recorded harvest/production/consumption sinks and sources; idempotent retry; nonnegative quantities; no completion before work budget; death and save/load never leak claims. For resources generated by natural regrowth, record the explicit source event rather than pretending raw global conservation.

## 5. Perception and private knowledge

```pseudo
observe(actor, worldEvent):
    candidate = senseEnvelope(actor, worldEvent)
    if candidate.visual:
        require sameVisibleZ and lightAboveThreshold and inVisionRadius
        require raycastUnoccluded(world.tiles, actor.pos, event.pos)
    if candidate.auditory:
        require reachableAcousticVolume(event, distance, blockers) >= hearingThreshold
        payload = stripUnseenAppearanceAndUnidentifiedSpeaker(payload)
    if candidate.tactile:
        require touchingOrInspecting(actor, event.target)
    return immutableObservation(actor.id, limitedPayload, provenance)
```

Separate physical affordance from perceived candidate. Existing `AgentWorld.available` scans real sources with spatial/reachability checks and `app.sceneFor` directly reads `world.nodes`. Until a new gate exists, don't claim belief privacy beyond the existing per-NPC memory container. `Agency.observe` currently does an authoritative `objectById` lookup following success; revise it to consume a signed/typed private observation, not re-query world state for knowledge.

Information-flow tests: opaque wall, darkness, unseen resource depletion, quiet versus loud events, false verbal claims, two NPCs with different experiences, prompt leak inspection. An inspection action can reveal previously unknown facts **after** reach/visibility verification; a near-but-unseen node does not become known just because the legal action engine can find it.

## 6. Memory, epistemic revision and decision continuity

```pseudo
onObservation(obs):
    episode = appendImmutableEpisode(obs.id, obs.actor_id, ...)
    updateBeliefUsingEvidence(owner=obs.actor_id, source=FIRSTHAND)
onSpeechHeard(message):
    appendEpisode(message.id)
    updateBeliefUsingEvidence(source=REPORTED, speakerId, lowerInitialConfidence)
recall(actor, goal, budget):
    candidates = actor.privateIndex.entityAndLexicalMatch(goal)
    rank = lexicalRelevance + evidenceReliability + taskUtility
           + boundedRecency + salience - contradictionPenalty
    return sourceLinkedDiverseTopKWithinTokenBudget(candidates)
consolidate(actor):
    summarizeSupportedEpisodesWithEvidenceIds()
    label generalized conclusions INFERRED
    retain contradictions, key commitments and autobiographical milestones
    prune only with policy; never erase provenance for still-live beliefs
```

Incremental migration from `Cognition.record/recall`'s 160 text memories and `Agency.state().beliefs`'s 80 entries: assign stable IDs and `legacy_unverified` provenance; **do not retroactively label historical free text as firsthand physical proof**. Starting retrieval can be simple indexed tokens/BM25; a vector database is not necessary. Evaluate retrieval by its effect on *world actions*, not by answer aesthetics.

Goal truth is a predicate, not `a.goal.progress++`. Current `Agency.outcome` increments progress on any successful subaction. Replace with separate `workStepsCompleted` telemetry and world-checked `predicateSatisfied` status.

## 7. Hierarchical projects, bounded decisions and fallback

```pseudo
chooseGoal(actor):
    candidates = deriveGoals(needs, personality, contracts, evidence, ongoingProjects)
    prefer critically needed safety and already committed viable goals
    score bounded utility; record rationale
    maintain old goal unless completed, impossible, emergency or justified switch

advanceProject(actor, goal):
    if authoritativePredicate(goal): mark COMPLETE; return
    node = firstRunnableNode(topologicallySortedDependencies(goal))
    if missing material: create known acquire/haul/reserve subtask
    if missing learned method: create investigate/learn request (not pretend recipe)
    if danger: SUSPEND preserving progress
    if blocked: mark precise reason, attempt bounded local repair
    if retries exceed budget: escalate deliberation or abandon with receipt
    else dispatch one legal physical activity and await receipt

requestModelDeliberation(actor):
    only at meaningful novelty/conflict/repeated block/social ambiguity
    pass per-actor observation + provenance-linked recall + legal actions
    include snapshotRevision, action IDs, deadline, budget
    on response: reject expired/stale/unlisted choice; deterministic fallback
```

Use `AgentWorld.nextPlanAction` as the first known-method adapter, not as the generic target. Support 10+ physical-step shelter, workbench and storage paths, interruption by thirst, replacement of lost tool, and two-agent finite-material competition before richer ambitions. Avoid recursive unbounded replanning, invented resources, LLM-per-step execution or a full GOAP framework before benchmarks warrant one.

## 8. Failure taxonomy, observability, storage and gates

Every failed command must distinguish `UNAVAILABLE`, `OUT_OF_REACH`, `OCCLUDED`, `MISSING_INPUT`, `UNLEARNED_METHOD`, `TARGET_CHANGED`, `RESERVATION_CONFLICT`, `INSUFFICIENT_ENERGY`, `ACTOR_DEAD`, `INTERRUPTED`, `STALE_MODEL_RESPONSE`, `MODEL_UNAVAILABLE`, `INVALID_COMMAND`, `DUPLICATE_COMMAND`. These statuses are not synonyms for `none`.

Trace funnel: observed evidence → proposed goal → model/utility decision → accepted intention → activity started → progressed → completed/blocked/abandoned → world deltas → predicate achieved. Record game ticks, queue sizes, model calls, latencies, stale rejection rates, per-actor no-op rates, and normalized outcome events. Replay stores deterministic commands and responses, **not** raw LLM calls as an authority.

For save v3 migration, keep legacy read compatibility while writing a separately versioned runtime schema. Serialize command sequence, RNG state, claims, stage progress, durable goals and knowledge IDs. Test restore from real v3 fixtures and compare continuous-vs-resume world hashes.

### Gate order

1. Baseline reproducibility and side-effect-free extracted `advance` (#22)
2. Immutable world receipts and observable action funnel (#23)
3. Seeded goal benchmarks and 30-day soak (#24)
4. Resumable activities with proven idempotency (#25)
5. Reservation/hauling ownership (#26)
6. Bounded durable dependency goals (#27)
7. Sensory gates and private observations (#28)
8. Typed memory and evidence-linked retrieval (#29)
9. Social contracts, animal ecology, lineage/institutions **only after** earlier gates; create scoped follow-on tickets before implementation

Some seams should be prototyped before dependency order is complete, but no claim of shipped cognitive behavior without a world-state benchmark. CI currently tests Node and Windows installer scripts; it is not evidence of actual Windows GPU/gameplay validation.

## 9. Explicit unresolved design decisions (must resolve before code)

1. **Fixed tick/time acceleration:** choose deterministic 1-minute engine step, while preserving current gameplay durations; validate before redefining timing.
2. **Identity and quantity:** whether existing aggregate `inventory` counts remain a compatibility projection over canonical item lots; recommendation: yes, in incremental migration.
3. **Perception fairness:** gameplay may allow instinctive orientation toward an unknown reachable resource; decide whether that constitutes a detectable sensory cue or whether agent must explore first. Recommendation: no hidden omniscient targeting.
4. **Crafting stage commit point:** adopt atomic reservations and workpiece transfer without double-consumption while preserving legacy saves.
5. **Trust:** source-sensitive confidence and actual dialogue exchange, not single global `n.trust` as factual epistemic authority.
6. **Dead-agent cleanup:** cancel tasks, release claims and invitations before removing NPC from world.
7. **Determinism of model mode:** deterministic replay uses captured accepted model responses; live inference itself is nondeterministic and must never be described as replay-deterministic.

Architecture review can change these decisions without runtime churn. No production code changes are authorized by this document.
