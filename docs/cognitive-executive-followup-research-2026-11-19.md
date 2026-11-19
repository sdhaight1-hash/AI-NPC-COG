# Follow-up investigation: cognitive routing, personality, intentions and physical logistics

**Date:** 2026-11-19. **Status:** Researched design recommendations and hypotheses, **not implemented**.  
**Companion baseline:** [Embodied cognition research agenda](embodied-cognition-research-agenda-2026-11-19.md), [prior cross-project audit](cognition-research-audit-2026.md), [codebase hardening](cognition-codebase-hardening.md).  
**Code baseline:** `main` at `0c99315090a928b3ffb42d1ee45181cdf98f9085`. No runtime files modified in this research pass.

## 1. Verified external evidence and appropriate conclusions

| Evidence | What was checked | Relevant conclusion | What **not** to infer |
| --- | --- | --- | --- |
| [CogRouter: Think Fast and Slow (ICML 2026)](https://proceedings.mlr.press/v306/yang26cz.html) | Published abstract: four levels of cognitive depth, trained routing, evaluated in ALFWorld/ScienceWorld | Variable deliberation depth can improve performance/efficiency; investigate *selective* LLM escalation | It is **not** a ready-made scheduler that can be copied into a 4B Rein deployment; results depend on training and tested tasks |
| [NCP-Bench: Can LLM Agents Stick to the Script? (ICML 2026)](https://proceedings.mlr.press/v306/ma26ap.html) | 100 formal narrative scenarios with commitments; the best reported model passed only 42% after 20 turns in reported evaluation | Store commitments as durable, mechanically checked structures; language fluency does not establish persistence | Narrative storytelling scores do not directly predict AI-NPC-COG survival outcomes |
| [Dynamic Persona Coherence (ACL 2026)](https://aclanthology.org/2026.acl-long.1336/) | Long-term stable identity vs intermediate meaning/stress vs short-term affect, tested on larger cloud models | Separate immutable/slow-changing traits from mutable affect and life-history interpretation | Its quantitative gains do **not** validate our local Rein/Hivemind or proposed trait weights |
| [Exploiting GenAI for Plan Generation in BDI Agents (2026)](https://journals.sagepub.com/doi/10.3233/FAIA251223) | Plan-generation discussion explicitly warns LLM latency can block an agent and suggests suspending *only* the triggering intention | Keep the physical/survival loop running while a specific deliberation waits; allow unrelated tasks and other NPCs to continue | Generated plans still require action validation; the paper is not evidence of a ready-made full simulator |
| [Uncertainty-Aware Sequential Decision Rules for Event-Triggered LLM Invocation (2026 preprint)](https://arxiv.org/abs/2607.13048) | Trigger rules based on risk/uncertainty; empirical tests on maintenance and anomaly/sensor data | Compare fixed-period, threshold-crossing and event-risk triggers; measure decision quality per model call and missed critical events | Sensor anomaly settings do not establish calibration for social/goal cues; begin with a simple deterministic router rather than its complex theory |
| [An appraisal-based chain-of-emotion architecture for affective language model game agents (PLOS ONE 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11086867/) | Appraisal-oriented game agent architecture and believability-oriented evaluation | Event appraisal is more meaningful than decorating dialogue with random mood words; emotion should affect priorities, attention and memory | No research justifies giving LLM prose authority to set arbitrary permanent emotion/health values |
| [Multifaceted introversion and solitude behavior (2024/2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11705506/) and [need satisfaction in solitude (2024)](https://pubmed.ncbi.nlm.nih.gov/38801220/) | Introversion facets predict different solitude patterns; autonomy/competence during solitude relate to well-being | Social contact drive, relationship satisfaction, social fatigue and desire for solitude are **distinct** | Extraversion is not a binary `loner` label and low socializing is not necessarily pathology |
| [Dwarf Fortress personality needs/facets](https://dwarffortresswiki.org/index.php/Personality_need) | Public game-mechanics documentation: need weights relate to personality facets, separate from broad mood | Use personalized need strengths/setpoints; allow activities that satisfy individual motivations | Community wiki mechanics may vary by version; do not import game balance numbers |
| [Cataclysm: DDA pocket/item rules](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md) | Distinct container mass/volume/length restrictions and filling-dependent encumbrance | Inventory must distinguish item mass, bulk, container suitability, and load effects | Full CDDA pocket taxonomy is more complexity than our first vertical slice requires |

Research interpretation: **Do not build a new giant all-purpose cognition framework.** Adopt measurable, minimal seams around existing deterministic kernels, make uncertainty and actor-visible evidence explicit, and reserve language deliberation for actual choices.

## 2. Source-code inspection of working repositories (not merely readmes)

| Project / exact inspected file | Confirmed mechanism | Narrow takeaway |
| --- | --- | --- |
| [AIvilization Town / actionSynthesisPolicy.ts](https://github.com/EnglandLobster/aivilization-town/blob/main/apps/worker/src/actionSynthesisPolicy.ts) | A policy derives available action time, energy, satiety, currency and inventory budgets from world state **after reserves** | Add *available physical budgets* and valid action costs before exposing intentions to the model; our mass/volume inventory must still be an authority check |
| [AIvilization Town / canonicalActivePlanTick.ts](https://github.com/EnglandLobster/aivilization-town/blob/main/apps/worker/src/canonicalActivePlanTick.ts) | Separates daily-plan renewal, active-objective renewal, world tick, plan-agent construction, and finished-goal completion | Distinguish objective renewal cadence from minute-by-minute work; do not copy the heavy worker infrastructure |
| [AI Town / convex/aiTown/agent.ts](https://github.com/a16z-infra/ai-town/blob/main/convex/aiTown/agent.ts) | Pending async operation timeout, activity vs conversation state machine, invite and message cooldowns | Model unavailability and social pacing explicitly; preserve timeouts, voluntary participation and conversation concurrency rules |
| [Bigville / domains/lazy_perception.py](https://github.com/ozmalabs/bigville/blob/main/domains/lazy_perception.py) | LLM's lazy view replaces omniscient people/things/hearing fields with perceiver-limited view; referee truth remains separate | Action cues and prompt context must be derived from `Perception` + verified actor-local evidence, never world globals |
| [Westworld / cognition/goalgraph/goalgraph.go](https://github.com/gen0cide/westworld/blob/main/cognition/goalgraph/goalgraph.go) | Intentions in typed goal graph with prerequisites and purpose links; source explicitly notes it is lightweight **memory, not a planner solved each tick** | Keep aspiration/goal provenance and blocked reasons durable, while existing `Projects` owns physical decomposition |
| [Miniverse / miniverse/cognition/runtime.py](https://github.com/miniverse-ai/miniverse/blob/main/miniverse/cognition/runtime.py) | Optional planner, reflection, scratchpad; required executor; default is deterministic rule-based execution | Existing `WorldRuntime` remains required and fully viable without language inference |
| [Cataclysm: DDA / doc/PLAYER_ACTIVITY.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/PLAYER_ACTIVITY.md) | Long actions have `start`/`do_turn`/`finish`, interruption and resume properties, serialized work state, optional auto-needs | Extend existing `Activities`; never reinvent physical activity scheduling inside a model prompt |

Some projects may be unfinished/prototypes. **Code was inspected for these narrow mechanisms**, not independently benchmarked or run on the user's machine. The [previous research audit](cognition-research-audit-2026.md) already includes additional surveys of Stanford Generative Agents and other projects.

## 3. Architecture decision: one cue router, not a second simulation

### 3.1 Authority boundary

```text
WorldRuntime/Simulation/Biology/Construction/Crafting      (authoritative physical truth)
       -> actor-private Perception observations and WorldReceipts
       -> body/needs/traits/emotion appraisal               (code, per actor)
       -> CognitiveCue queue and escalation router         (code, per actor)
             A. mandatory danger reflex                    (no model)
             B. continue/resume known valid action         (no model)
             C. known-method project repair                (no model)
             D. personal strategic/social conflict         (LLM when budget permits)
       -> bounded validated decision / unchanged action executor
       -> authoritative physical receipt + private evidence/goal updates
```

**Do not create a cue about a depleted water source for a character who never perceived depletion.** World events may directly protect the actor's own body via physiology; nonbodily outside events must pass sensory/evidence boundaries.

### 3.2 Proposed minimal typed state

```ts
type Cue = {
  id: string; actorId: string; kind: string;
  observationId?: string; receiptId?: string; // actor-visible supporting evidence
  goalId?: string; targetId?: string;
  firstAt: number; lastAt: number; expiresAt: number;
  urgency: 'critical'|'routine'|'deliberative';
  dedupKey: string; count: number;  // coalesced repeat observations
  status: 'pending'|'routed'|'resolved'|'expired';
};
type CognitiveIntent = {
  id: string; actorId: string; goalId?: string;
  actionKey: string; targetId?: string; sourceCueIds: string[];
  modelSnapshotRevision?: number; submittedAt: number; validityUntil: number;
};
type StableTraits = {
  version: 1; openness: number; persistence: number;
  socialApproach: number; solitudePreference: number;
  caution: number; emotionalReactivity: number;
}; // illustrative bounded normalized values, NOT clinical psychology
type MutableMotivation = {
  socialSatiation: number; desiredContact: number; socialFatigue: number;
  autonomySatisfaction: number; competenceSatisfaction: number;
}; // candidate dimensions: only implement those whose gameplay effects can be tested
```

**Keep the first implementation smaller than this full wishlist.** E.g., introduce five or six persisted trait dimensions and two independent social drives; do not add fifty behavior knobs without measurable effects. Stable traits are seeded and saved. Learned preferences, beliefs and relationship-specific feelings are separate and should change only from grounded experiences.

### 3.3 Cue routing and preemption (proposed pseudocode)

```pseudo
onActorStep(state, actor):
    advanceBodyOnce(actor)                           // existing Biology/AgentWorld
    observed = Perception.actorVisibleChanges(actor) // never global unseen facts
    cues = coalesceThresholdCrossingsAndEvents(actor, observed, personalNeeds(actor))
    expireAndDeduplicate(actor.cues, state.clock)

    if imminentPhysicalDanger(actor):
        Activities.interrupt(actor, "CRITICAL_NEED")
        routeToLegalImmediateSurvival(actor)          // no LLM, preserve work and holds
        return

    if actor.currentActivity is valid and cueImpactBelowPreemptMargin(cues):
        continueWork()                                // no model; hysteresis prevents thrash
        return

    if actor.project and knownLegalNextStepExists(actor):
        dispatchOrResumeViaWorldRuntime()             // no model
        return

    if importantUnresolvedConflictingCue(cues) and inferenceQuotaAvailable(actor):
        scheduleDeliberation(actor.id, evidenceScopedContext, cueIds, stateRevision)
        // never block physics/survival while model works
        return

    useBoringButSafeFallback()                         // bounded routine; no invented speech

onModelResponse(reply):
    rejectIfDeadOrOutdatedOrCueExpiredOrActionIllegal(reply)
    applyOnlyValidatedIntention(reply)                  // NOT world effects
```

Invariants: same actor/observation does not generate repeated urgent model calls; fairness across NPCs under shared 4B lane; high-priority body danger never waits for LLM; model timeout never stops the clock; saved intentions survive load; stale responses cannot override newer safety decisions. Use one authoritative physical executor, not separate browser vs headless cue logic.

## 4. Identity, emotion and social differentiation

**What is wrong today:** `Civilization.person` picks two adjectives and `Agency.personalityBias` regex-matches them. `AgentWorld.stepNeeds` grows `n.needs.social` universally. A character with a true solitude preference may therefore get compelled to socialize as a routine side effect.

Minimal change hypothesis:
1. Persist a seeded trait vector separately from the persona *text rendering*. Avoid `personality` string as mechanical truth.
2. Derive personal desire-for-contact and tolerance for solitude from traits plus learned experience; separate *satiation* from *fatigue*. A strong lone-wolf may still value a few specific trusted people.
3. Derive emotion from **personally appraised** events: expected outcome vs actual, threat/safety, goal relevance, relationship relevance. Keep short-term affect separate from medium-term stress/meaning and slow traits.
4. Use affects as bounded biases on attention/memory/choices, not arbitrary permission to break physics. Generated dialogue may interpret an event but not declare it factual.
5. Treat personal interests as learned/evidence-linked preferences; repeatedly successful woodworking may cause an aspiration, but merely achieving three workbench receipts must **not** give every character the same workshop goal.

**Falsifiable tests:** two characters with matched initial physiology/world but opposite socialApproach/solitudePreference have different voluntary contact/solitude distributions; safety behavior remains legal in both; an introverted agent may still maintain a valued bond; an upsetting witnessed event changes short-term priority but doesn't permanently rewrite stable traits; actor-private hidden distress doesn't affect distant strangers.

## 5. Physical inventory must precede ambitious multi-actor construction

**Current authority seams:** `AgentWorld.newAgent` seeds food=1/water=2; `Biology.create` creates matching `bio.pantry`; `Crafting`, `Reservations`, `WorldReceipts` manipulate/count material, and `Civilization.die` removes agents. Existing counts and crate capacities are not a physical carrying model.

Recommended constrained vertical slice:
- **Zero possession spawn** for every founder and arrival: all counts zero; *normal starting bodily hydration/fuel remains distinct*. The first action may be drinking directly from an actual water source. **Carried** water must be stored in a validated physical vessel.
- One canonical ownership record per physical item/lot (actor hands, actor container, ground, workpiece, world container, consumption sink), with legacy count projections for UI while migrating.
- Distinguish `massKg`, `volumeL`, stack quantity, `containerCapacity` (mass and volume), `liquidCompatible`, plus only the *necessary* hand/slot restrictions. Avoid full CDDA simulation initially.
- Compute encumbrance from total mass and load arrangement; cap acquisition by both mass and volume. Empty-handed actors may carry a bounded number of things in hands but cannot silently transport many wood logs.
- Atomic source->hand/container->ground/workpiece transfers, reservations and receipts, idempotent retries, conservation under competing actors; on death release reservations and place physical possessions in reachable world remains/ground, not delete/mint them.
- Food nutrition should reference consumed physical food. Stage migration from `bio.pantry` to canonical item lots to avoid dual authorities, while preserving v3 old-save contents; never reset existing players' inventories under a migration.

**Critical acceptance tests:** no possession at new spawn; drinking from source requires proximity; water carried without container is impossible; full hands and full volume/mass each separately block pickup; stone vs fiber load differs; time/stamina cost changes with encumbrance; death and failed project don't duplicate items; two actors competing for one lot cannot both acquire it; saved inventory exactly restores; zero-possession 7-day survival tested on several viable seeded environments without free item creation.

The new G4.1 `world.construction` declarations are intentionally inert until physical tile receipts exist. The next construction work should depend on lawful physical hauling, not counter-based teleportation.

## 6. Measurable experiments before choosing a model strategy

**A. Cognitive routing ablation.** Same fixed seeds, NPCs, task stream and simulation duration; compare (i) deterministic-only, (ii) fixed-interval Rein one-token ranking, (iii) event/cue-gated Rein, (iv) event/cue-gated richer Hivemind decisions. Count useful authoritative goal completions, violated commitments, deaths by cause, missed critical cues, unhandled/duplicate cues, stale decisions, inference calls/tokens, wall-clock processing and p95 latency. Run model comparisons on the actual RTX 2060, not just mocked HTTP.

**B. Environmental affordance ablation.** Same cognitive budget and seeds; compare counter inventory vs physical carrying/storage constraints. Measure distinct negotiated trades, material transport routes, voluntarily shared work, tool use, grounded goal diversity, and net productive work. Do not assume extra difficulty creates better social behavior.

**C. Trait isolation.** Keep world and biology identical while changing only predeclared trait vector; test predictable preference shifts without special pleading on hunger/thirst or fabricated knowledge. Multiple random seeds to avoid cherry-picked anecdotes.

**D. Long-term intention integrity.** Introduce interruption after 9/20 simulated minutes, missing material, credible/false rumors, bad weather, partner rejection, death, save/restore, delayed model response. Measure actual predicate satisfaction vs narrative claims, progress preservation, double-spend attempts, and goal abandonment reasons.

**E. Simulation safety.** Run headless / connected-equivalent tests at 1/60/240/3600x; check finite stocks, no infinite water/food, duplicate reservations and items, bounded memory/cues, and fair model lane. Model-free baseline should still survive on viable seed configurations and genuinely die on impossible ones.

No new performance percentages are claimed here: **all proposed thresholds require baseline measurements first**.

## 7. Minimal implementation order (not authorization to code)

1. **G5.0 research/status hygiene:** reconcile stale `docs/cognition-implementation-roadmap.md` against merged G0–G3 PRs, link this study, and distinguish automated CI from observed Windows behavior.
2. **G5.1 physical inventory/zero-spawn feasibility:** add canonical lot ownership and the smallest viable carry/container rule; direct-source drinking; old-v3 migration; survival fixtures. Prerequisite for physical hauling in G4.2.
3. **G5.2 structured traits and social need curves:** seed/save stable traits and independently model contact vs solitude; behavioral differential fixtures, no LLM required.
4. **G5.3 actor-private cue inbox/router:** threshold crossings, event provenance, coalescing, expiration, preemption and attention fairness; not another action executor.
5. **G5.4 higher-level deliberation contract:** optional structured strategic intentions and goal revisions, validated against evidence/affordances; model budget and stale-reply gates. Keep existing Rein scored actions as a cheap option, but never pretend one-token A–J choice is unconstrained reflective planning.
6. **G5.5 emotional appraisal and personal growth:** bounded updates from witnessed success, injury, missed goals, affection/conflict; observable effect on memory/priorities over time.
7. **G5.6 social commitments and collaboration:** explicit willingness, requests, promises, task ownership and physical resources; avoid compulsory friendship or pre-assigned institutions.

**Dependencies:** G5.1 before full G4.2 hauling; G5.2 before trait-driven G5.5; G5.3 before G5.4; G5.4+G5.1 before ambitious G4.3 cooperative housing. Every phase should have its own verifiable behavior gates and a small PR; do not lump them into one broad rewrite.

## 8. Open questions and cautions

- Is current `Rein-NPC-4B` trained for higher-level plans, or chiefly optimized for bounded action ranking? Test its actual adapter before adding prompts or model training.
- What is the smallest reliable, *bounded* private working-memory/cue state that survives save/reload and does not expose omniscient facts?
- Should a learned personal aspiration be stored as a durable `Goal` with supporting receipts rather than mutable prose? Likely yes; test with generated and counterfactual fixtures.
- How should one NPC handle emotionally important but non-actionable observations? Sometimes the best action is to remember, reflect or continue work; do not force busywork.
- Long-horizon persona fidelity and social simulations need domain-specific evaluation; human-sounding dialogue and aggregate consensus are not acceptable proxy success metrics.
- We have **not** run the cited external code, native Windows game, or local-model hardware benchmark in this research pass. Repository inspection and paper evidence support design hypotheses only.
