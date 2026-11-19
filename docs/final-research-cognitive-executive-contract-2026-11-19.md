# Final pre-code research III — NPC attention cues, intention commitment and selective LLM inference

**Reviewed:** 2026-11-19. **Status:** Proposed design/test contract, **not implemented**.  
**Code baseline:** `main` at `32318081588a805d51ac31e0f3e31c91f4291c11`.  
**Tracking:** [#73 actor-private decision validity](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/73), [#21 cognition epic](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/21).  
**Related:** [actor knowledge integration](actor-knowledge-integration-risk-2026-11-19.md), [autonomy benchmarks](agent-autonomy-benchmark-contract-2026-11-19.md).

## 1. What the additional research actually changes

This follow-up examined **current code**, not only the conceptual BDI literature.

- [Cataclysm: DDA `src/npcmove.cpp`](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/npcmove.cpp) currently demonstrates an unusually close match: its behavior tree evaluates goals each turn but **committed goals persist** until achieved or displaced by an explicitly higher-priority objective; it calls `should_interrupt` instead of blindly adopting a new top score. The source also checks need-specific completion predicates and resumes suspended tasks. **This is the strongest direct practical design reference found.**
- [Jason `Intention.java`](https://github.com/jason-lang/jason/blob/main/jason-interpreter/src/main/java/jason/asSemantics/Intention.java) records running/waiting/suspended states and explicit reasons; [BDI architectures survey](https://ijcai.org/proceedings/2020/684) discusses goal failure/recovery. We need a small commitment lifecycle, **not** an AgentSpeak runtime.
- [Fluid HTN Planner.cs](https://github.com/ptrefall/fluid-hierarchical-task-network/blob/master/Fluid-HTN/Planners/Planner.cs) uses a dirty-state signal and attempts to retain a previous partial plan when replacement fails. The analogous rule here: **new observation ≠ compulsory abandonment**.
- [Reliable Intention Selection in BDI Agents with Recovery Shields (2026)](https://journals.sagepub.com/doi/10.3233/FAIA251228) investigates suspending/recovering intentions when constraint violations occur. It validates the *kind* of problem, not a plug-in policy for Rein.
- [Event-triggered LLM invocation under uncertainty (2026 preprint)](https://arxiv.org/abs/2607.13048) explores risk-based triggers; it operates on streaming decisions, so its measured gains cannot be transplanted to game ecology or social choices.
- [Think Fast and Slow, ICML 2026](https://proceedings.mlr.press/v306/yang26cz.html) finds value in adaptive cognitive depth, using specialized training/policy design. **Our local Rein one-token action ranking is not a native free-form reflective planner.** Need actual model-specific validation before promising spontaneous aspirations.
- The user's [AI-RP-Program world epoch](https://github.com/sdhaight1-hash/AI-RP-Program/blob/main/world/epoch.mjs) provides a useful state-mutation revision idea, but global revision alone is too coarse for a multi-NPC simulation: unrelated changes would invalidate every response.

## 2. Present AI-NPC-COG seams

- `public/world-runtime.js:survival` already does deterministic emergency actions, preserving interrupted work. Keep this **below** model decision-making.
- `public/world-runtime.js:scheduleOffline` supports a cheap full activity routine when no model is available; even connected mode can fall back while model lane is busy.
- `public/agency.js:score` uses need utility and a small +22 bonus for the currently named goal. That creates *stickiness*, not an explicit long-term commitment with suspension reason, deadline, support evidence or completion predicate.
- `public/projects.js` supplies durable known-method construction/crafting graphs. It should remain the **physical decomposition owner**.
- `public/perception.js:snapshot` builds private vision/hearing/body packets and filters affordances; cue generation must consume this or personally verified evidence instead of an omniscient resource list.
- `public/evidence-memory.js` distinguishes receipt-backed personal facts from heard/unverified claims. A high-importance rumor may legitimately trigger investigation; it must not be treated as witnessed stock.
- `public/app.js:deliberate` currently holds one global `backgroundBusy` request and accepts a model result if the actor is alive, still on its original tile and the option was in the *old* menu. That does not prove the original goal/evidence/action is still relevant or currently executable; physical begin does recheck legality. The new contract must reject **stale strategic intent** before a goal change.
- `server.mjs` enforces **one local model inference lane**, limited background queue and two foreground waiters. Don't implement a new front-end queue that contradicts the server's priority/abort behavior. Coordinate cancellation and fairness at the world side; never freeze physics.

## 3. Deliberation decision: three tiers, one authority

| Tier | Trigger/source | Response owner | Inference? |
| --- | --- | --- | --- |
| A: Safety reflex | Own bodily dangerous thresholds, actual proximate threats | Existing `WorldRuntime.survival` plus physical executor; bounded interruption | **Never required** |
| B: Routine action/procedural repair | Current valid work, known recipe/subtask, transport of known lot, low-impact change | `Activities`, `Projects`, `WorldRuntime`, `Agency` | **Usually none** |
| C: Deliberative choice | Conflicting personal commitments, novel opportunity with personal stakes, serious trust conflict, voluntary social choice, reason to abandon an aspiration | Shared LLM produces **proposed intention** subject to verification | **Conditional** |

**Critical nuance:** Not every curiosity, boredom, rumor, emotional fluctuation or new tile is Tier C. Some meaningful experiences should produce only a memory/emotion change, no new action. Doing nothing is not necessarily failure.

## 4. Minimal persisted types (proposal, not implementation)

```ts
type Cue = {
  id:string; actorId:string;
  kind:'body'|'observation'|'receipt'|'claim'|'goal_conflict'|'goal_blocked';
  basisEvidenceIds:string[];   // all scoped to this actor
  targetId?:string; goalId?:string;
  firstAt:number; lastAt:number; expiresAt:number;
  urgency:0|1|2|3; dedupKey:string;
  status:'pending'|'routed'|'resolved'|'expired'
}
type Intention = {
  id:string; actorId:string; desiredPredicate:string;
  originCueIds:string[]; supportingEvidenceIds:string[];
  selectedAt:number; nextReviewAt:number;
  projectId?:string; revision:number;
  status:'committed'|'suspended'|'blocked'|'achieved'|'abandoned';
  statusReason?:string
}
type DecisionBasis = {
  actorId:string; requestedAt:number;
  actorRevision:number; intentionId?:string; intentionRevision:number;
  cueIds:string[]; evidenceIds:string[];
  legalOptionKeys:string[]; legalActionFingerprint:string
}
```

Start with **one active primary commitment** plus bounded candidates, not dozens of mutually competing goals. If useful, later support concurrent commitments explicitly. A candidate desire, a committed goal, a running physical project and a currently executing physical activity are different identities and must not overwrite one another.

## 5. Event and intention routing rules

```pseudo
eachAuthoritativeActorTick(actor):
    updateBodyAndLegalImmediateRisks(actor)    // simulation owns truth
    if criticalOwnBodyNeed(actor):
        interruptOnlyConflictingPhysicalActivity(actor, reason='BODY_SAFETY')
        performKnownSurvivalRoutine(actor)      // no LLM wait
        return

    new = deriveCues(
      actor.privatePerceptionChanges,
      actor.personalReceipts,
      actor.heardClaims,          // retains unverified status and speaker
      actor.intentionsBlockingEvidence,
      actor.ownBodyThresholdCrossings)
    inbox.coalesceDedupExpire(new)             // bounded; threshold crossings, not per-minute spam

    if existingCommitmentStillAchievable and
       not relevantHigherPriorityConflict and
       currentActivityStillLegal:
        keepAdvancingExistingWork()             // zero inference
        return

    if executableKnownMethodForCommittedGoal(actor):
        Projects.selectOrRepairLegalSubtasks()
        return

    if actionNeededFromCue and cueIsConsequential and
       modelBudgetAllowsActorReview:
        requestDeliberation(actorPrivateSnapshotAndCandidateGoals)
        // physics and other actors run while waiting
        return

    chooseSafeNonModelActionOrWait()

onInferenceResponse(response, savedDecisionBasis):
    if actorMissingOrDeadOrPaused: reject
    if intentionRevisionChanged or triggeringCueResolved: reject
    if groundingEvidenceInvalidated: reject
    legalNow = WorldRuntime.available(state, actor)
    if proposedActionOrGoalIncompatibleWithLegalNow: reject
    if requiresOtherActorConsentWithoutAcceptance: reject
    acceptValidatedIntentionAndRecordDecisionReason()
    // World effects still require normal Activities/Reservations/WorldReceipts
```

A global `effectRevision` bump from an unrelated distant person's foraging must **not** reject a socially meaningful action. Use **relevant** actor and target revisions; recompute current physical legality at commit regardless.

### Necessary anti-thrashing behavior

- Hysteresis: a competing goal must exceed the current one by a meaningful margin, unless critical safety.
- Review after meaningful events, not all ticks. Review interval is a *maximum deferral* for persistent blocked goals, not a mandatory full model call every hour.
- Cues expire when evidence invalidates them or their target disappears; record reason.
- Critical threats may suspend a goal but do not erase its value. Once safe, resume work if legal.
- Repeated failed approaches invoke known-method repair before re-prompting with identical context.
- Fairness: at most one active model request world-wide, bounded per-actor cooldown, record who received and was denied deliberation; prevent a single emotional/social NPC from monopolizing the lane.

## 6. Coupling to traits, social preferences and emotions

**Traits are slow, needs are continuously felt, emotions are bounded appraisals, relationships are actor-specific, intentions are commitments.** Do not create one giant utility scalar that makes every person socialize at 80 loneliness.

Minimal test-friendly illustration:
- `socialApproach` (probability of seeking interaction), `solitudePreference` (positive restorative solitude demand) and `socialFatigue` (current overload) are separate. These are game-defined dimensions, not clinical personality scores.
- `persistence` influences optional abandonment margin, **not** the ability to violate dehydration emergencies.
- `riskCaution` influences voluntary uncertain choices, never overrides collision or material availability.
- Individual evidence of reliable cooperation may affect subjective trust and future support intentions without changing anyone else's private feelings.
- Emotional appraisal may change cue *salience* or memory importance, but must not directly mint factual receipts or mutate the world.

First run code-only trait counterfactual fixtures, then add LLM deliberation. If trait differences cannot change actual action distributions without a language model, the model architecture is not yet sufficiently explicit.

## 7. Required counterfactuals and measurements

| Fixture | Expected causal difference |
| --- | --- |
| Critical thirst during multi-stage craft + 30-second model delay | Work paused; body survival executes; model cannot overwrite immediate safety; work resumes if possible |
| Same resource rumor known only to NPC A | A may investigate; B without firsthand or heard evidence does not know or receive cue |
| Repeated observation of identical nearby tree | At most one pending perceptual cue until meaningful change; no unbounded model calls |
| Failed water source, known other reachable source | Known-method repair uses history, not repeated pointless 4B deliberation |
| NPC personally values woodcraft, another does not | One may adopt workshop ambition; physical opportunities/traits held otherwise comparable |
| Two commitments conflict | Explicit suspended/abandoned reason; no vanishing materials/forgotten promises |
| Goal near completion, minor novelty cue | Current work persists; model not automatically invoked |
| Target source depleted while model is pending | Stale goal review rejected or repaired; no false successful activity |
| Independent NPCs wait for shared lane | Model requests/cue backlogs bounded and fair, physiology progresses for all |
| No model installed | All bodies continue, known work completes, safety still operates, NPCs don't invent conversation |

**Measurements:** accepted vs rejected decisions, dangerous cue miss count, model-call and token budgets, wall time p95, number of goal predicates actually satisfied, critical-body response latency in simulated minutes, interruptions/resumptions, learned belief impact, social consent events, state/replay hashes. Measure connected Rein action ranking and richer Hivemind **separately**; do not describe a ten-letter scoring model as an unrestricted strategic planner.

## 8. Implementation order and deliberate omissions

1. **First #73 isolated tests:** new resource reservation, death, water depletion, goal-cue revision during a mocked slow model request; unchanged browser behavior expected before new contract.
2. Introduce actor-scoped revision/evidence checks and bounded cue metrics without replacing `WorldRuntime` or `server.mjs`.
3. Add one simple durable commitment lifecycle attached to `Projects` and `Activities`, then save/replay before introducing open-ended LLM proposals.
4. Introduce minimal persisted social/solitude traits that create detectable behavior changes in model-free tests.
5. Only then experiment with structured strategic prompting on the actual local 4B backend and tune per-actor attention budget.

**Do not:** add a POMDP solver, a second action executor, 60 personality dimensions, a global city director, mandatory per-minute inferencing, broad Rust rewrite, or autonomous code execution.

**Decision frozen for coding:** world and bodily safety continue without LLM; deliberation gates proposed intentions, not world effects; all cues are actor-private and provenance-scoped; existing implementation remains the foundation.

## Implementation checkpoint — PR #77 (2026-11-19)

- **Changed:** `public/app.js:deliberate` now binds a model request to the current actor's action/plan/project, personal intention identity, private evidence count, personal inventory, urgency bands and perceived affordance targets. Responses are accepted only if still in the **current** actor-private legal option menu and the original target remains relevant.
- **Negative control:** a distant resident's inventory mutation or a global `effectRevision` increment does not by itself reject another NPC's decision. The authoritative `WorldRuntime.begin` still validates physical action feasibility.
- **Added test:** three delayed-response fixtures in `tests/client.test.mjs` cover depleted source target, new critical thirst while model pending, and irrelevant distant mutations.
- **Not implemented:** a persisted cue inbox, actor-wide preference/trait model, long-horizon intention-governance state machine or a different Rein planning protocol. Those remain separate #73 / G5 research gates.
- **Validation:** see [PR #77](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/77) for tested state and merge status.

## Implementation checkpoint — G5.2 first social-trait slice (2026-11-19)

[Issue #81](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/81) and [PR #82](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/82) add a deliberately small model-free distinction:

- A person is created with stable seeded `traits.socialApproach` and `traits.solitudePreference` on [0,1], independently of adjective prose. V3 saves retain validated overrides; old/malformed trait saves use seed-derived defaults, preserving independent individual identities.
- `AgentWorld.stepNeeds` varies only the rate of `needs.social` accumulation based on those two personal traits. A strongly solitary person accumulates unmet contact desire slowly but is **never mathematically unable** to form an attachment or seek help. Bodily food/water/energy survival and other world authority remain unchanged.
- A counterfactual headless test starts two NPC clones with identical physical and social states except their trait vectors and verifies divergent social pressure after equal simulated minutes, and independently asserts hydration is identical.
- **Still research/planned**: explicit social fatigue, valuable particular relationships, learning preferences, affection/attachment, experience-driven temperament changes, sustained goal commitments, a cue inbox, and fully autonomous social decision/governance. The numeric traits are gameplay parameters, not validated clinical psychology.

## Implementation checkpoint — evidence-triggered model reviews (#73)

An idle connected resident may request a first review, then request another
when their own inspection finds a source or crosses the available/depleted
boundary, they discover a method, or they hear a distinct resource report
with no firsthand evidence. A repeated observation at the same availability
and repeat reports about the same source create no new request. A review
considers up to eight recent cues drawn from private evidence. Cues expire
after 180 simulated minutes. The review watermark and the 30-minute
per-resident request cooldown survive v3 save and restore.

Routine decisions continue through Agency and the shared action executor.
Known projects and body reflexes retain priority. The model still selects a
validated action from an actor-private menu. A delayed response loses
authorization if its cue or existing decision basis expires or changes.
Long-horizon commitment conflicts and strategic proposals remain separate
work under this contract.
