# Deep investigation II — intention governance, curiosity, memory, and cooperation

**Research date:** 2026-11-19  
**Status:** Source-reviewed architecture hypotheses, **not implemented**.  
**Baseline:** main at 7051b751c627c5e801ab9a4cc385c6032211eb2f, after PR #68.  
**Question register:** [Agent autonomy open questions](agent-autonomy-research-questions-2026-11-19.md).  
**Predecessor:** [Cognitive executive follow-up](cognitive-executive-followup-research-2026-11-19.md).

## Executive result

The crucial missing component is not an elaborate planner, a larger global action menu, or a simulated human endocrine system. It is **durable intention governance**: selecting which personally meaningful goals to commit to, determining when a commitment is superseded, and giving the existing physical executor a stable objective to carry out.

World authority, privacy, physical execution, and long-running activity interruption already have substantial infrastructure. Future cognition must be measured by **independently caused behavior**: what world predicate was achieved, how much inference it cost, what the agent genuinely observed, and whether a different trait/memory/relationship would have changed the choice.

A second discovery is that **novelty is not identical to curiosity**. New open-world exploration research suggests separating (1) discovery of new locations/objects, (2) learning a previously unknown causal relationship, and (3) acquiring useful capabilities. A model should not be queried merely because a character enters a new tile. The agent should be able to develop preferences for mastered tasks, rather than forever wandering toward novelty.

A third finding is that cooperation is **an information and commitment protocol**, not just two plausible lines of dialogue. A valid alliance, promise, joint work agreement or resource report must be expressed as separate actor-visible statements, accepted intentions, and later authoritative physical outcomes.

## 1. Evidence ledger: academic sources and scope

| Source | Confirmed result or established model | Concrete engineering lesson | Limitation |
| --- | --- | --- | --- |
| [BDI Agent Architectures: A Survey (IJCAI 2020)](https://ijcai.org/proceedings/2020/684) | Distinguishes beliefs, desires/goals, and intentions as commitments; discusses failure handling and scheduling concurrent intentions | Separate possible desire from committed goal; handle interruptions, failed plans, scheduling and reconsideration explicitly | Existing project planner already solves much physical decomposition; **do not import a full BDI interpreter** |
| [A multi-level explainability framework for BDI agents (2025)](https://link.springer.com/article/10.1007/s10458-025-09689-6) | Separates failed and dropped goals and relates originating events to decisions | Trace why goal was adopted, suspended, resumed, failed, abandoned or completed | Research framework, not a drop-in JavaScript implementation |
| [Think Fast and Slow: Step-Level Cognitive Depth Adaptation (ICML 2026)](https://proceedings.mlr.press/v306/yang26cz.html) | Adaptive reasoning-depth results require trained CogSFT/CoPO policies | Test discrete reasoning tiers driven by actor-visible cues and available inference budget | Do not transfer its measured gains to Rein 4B without testing |
| [Uncertainty-Aware Sequential Decision Rules for Event-Triggered LLM Invocation (2026 preprint)](https://arxiv.org/abs/2607.13048) | Examines threshold policies and trigger chatter under sequential risk | Use hysteresis, deduplication, deadlines and missed-event tracking | Domain is streaming systems; agent-specific cue calibration is unproven |
| [Intrinsically motivated humans and agents in open-world exploration (PNAS, 2026)](https://pubmed.ncbi.nlm.nih.gov/42981032/) | In Crafter, entropy, information gain and empowerment correlate with human exploration progress; the studied intrinsic-reward RL agents did not match human performance | Distinguish novelty, learning and capability/mastery; test each drive separately rather than introducing a single curiosity scalar | Human correlations are not causal prescriptions, and no claim of human-equivalent psychology is justified |
| [EmbodiedMemory-Bench (2026 preprint)](https://arxiv.org/abs/2609.28236) | Identifies four embodied-memory failure families: passive details, dynamic state, interaction outcomes and experience generalization | Benchmark action consequences: stale water source, blocked route, failed craft, method reuse | Its visual-embodiment scores and model sizes do not transfer to our top-down 4B setup |
| [MASBench: Collaboration Under Partial Observability (2026 preprint)](https://arxiv.org/abs/2610.04672) | Evaluates memory, communication protocols and routing under constrained private information; includes communication cost | Evaluate whether speaking, requesting information and sharing reports changes objective results, not just sentence quality | Preprint; game tasks and total language costs differ from our physically timed world |
| [Observe, Share, or Predict? (Oct 2026 preprint)](https://arxiv.org/abs/2610.16895) | Separates partners' observed state, co-located knowledge exchange and next-action prediction | Treat observed partner action, explicitly reported claim and inferred intention as **three separate evidence grades** | Embodied navigation benchmark, not social psychology |
| [CoEmbod (EMNLP 2026)](https://aclanthology.org/2026.emnlp-main.2247/) | Cooperation tasks categorized by spatial distribution, parallel constraints and failure recovery | Test physically different forms of cooperation, not only social affinity | 3D benchmark; requires local simplified test fixtures |
| [CollabSim (Jun 2026)](https://www.microsoft.com/en-us/research/publication/collabsim-a-cscw-grounded-methodology-for-investigating-collaborative-competence-of-llm-agents-through-controlled-multi-agent-experiments/) | Controls interaction conditions and probes collaboration at action level | Vary bandwidth, privacy, independent goals and refusal experimentally | Some domains are abstract tasks, not simulated survival |
| [Cooperate or Collapse / GovSim (NeurIPS 2024)](https://proceedings.neurips.cc/paper_files/paper/2024/hash/ca9567d8ef6b2ea2da0d7eed57b933ee-Abstract-Conference.html) | Communication contributes to sustainable common-pool resource behavior in its scenarios | Build genuine shared-resource dilemmas before expecting voluntary institutions | Its fixed governance tasks do **not** justify automatically generating government or scripted collective reward |
| [EmCoop (2026 preprint project)](https://happyeureka.github.io/emcoop/) | Proposes dual cognitive/primitive decision timescales for embodied shared-resource work | Supports high-level cognitive choices plus code-owned primitive execution | Site presently labels code 'Soon'; not independently runnable/verified |

**Evidence level:** Confirmed statements above are source summaries, not benchmarks performed against AI-NPC-COG. 2026 preprints require replication and domain checks. PNAS study is empirical correlation; it does not prescribe personality or curiosity formulas.

## 2. Actual source-code mechanisms inspected

| Repository and exact code | Mechanism checked | Adoption decision |
| --- | --- | --- |
| [Jason BDI: Intention.java](https://github.com/jason-lang/jason/blob/main/jason-interpreter/src/main/java/jason/asSemantics/Intention.java), [TransitionSystem.java](https://github.com/jason-lang/jason/blob/main/jason-interpreter/src/main/java/jason/asSemantics/TransitionSystem.java) | Serializable intention stacks, suspension, goal failure event mapping, lifecycle listeners, event selection and message-based resumption | Use the **conceptual lifecycle and traceability**, not the AgentSpeak language or whole Java interpreter |
| [Fluid HTN: Planner.cs](https://github.com/ptrefall/fluid-hierarchical-task-network/blob/master/Fluid-HTN/Planners/Planner.cs), [DefaultPlannerState.cs](https://github.com/ptrefall/fluid-hierarchical-task-network/blob/master/Fluid-HTN/Planners/DefaultPlannerState.cs) | Replans when world becomes dirty or work finishes; partial-plan preservation; task condition failure and replacement hooks | Expand our existing Projects/Activities seam with relevant-event invalidation and repairs, instead of per-tick LLM replanning |
| [CollabSim: actions.py](https://github.com/neuhai/CollabSim/blob/main/src/core/actions.py), [agent_memory.md](https://github.com/neuhai/CollabSim/blob/main/docs/agent_memory.md) | Typed actions with validator (message, propose, respond, transfer and more); per-agent serialized memory restored from a private observation envelope | Add bounded proposal/accept/refuse and knowledge-transfer contracts with per-actor memory, not global mind-reading |
| [GovSim: fishing/act.py](https://github.com/giorgiopiatti/GovSim/blob/main/simulation/scenarios/fishing/agents/persona_v3/cognition/act.py) | Agent action selection for finite harvesting dilemmas in the fishing scenario | Inform tests about cooperative resource restraint; avoid importing prompt or scenario specifics |
| [Cataclysm-DDA: PLAYER_ACTIVITY.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/PLAYER_ACTIVITY.md), [item.h](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item.h) | Timed, resumable work; mass/volume of items including contained contents; liquid-container suitability | Favor physical object/lot conservation, unambiguous container ownership and existing Activities; do not port the enormous pocket subsystem |

These code inspections validate **specific mechanics**. We did not run the external systems or measure their behavior in our world.

## 3. Architectural conclusion: the smallest meaningful layer

### 3.1 Desire vs commitment

Current code:

- public/agency.js stores a broad goal key and increments progress for successful subactions.
- public/projects.js chooses fixed shelter/fire/workbench/storage templates and tracks predicates in durable DAGs.
- public/activities.js handles timing, stable work IDs, interruption and resumption.
- public/world-runtime.js exposes legal actor-private affordances and chooses routines.
- public/app.js:deliberate asks the connected Rein model to choose a bounded legal action.

**Gap:** There is no common, validated way for an individual to originate and own a long-term desire such as 'become an accomplished woodworker' or 'keep my friend supplied with clean water' that is distinct from the next craft/gather action or a fixed template.

Proposed *intention record* (illustrative, not yet authorized as a schema):

~~~text
GoalRecord {
  id, actorId, desiredPredicate, supportingEvidenceIds[],
  origin: learned_preference | reflection | survival | social_request,
  priority, adoptedAt, reevaluateAt,
  state: candidate | committed | suspended | blocked | achieved | abandoned,
  currentProjectId?, lastOutcomeReceiptId?,
  suspensionReason?, abandonmentReason?
}
~~~

- Candidate desires do not automatically spend resources, assign professions or start world effects.
- Commitment means one character has actually selected a desired world state and can explain why.
- A confirmed predicate, not generated praise, marks success.
- Relevant failures, changing beliefs, death, life-threatening body needs, or a *voluntary* priority change permit reconsideration.
- A temporarily unavailable method blocks/suspends; it does **not** inherently erase a goal.
- Initial implementation should cap active major commitments and avoid unrestricted LLM-generated graphs. Existing Projects decomposes **known methods**.

**Counterargument:** We could simply add more utility weights. This would be simpler but doesn't represent an enduring choice or reason, and fails to distinguish 'I might want this' from 'I promised to finish this'. Need an ablation before adding a permanent record type.

### 3.2 Cue routing: minimum explicit contract

Do not create a global 'world event means everybody knows' bus. Per-actor cues may originate from **own body**, **verified perception**, **personally heard statements**, or **firsthand receipts**.

~~~pseudo
onActorAuthorityTick(actor):
    // Existing Simulation + Biology stay fully deterministic
    currentBody = actor.ownBodyState
    if immediatePhysicalEmergency(currentBody):
        suspendPhysicalTaskWithReason(actor, CRITICAL_BODILY_RISK)
        dispatchLegalSurvivalRoutine()
        return
    // Derive changes from only actor-visible facts, not global WorldState leaks
    cues = coalesce(privateObservationsSinceLastTick,
                    thresholdsCrossedByActorBody,
                    verifiedPersonalActionOutcomes,
                    blockedPersonalGoalPredicates)
    expireStaleCuesByActorRevisionAndTime(cues)

    if existingWorkStillValid and no materialChangeToCommittedIntention:
        continueOrResumePhysicalActivity()    // no LLM
    else if knownMethodCanRepairGoal:
        updateCurrentProjectAndAct()           // no LLM
    else if consequentialNovelConflict(cues) and inferenceBudgetAvailable:
        requestLLMIntentionReview(cueIds, privateSnapshotRevision)
    else:
        runSafeActorPolicy()                   // no invented knowledge or speech
~~~

**Necessary details to test before implementing:** cue hysteresis, coalescing key, expiration, fairness between actors, stable identical replay from a saved cue inbox, and suppression of model replies from stale snapshots. Model timeouts must never block ongoing physiology or autonomous survival.

Use Rein's constrained action ranker for cheap choices; a separate rich structured-model interface is required for any open-ended aspiration. Do not conflate the two.

### 3.3 Attention routing should not govern normal reflexes

Potential categories:

| Cue/event | How it is known | Owner of response |
| --- | --- | --- |
| Falling hydration or unsafe environmental temperature of the actor | Own body sensing | Hard safety reflex (code) |
| Known tool/workpiece action still valid | Physical task checkpoint | Activities executor (code) |
| Reaching known resource source and finding it depleted | Firsthand completion/failure receipt | Belief update + known-method repair (code), model only for consequential change of strategy |
| Hearing a request from another person | Verified hearing/speech with speaker uncertainty | Optional intention/social review (LLM or explicit canned refusal) |
| Discovering an unusual feature, novel method or contradictory source | Actor-private observation | Conditional appraisal/attention, perhaps LLM |
| Two incompatible promises | Two accepted goal records | High-priority model reconsideration with explicit consequences |

**Do not equate 'unexpected event' with 'must call the LLM'.** Generic surprises are common and high-volume, particularly at accelerated simulation speeds.

## 4. Intrinsic motivation: three independent tests, not new magic needs

The PNAS study offers a useful hypothesis about **novelty, information gain and empowerment** but does not validate a particular gameplay formula.

Possible simulation observables:

- **Novelty:** personally unseen region/object/action combination. Affects initial investigation, saturates with exposure.
- **Learning:** uncertainty reduced or new method supported by personally verified observations. Affects curiosity without granting secret recipe knowledge.
- **Mastery/competence:** personally practiced methods become more efficient, reliable or useful for future options. Supports sustained interests and potential longer-term aspirations.

Do not define 'desire to be a woodworker' as a hard-coded universal need. A limited, earned affinity can originate from repeated *successful, relevant* practical experiences and explicit voluntary adoption. Different traits, abilities, resource access and life circumstances may make woodworking attractive to some, not others.

Tests must separate **random novelty seeking** from **useful discovery**: reward newly visited tiles but no learning, then reward verified method discovery, then unlock increased autonomy through actual tools/workshops. Observe whether NPCs adapt their goals without uniformity or forbidden secret knowledge.

## 5. Memory should change action, not merely retrieval output

Prior memory audit proved evidence-linked retrieval and false-rumor separation; this follow-up adds a stricter behavior evaluation inspired by EmbodiedMemory-Bench:

1. Passive recollection: character once witnessed a spring. Can it remember *where* when not currently visible?
2. Dynamic tracking: water was later depleted. Does its next plan treat the last firsthand observation as stale rather than forever available?
3. Interaction outcome: an unfamiliar method failed for a specific reason. Does the next attempt change the prerequisite/action instead of endlessly repeating?
4. Experience generalization: a personally learned technique from one source/workbench influences an analogous legal task without inventing a new recipe or magically transferring skill.

Ground truth remains world-owned. The model can generate a **hypothesis** or reflect on evidence, but that must never become an observed fact solely from prose. Evaluate with retrieval enabled/disabled while holding the world, personality and legal affordances constant. Measure actual action choice, goal predicate satisfaction, resource cost and harm, not lexical recall score.

## 6. Social intelligence: knowledge, consent and commitments

**Core separation:**

- Observation: NPC A saw B transporting logs.
- Hearsay: B told A that a spring exists upstream.
- Inference: A thinks B intends to build a house.
- Consent: B accepted an explicit work offer.
- Result: B actually delivered three physical logs.
- Relationship: A may feel gratitude, suspicion, resentment, indifference, or loyalty; that is actor-private appraisal, not an automatic global friendship bonus.

**Minimal verified protocol:**

~~~pseudo
A: proposeHelp(goalId, contribution, compensation?, expiry)
  -> speech must be physically deliverable / audible to B
B: receives an actor-private proposal, may accept/reject/counter/ignore
B: accept creates B-owned commitment, not instant work/material
World: validates any proposed resource transfer and real labor independently
Receipt: physical transfer or work success/failure updates both participants' evidence
A, B: independently interpret results, expectations, trust and emotional outcome
~~~

A 'promise' without actual acceptance is only a witnessed utterance. A public rumor is not a verified observation. Offline companionship remains possible without fabricated dialogues, but should not forge promises.

**Three distinct cooperation fixtures:** spatially distributed information, simultaneous/parallel labor, and recovery when a partner fails or withdraws. Add a zero-cooperation baseline and a forced-cooperation negative control. Not every group should form a settlement or obey the most social NPC.

**Cost study:** communication costs simulated time, attention and perhaps travel; test sparse messages with causal value. Full communication transcripts and universal broadcast are not free.

## 7. Inventory as an indispensable experimental dependency

Prior work identified starter food:1/water:2 and duplicated bio.pantry. This study refines *why inventory matters for autonomy*:

- A goal must be evaluated against actual feasible logistics: free hands, carried mass, usable volume, suitable vessels, worksite access, remaining stamina and resource availability.
- A missing waterskin is not an invitation for the model to pretend to hold water. Drinking from an accessible spring does **not** require carrying a vessel; moving water does.
- If agents cannot carry enough timber, they need real staged transport, storage or another person's assistance. That becomes a meaningful environmental reason to negotiate.
- A failed pickup due to mass/volume capacity produces a specific **personal failure receipt** and a solvable prerequisite (drop, cache, craft basket, ask for help), not a generic 'failed action' cue.

**Migration sequencing:** start from authoritative physical item lots **without dual writes**, with legacy inventory counts as temporary derived projections. Migrate food pantry and water counters transactionally and idempotently; saved old characters must keep genuinely possessed items, while *new* founders and arrivals receive no equipment or carried food/water. Do not launch G4.2 hauling on top of arbitrary item counts.

Mass, volume, hand constraints and liquid containment are distinct failure modes; do not import all of CDDA's nested pocket system in one change.

## 8. Anti-overengineering choices

**Do now if tests justify:** one intentional-goal record, one actor-private cue inbox with bounded size, relevance-triggered known-task repair, finite physical inventory, few separately observable trait/social drives, and a shared model-call budget.

**Do not do yet:** general POMDP solver, full active-inference engine, unconstrained evolving utility weights, generic semantic theorem prover, a second action executor, LLM-per-step emotional updates, global agent 'director', or a huge latent personality model. None is required to test the immediate hypotheses.

A stronger language model alone cannot fix absent physical affordances, information isolation or missing commitment bookkeeping.

## 9. New research questions uncovered

- **Preference discovery:** What specific experienced outcomes justify persistent interest/aspiration, without turning a fixed reward rule into a disguised assigned profession?
- **Reconsideration cadence:** How can a personally meaningful goal persist for months but still respond promptly to genuinely changed conditions? Which cue errors cause missed survival decisions versus wasteful indecision?
- **Theory of mind limits:** What does an NPC need to infer about another person's intentions beyond witnessed actions and reported agreements? How to prevent private mental-state leakage?
- **Care vs exchange:** When would a character help somebody with no expectation of reciprocal payment, and how can traits, attachment and witnessed need influence that without enforcing a universal cooperation bonus?
- **Event-interpretation quality:** Can two personalities appraise the *same actually observed* event differently, with believable later consequences, while keeping fact and interpretation separate?
- **Capability vs curiosity:** Can an agent voluntarily choose mastery, exploration, creation, security or relationships over time as opportunities change, without centrally scripted life stages?
- **Safety/independence trade-off:** Can the code require emergency self-protection while still letting a character make risky but legal value-driven choices outside immediate critical thresholds?

## 10. Required next artifact

Build and compare testable *counterfactual fixture definitions* (see companion experimental design) before choosing trait weights, cue thresholds, or the frequency of strategic-model calls. This document is a design investigation and does not prove that any new feature works on the local 4B model or Windows hardware.
