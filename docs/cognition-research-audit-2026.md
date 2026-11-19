# Research audit: embodied NPC cognition, autonomous action and world authority

**Date:** 2026-11-18  
**Status:** Reference architecture and externally researched implementation guidance. **Not implemented merely by writing this document.**  
**Scope:** NPCs, animals/ecology, memory and knowledge, perception, durable intentions, action harness, coordination, lifecycle and scalable local inference.  
**Related:** [Current agency](agency-motivation-beliefs.md), [physical crafting](crafting-architecture.md), [world roadmap](emergent-world-roadmap.md), [implementation backlog](cognition-implementation-roadmap.md).

## Executive conclusions

The current project's instincts, episodic memories, bounded action scoring, crafting and supply plans are useful beginnings. But NPC action selection remains insufficiently linked to long-running physical execution and validated world outcomes. More prompt engineering or more frequent model queries will not fix that architectural bottleneck.

**Design decision:** The simulation owns world truth, physical effects, time, resource conservation and action validity. Each NPC has a *partial*, possibly mistaken picture of that world, a personal memory and belief system, durable goals, and an execution controller. Language models advise on uncertain strategic/social choices, rather than advancing every step of walking, gathering or manufacturing.

We need to **measure successful world changes**, not just request counts or narratives that describe activities.

### Cognitive loop

```text
Authoritative world + timed physiological/ecological state
      │ world event / current local conditions
      ▼
Perception gate (light, range, occlusion, hearing, touch, fatigue, identity)
      │ per-NPC observations; provenance and certainty
      ▼
Private knowledge + memory (working / episodes / beliefs / skills / social)
      │ retrieved task-relevant evidence
      ▼
Needs + temperament + values + relationships + commitments
      │ proposed prioritized goals
      ▼
Persistent objective / dependency graph
      │ relevant subtasks; constraints; resource reservation
      ▼
Long-running activity executor (validate/start/tick/interrupt/resume/finish)
      │ command proposals only
      ▼
World-validated effects, structured event receipts and measured outcomes
      └──── feedback to beliefs, memories, goals and learned procedures

    Rein/Hivemind: optional deliberation/communication/replanning at major
    decision boundaries; bounded choices, model fallback and inference budget.
```

Do not confuse **world fact**, **observed evidence**, **personal belief**, **reported claim**, **inference**, **plan**, **action proposal** or **verified effect**. They have different authority.

## Source-code review: implementation lessons, status and limits

| Project and exact code | Observed implementation | Lesson / caveat |
|---|---|---|
| [Bigville](https://github.com/ozmalabs/bigville): [world affordances](https://github.com/ozmalabs/bigville/blob/main/domains/world_affordances.py), [perception filtering](https://github.com/ozmalabs/bigville/blob/main/domains/lazy_perception.py), [personal map](https://github.com/ozmalabs/bigville/blob/main/domains/map_memory.py) | Pure-data world affordances separated from residents' knowledge; a perceiver-specific view; fogged personal maps distinguish unknown, vague and observed locations | Build an *observation boundary* and fallible individual maps. The world's full database must not appear in NPC prompts. The code explicitly notes gaps including sight occlusion, so do not treat every envisioned feature as fully simulated. |
| [Westworld](https://github.com/gen0cide/westworld): [cognition stack](https://github.com/gen0cide/westworld/blob/main/docs/cognition-and-autonomy.md), [goalgraph](https://github.com/gen0cide/westworld/blob/main/cognition/goalgraph/goalgraph.go), [memory manager](https://github.com/gen0cide/westworld/blob/main/memory/manager.go) | Fast reflexes/routine and goal direction; slower strategic reasoning. Typed intention graph (requires/produces/enables/blocked_by/serves); local scratch/durable/remote memory with source and freshness | Build a **small** bounded goal graph and model escalation gate. Source comments say the graph is a memory structure, **not** a fully operational per-tick search planner; don't copy its infrastructure/AGPL code. |
| [AIvilization Town](https://github.com/EnglandLobster/aivilization-town): [agent cycle](https://github.com/EnglandLobster/aivilization-town/blob/main/apps/worker/src/agentCycleRunner.ts), [active plan tick](https://github.com/EnglandLobster/aivilization-town/blob/main/apps/worker/src/canonicalActivePlanTick.ts), [budget policy](https://github.com/EnglandLobster/aivilization-town/blob/main/apps/worker/src/actionSynthesisPolicy.ts), [memory filtering](https://github.com/EnglandLobster/aivilization-town/blob/main/apps/worker/src/memoryContextSelection.ts) | Explicit objectives, branch/subtask progress, bounded action proposals, energy/satiety/inventory budgets, simulated attempts, repair/replanning, traces and goal-aware memory selection | Distinguish objective, plan, proposed command and completed effect. Adopt invariants/contracts; avoid importing the elaborate worker infrastructure. |
| [AI Town](https://github.com/a16z-infra/ai-town): [agent loop](https://github.com/a16z-infra/ai-town/blob/main/convex/aiTown/agent.ts), [memory](https://github.com/a16z-infra/ai-town/blob/main/convex/agent/memory.ts), [architecture](https://github.com/a16z-infra/ai-town/blob/main/ARCHITECTURE.md) | State-machine social invitations, movement to conversation, participation and cooldowns; LLM asynchronous operations; perspective-specific conversation summary and embedding retrieval | Social actions need *two participants, consent, timing and actual consequences*, not only generated lines. Avoid assuming fluency proves trust/friendship. |
| [Agent Sandbox](https://github.com/ccb/agent-sandbox): [planner](https://github.com/ccb/agent-sandbox/blob/main/godot-generative-agents/backend/planner.py), [agent cognition](https://github.com/ccb/agent-sandbox/blob/main/godot-generative-agents/backend/cognition.py), [benchmark proposal](https://github.com/ccb/agent-sandbox/blob/main/docs/design/planning-benchmark.md), [memory design](https://github.com/ccb/agent-sandbox/blob/main/docs/design/agent-memory.md) | Mock deterministic and real LLM planning seams; action-tool validation and reactive cooldowns; benchmarking proposed via deterministic state predicates. Memory documents distinguish implemented stages from future work | Make all cognition executable/testable without an LLM. Benchmark world-state goal completion at varying action depths, not an LLM's prose rating. |
| [Miniverse](https://github.com/miniverse-ai/miniverse): [runtime](https://github.com/miniverse-ai/miniverse/blob/main/miniverse/cognition/runtime.py), [partial perception](https://github.com/miniverse-ai/miniverse/blob/main/miniverse/perception.py), [BM25 memory](https://github.com/miniverse-ai/miniverse/blob/main/miniverse/memory.py) | Separates planner, executor, reflection, scratchpad, cognition cadence; filters per-agent observations; contains BM25 memory retrieval | Begin with entity + lexical retrieval and explicit information isolation; don't add vector DB before it proves necessary. |
| [Stanford Generative Agents](https://github.com/joonspk-research/generative_agents): [perceive](https://github.com/joonspk-research/generative_agents/blob/main/reverie/backend_server/persona/cognitive_modules/perceive.py), [retrieve](https://github.com/joonspk-research/generative_agents/blob/main/reverie/backend_server/persona/cognitive_modules/retrieve.py), [plan](https://github.com/joonspk-research/generative_agents/blob/main/reverie/backend_server/persona/cognitive_modules/plan.py), [reflect](https://github.com/joonspk-research/generative_agents/blob/main/reverie/backend_server/persona/cognitive_modules/reflect.py) | Vision and attention limits, memory retrieval, daily schedules decomposed into smaller actions, reflections with evidence links | Separate day-level planning from minute-level execution, retain evidence for reflections. Historically important; not proof of robust survival/long-horizon planning. |
| [Cataclysm: DDA](https://github.com/CleverRaven/Cataclysm-DDA): [activity lifecycle](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/PLAYER_ACTIVITY.md), [activity executor](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/activity_actor.cpp) | Long-running activities with start/do-turn/finish, calorie/effort cost, cancellation, serialization, and optional resumption | Reusable activity actors should be the substrate for crafting, moving, harvesting and projects. |

**Research activity caveat:** Repositories were sampled in November 2026; repo push activity and README claims are not acceptance evidence. No code from third-party sources is imported by this document. Review actual source licensing before any reuse (Westworld is AGPL-3.0).

## Papers and empirical references

- Park et al., [Generative Agents: Interactive Simulacra of Human Behavior](https://doi.org/10.1145/3586183.3606763), UIST 2023: episodic memory, retrieval, reflection and planning; controlled ablations. Social-town demonstrations do not establish survival realism.
- Wang et al., [Voyager: An Open-Ended Embodied Agent with Large Language Models](https://arxiv.org/abs/2305.16291), 2023: verified skill reuse, feedback-guided curricula and executable tools. Do not grant unchecked generated code authority in our engine.
- Ahn et al., [Do As I Can, Not As I Say (SayCan)](https://arxiv.org/abs/2204.01691), 2022: language-level usefulness must be combined with world-level feasibility of skills.
- Vezhnevets et al., [Generative Agent-based Modeling with Actions Grounded in Physical, Social, or Digital Space (Concordia)](https://arxiv.org/abs/2312.03664): generative agent components operating within a controlled environment.
- Valmeekam et al., [PlanBench](https://arxiv.org/abs/2206.10498): benchmark structured planning and feasible state transitions rather than model fluency.
- 2026 [ASIWorld](https://arxiv.org/abs/2610.14807): survival/world-interaction benchmark with long-horizon actions. Treat the evaluation setup as a reference; don't equate benchmark success with lifelike society.

## Decisions for AI-NPC-COG

### 1. Simulation truth, sensory evidence and fallible beliefs

Define typed, immutable observations derived from a per-agent perceptual filter. Include sense, position, confidence/clarity, event/timestamp, source, and world-entity reference where identifiable. Vision depends on range/light/weather/occlusion; hearing on range/volume/obstacles; touch requires contact; bodily sensation reflects physiology. **Never transmit omniscient world stock, faraway private dialogue or hidden traits to a model.**

A belief is a claim with `subject`, `predicate`, `value`, `confidence`, `source_kind` (firsthand/reported/inferred), `source_actor`, `evidence_ids`, `observed_at`. New evidence revises it; rumor is not converted to observation. Spatial memory supports unknown/vague/observed and last-seen age.

### 2. Multiple memory stores with different semantics

- **Working:** currently active problem, 4–8 bounded slots, overwritten as attention changes.
- **Episodic:** dated witnessed events, actors, emotions/importance and provenance; compact by salience but preserve durable history.
- **Semantic:** generalized beliefs with support links, contradiction handling and source attribution.
- **Procedural:** known verified methods, proficiency, failures and required tools/skills.
- **Autobiographical/social:** identity, family, promises, values, commitments, relationship evidence.

Retrieval: entity link or keyword/BM25 candidate search → recency/importance/relevance/confidence reranking → diverse evidence packet. Summarization or reflection must be explicitly labeled as inferred and retain episode IDs. Test recall that changes actions; not just realistic-sounding dialogue. Don't require a vector store for v1.

### 3. Goals, plans and physical work are different entities

- **Drive**: bodily, social or aspirational pressure.
- **Goal**: desired, verifiable world state with priority/utility, owner, deadline, completion predicate and abandonment reason.
- **Plan**: bounded dependency graph of subtasks with `requires`/`enables`/`produces`/`blocked_by` links; each subtask has input reservations, time/energy costs and failure recovery.
- **Activity**: one timed executor instance, real actor/target, preconditions, progress and interruption/resumption state.
- **Receipt**: authoritative success/failure and exact world delta, used to update belief/memory/skill/goal.

Use utility ranking to choose goals; bounded hierarchical task decomposition for known methods; local repair for blocked prerequisites; request LLM reasoning only when genuinely new strategy is required. **No per-step model call.**

### 4. Social behavior, communication and coordinated projects

Social interactions require invitations, acceptance/rejection, speech/hearing range, timelines/cooldowns, relationship and promise receipts. Hearing a reported resource location creates a `reported` belief attributed to its speaker, not direct truth. Trust, affinity, respect, obligation and grievance are separate evidence-backed values. Multiplayer production requires reserved finite resources and shared project commitments; a character's contribution changes actual world state.

### 5. Ecology, metabolism and lifecycles

Humans and nonhuman fauna share deterministic physical/time constraints, but **fauna do not use an LLM**. Plants grow/reproduce under soil/light/moisture/seasonal constraints; animals forage/flee/nest/reproduce/die under ecological pressure. For humans: needs alter effectiveness and goals without forcing one personality-independent action. Later lineage uses genetics for biological traits, while skills, language and culture transfer through upbringing/observation/teaching.

### 6. Local model harness and scaling

Maintain one shared prioritized inference lane on the RTX 2060 6GB system. Time-critical reflexes and ordinary activities are simulation-only. Rein handles bounded decisions; Hivemind can be tested separately for richer communication/reflection. Calls have input schema, option whitelist, timeout, reason code, revision/checkpoint identifier and deterministic fallback. Run only on meaningful triggers (novelty, conflicting commitments, major goal creation, social ambiguity, repeated repair failure). No assumption of two simultaneously loaded models.

## Non-negotiable invariants

1. **Authority:** hallucinated narrative cannot alter inventory, weather, damage, relationships or other actors' beliefs.
2. **Knowledge isolation:** unseen entity changes do not silently update an NPC belief; one actor's memories remain private unless communicated.
3. **Conservation:** resource quantities, energy, work-in-progress and reservations cannot duplicate, disappear or go negative due to pause, cancel, retry, death or save/load.
4. **Lifecycle:** a resumable activity survives normal interruption; stopped work never grants a finished product.
5. **Causality:** goal completion requires a world-state predicate; a generated claim or model score is not a receipt.
6. **Reproducibility:** identical seed, initial state, deterministic policies and action responses produce identical state/event hashes.
7. **Budget:** thousand-tick physical work does not imply thousand model calls; measured inference caps and fallback.
8. **Observer insight:** record model decision, accepted action, actual completion, goal progress, error reason and evidence consumed as separately queryable traces.

## Failure patterns to reject

- LLM called once per tile or hammer strike.
- Model-facing context quietly exposing global world truth.
- Forever-flattened goal selection that abandons work after each action.
- Self-awarded skills, projects or social facts because model described them.
- No-op mitigation by spamming more prompts rather than improving execution.
- One universal trust meter or automatically synchronized conversations/beliefs.
- Evaluating prose realism alone without replay, goal predicates or physical receipts.
- Copying complex distributed infrastructure without current scale needs.

## Implementation link

The ordered, test-driven acceptance gates and tickets live in [cognition-implementation-roadmap.md](cognition-implementation-roadmap.md). This research reference describes design principles; individual tickets specify what counts as shipped and how it is verified.
