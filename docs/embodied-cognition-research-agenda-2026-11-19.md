# Embodied NPC cognitive executive — audit and research agenda (2026-11-19)

**Status:** Initial findings committed prior to new investigation. Design/research only; no runtime changes.  
**Baseline:** `main` at `0c99315090a928b3ffb42d1ee45181cdf98f9085` (G4.1 blueprint declarations merged).  
**Scope:** Attention/cue arbitration, deterministic-vs-LLM authority, structured personality, emotional/social needs, self-directed goals, inventory/encumbrance, benchmarks.

## Summary of source-grounded findings

The project now has authoritative simulation ticks, outcome receipts, durable resumable activities, finite reservations, project DAGs, private perception, evidence-backed memory, verified speech, reported-source reliability, and offline companionship. These are *foundations*, not evidence of convincing emergent individuals. See `public/simulation.js`, `public/receipts.js`, `public/activities.js`, `public/reservations.js`, `public/projects.js`, `public/perception.js`, and `public/evidence-memory.js`.

| Current seam | Verified limitation | Proposed research question |
| --- | --- | --- |
| `public/emergence.js:newAgent` | Starter inventory is `{food:1,water:2,...}`, contradicting zero-possession founders; food is duplicated in `bio.pantry`; counters lack physical carry constraints | Canonical item/lot ownership; direct water consumption vs water carried in a vessel; migration and zero-spawn survival |
| `public/agency.js:personalityBias` + `public/civilization.js:person` | Two adjective tags interpreted with regex utility bonuses | Stable dimensions vs mutable values, social setpoints, individual preference learning; trait differentiation tests |
| `public/emergence.js:stepNeeds` | Social and curiosity pressure accumulate at universal rates; mood/stress aren't a full emotional appraisal loop | Relatedness vs solitude, individual social saturation, event appraisal with bounded influence on choice |
| `public/cognition.js:instinct`, `public/world-runtime.js:survival` | Hand-coded urgent survival thresholds, no generalized typed cue/attention inbox | Threshold crossing, surprise, cue priority, coalescing, stale-cue invalidation and deterministic critical overrides |
| `public/projects.js` + `public/activities.js` | Fixed project templates; durable subaction execution but not an intention/goal-governance layer | Goal origination, motive conflict, blocked-plan repair, voluntarily suspend/abandon/resume |
| `public/app.js:deliberate`, `server.mjs:decide` | Connected Rein receives up to nine scored legal options plus none; one-token selection, not open-ended deliberation; shared inference lane | When to invoke richer structured language deliberation, with an explicit model budget |
| `public/construction.js` | G4.1 blueprint declarations are persistent but cannot physically build; G4.2/G4.3 pending | Avoid designing hauling around unbounded inventory counts; integrate logistics before full construction |

### Separation-of-concerns hypothesis

```text
World truth -> actor-private observations -> body/needs/trait appraisal
            -> typed cue arbitration / attention
            -> deterministic reflex OR scripted routine OR strategic LLM deliberation
            -> validated intention + existing project/activity executor
            -> authoritative effect receipt
            -> actor-private memory, belief and bounded motivation update
```

The model must not own physics, metabolism, navigation, stock counts, inventory mutation, tool animation, per-minute life simulation or factual event receipts. World-code can run routine execution between sparse deliberations; the model can interpret subjective meaning, select personal commitments, revise ambitions and negotiate.

**Decision distinction:** an urgent *body safety* interruption is mechanically mandatory; voluntary *goal reconsideration* is personal/cognitive. Preserve activity IDs, material holds and elapsed work, and avoid thrash with hysteresis.

## Questions requiring outside research

1. Hybrid executive architectures: utility AI vs behavior trees vs GOAP/HTN vs appraisal/BDI/active inference; which structures should be minimal, stable and testable?
2. Attention/cue scheduling: what events deserve a 4B model call, how to suppress redundant cues, and how to prevent shared model backlog from blocking survival?
3. Personality/needs: meaningful continuous traits, learned preferences, interpersonal attachment, solitude demand, emotion dynamics and lifetime consistency.
4. Goal formation: originate interests/ambitions based on experienced outcomes and opportunities; preserve commitments while adapting to new evidence.
5. Memory and social modeling: retrieve experience with provenance, consolidate narrative identity, and update beliefs about individuals without fabricating reciprocity.
6. Inventory/embodiment: mass vs volume vs carry slots vs hands/containers, spoilage, water containment, source-to-worksite hauling and physical disposition at death.
7. Benchmarks: zero-possession survival, personality differentiation, environmental affordance ablation, goal completion per model token, action preemption/resumption, no duplicate materials.
8. Existing implementations: inspect active repositories' *actual code paths* and current papers, not marketing descriptions; distinguish proposed from shipped.

## Research deliverables to append

- Evidence table with papers, active repositories, exact paths, design claims and limitations.
- Minimal proposed state contracts and pseudocode tied to existing repository functions.
- Clear order of small implementation tickets, each with acceptance tests and performance constraints.
- Explicit unknowns and results that require Windows/RTX 2060 runtime validation.

This document is a research record, not authorization to implement a speculative rewrite. Existing milestones and docs can contain stale completion status; compare to merged PRs and current code before changing anything.
