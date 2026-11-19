# Agent autonomy evaluation contract — first measurable gates

**Research date:** 2026-11-19. **Status:** Test specification only; no benchmarks executed or behavior changes made.  
**Companion:** [Deep investigation II](agent-autonomy-deep-investigation-2026-11-19.md); [question register](agent-autonomy-research-questions-2026-11-19.md).

## A. What counts as success?

**Primary observations (code-derived):** authoritative goal-predicate achievements, physical work receipts, resource transfer/delta, death by cause, legally blocked actions, commitments honored/abandoned with reason, social acceptance/refusal, and individual learning changes.

**Efficiency:** NPCs supported per simulated day, token/request counts and p95 model wall-time, total machine wall-time, queue delay, saved-state size, replay equality. Hardware results must be measured on RTX 2060 6 GB / i5-9000F / 16 GB rather than extrapolated.

**Quality does NOT equal:** long dialogue, positive mood text, number of autonomous thoughts, decisions requested, or chosen actions without validated outcomes.

## B. Fixed causal comparisons

| Experiment | Hold constant | Vary | Observable result |
| --- | --- | --- | --- |
| Cue routing | Map seed, actors, initial needs, decision prompts, legal affordances | Deterministic-only, fixed-interval Rein, cue-driven Rein, cue-driven richer Hivemind | Actual completed predicates and dangerous missed cues **per model call**; no stagnation from inference backlog |
| Commitment governance | Goal, skill, resources, deadlines, body state | Current fixed project selection vs explicit adopted-goal record | Work preserved across interrupts, abandonment reasons, completion after obstacles |
| Individual temperament | Identical world, actor physical capabilities and known facts | Stable socialApproach, solitudePreference, persistence, risk/curiosity dimensions | Verifiable differences in voluntary interactions, activity choice and commitment continuity (survival still functional) |
| Memory intervention | Current world and legal actions, actor ID and traits | Withhold, restore or contradict one **permitted** private episode/claim | Correct action change, avoidance of known failure, no false claim promoted to firsthand truth |
| Exploration motivation | Same map and available opportunities | Novelty-only vs verified learning vs capability gain | Distinct discoveries, usable tools/skills and personally selected goals; avoids aimless novelty loops |
| Cooperative constraints | Same resources, spatial paths and task | No communication vs truthful exchange vs limited talk vs allowed refusal | Successful joint physical outcomes, partner load, latency/cost; no coerced acceptance or fabricated transfers |
| Inventory embodiment | Identical resources and NPCs | Count-based baseline vs actual container/hand/mass/volume rules | All acquisition/transfers legal; additional hauling behavior; meaningful cooperation, if any, measured not assumed |

**Experiment sequence:** instrument invariant-only headless baseline first, then deterministic trait/cue fixtures, then **only** use live local model when mechanical outcomes are independently validated. Run counterbalanced seeds and actor assignment to avoid fixed-spawn confounding. Report confidence intervals or distributions rather than cherry-picked one-run anecdotes. Exact thresholds for inference savings and preference effect size should be set **after** reporting the current baseline, not invented.

## C. Concrete tests tied to current code

### C1: Critical body cue independent of inference

**Seam:** public/simulation.js, public/biology.js, public/world-runtime.js:survival, public/activities.js.

- Start an eligible 20-minute activity, progress exactly 9 simulated minutes.
- Reduce the *actor's real bodily state* into dangerous dehydration (no hidden global command).
- Assert interruption preserves activity ID, previous work credit, reserved physical inputs; legal emergency response starts without model invocation; no premature finished item.
- Restore body safety with actual water consumed from a finite source and resume remaining 11 minutes.
- Repeat with model offline, model response delayed, time acceleration and restored checkpoint.

### C2: Private cue non-omniscience

**Seam:** public/perception.js, public/evidence-memory.js, public/world-runtime.js:available.

- Dry up a source unseen behind an occluding wall; assert no depletion cue for non-observer.
- Let A inspect and directly witness depletion; assert only A can act on confirmed evidence.
- Let A verbally report source status to B at valid auditory reach; B receives reported claim with speaker/time, not authoritative inspected stock or first-hand fact.
- If C never hears, C must not know B's claim. Retry with dark/fog/hearing obstructions.

### C3: Desire is not commitment

**Seam:** public/agency.js:begin, public/projects.js:chooseKind/maybeStart, new goal record.

- Both NPCs notice usable timber. An uncommitted desire cannot reserve tools, materials or worksite.
- NPC A adopts woodworking objective; B considers but declines.
- An urgent personal safety cue pauses A; noncritical novelty does not repeatedly replace objective.
- A valid obstacle blocks without losing commitment; new evidence permits reasoned abandonment or repair.
- Goal completion requires world predicate, not the model printing 'workshop finished'.

### C4: Social preference counterfactual

**Seam:** public/civilization.js:person, public/emergence.js:stepNeeds, public/agency.js.

- Spawn equal bodies, proximity, knowledge and prospects, with opposing explicitly persisted social traits and identical deterministic RNG stream.
- Compare voluntary social/solitude choices and social satisfaction over several simulated days.
- Assert both can form a valued specific connection and neither is automatically prevented from helping in a critical emergency.
- Assert social fatigue is not identical to loneliness, and social interaction with an unwilling partner cannot grant a mutual benefit.

### C5: Grounded, causally useful memory

**Seam:** public/evidence-memory.js:recall/consolidate, public/projects.js, public/world-runtime.js.

- Previously inspected water source no longer visible: agent can choose informed return but cannot know current stock.
- After exact depleted-source failure receipt, update belief; avoid repeated wasted trips when another actor-visible option exists.
- A reported false source is not certified true until verified; a previous successful method can influence **legal** similar work without inventing new secret recipes.
- Repeat with memory ablated; compare actual action and completion cost.

### C6: Physical carries and zero-possession lives

**Seam:** public/emergence.js:newAgent, public/biology.js:pantry, public/crafting.js, public/reservations.js, public/civilization.js:die.

- Founder and arrival inventory begins with zero physical possessions. Biological reserves remain normal.
- Direct water drinking requires accessible world source; taking away water requires actual liquid-compatible vessel with capacity.
- Independently test mass limit, volume limit, occupied hands, unsuitable container, competing reservations, death disposition, partial crafting and safe save migration.
- Never delete preexisting old-save possessions or silently invent supplies. Run seven-day survival with no free starter water/food; report failure causes, viable source access and season.

### C7: Cooperation from two independent minds

**Seam:** public/world-runtime.js:begin/complete, public/evidence-memory.js speech, public/reservations.js, projects.

- A requests that B transport a specific existing resource lot; B sees only personally known facts, may accept/reject/counter.
- A's unaccepted promise cannot schedule B work or debit B inventory.
- On agreement, each actor owns its own commitment. Time/position/stock validate each transfer independently.
- After B fails or withdraws, A's task becomes blocked/revisable rather than auto-completing; no ghost friendship.
- Repeat where source is known only to B, and with communication disabled.

### C8: Long-run and performance discipline

**Seam:** scripts/benchmarks.mjs, scripts/headless.mjs, tests/benchmarks.test.mjs, server.mjs, public/app.js.

- Check 5 and 25 NPC deterministic simulations first; 100-NPC no-model soak as stretch performance experiment, not a claim of current capacity.
- Compare model-enabled 5/25-NPC configurations at measured 1x/60x/240x/3600x. Backend runs only one active GGUF; never assume parallel GPU inference.
- For each seed, record initial state hash, final state hash, physical outcomes, inference requests, p95 queue latency, failed/stale decisions and deaths.
- Save halfway through and assert replay equivalence. Confirm model delays do not freeze the physical simulation.
- If the benchmark and Windows browser disagree, **debug the divergence before declaring success**.

## D. Mechanical invariants to enforce immediately

1. No action outcome, material, knowledge, emotion, social promise or crafted item may become authoritative merely from model prose.
2. Actor-private cues and model contexts contain no unseen world-state fact or private information from other agents.
3. Exactly-once physical receipts and conserved transfers through start/interrupt/resume/cancel/death/save.
4. An agent's critical survival response never requires another agent's model slot to become available.
5. NPC goals, stable traits and acquired beliefs are actor-specific and persist across save/load.
6. Communication and cooperation do not create guaranteed affection, trust, agreement or social institutions.
7. All gameplay-specific psychological indices are **simulation constructs**, not clinical measurements.

## E. Decisions requiring measurements before implementing

- How many concurrent major commitments per NPC? Start with one primary commitment and possibly queued candidates; measure why additional parallel commitments improve outcomes before expanding.
- Which events request language deliberation? Begin with a tiny typed taxonomy and measure cue miss/false-invocation rate.
- What are appropriate social and solitude setpoints? Calibrate distinct policies with behavior traces, not real-person diagnostic claims.
- Can Rein rank consequential *goal* choices effectively when given a constrained menu? Test before claiming it supports spontaneous aspirations.
- Does adding physical carry constraints create cooperation or just more deaths/time waste? Include the no-communication control.
- Can a longer reflection cadence preserve continuity without reducing meaningful choices? Test multi-day and full-season scenarios.

## F. Next engineering issue candidates (not yet implementation)

1. Causal benchmark harness for differentiated cue/goal/memory/social interventions.
2. Actor-private typed cue inbox and fairness-aware LLM escalation.
3. Individual intention lifecycle with audit trail and existing Projects/Activities adapter.
4. Zero-start inventory and physical carrying/conservation migration.
5. Stable social/solitude dimensions with behaviorally tested needs.
6. Minimal proposal/consent/transfer protocol tied to physical receipts.

Each candidate requires one isolated implementation PR, tests with meaningful world predicates, replay and save compatibility. Avoid building a new general agent framework or a second physical executor.
