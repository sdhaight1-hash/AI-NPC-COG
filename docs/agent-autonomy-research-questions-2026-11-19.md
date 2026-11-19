# Next investigations: embodied NPC autonomy — falsifiable questions

**Recorded:** 2026-11-19. **Status:** Research questions recorded **before** further investigation; no implementations claimed.  
**Baseline:** `main` at `7051b751c627c5e801ab9a4cc385c6032211eb2f` (previous research PR #68 integrated).  
**Prior work:** [Initial cognitive audit](embodied-cognition-research-agenda-2026-11-19.md) and [first research follow-up](cognitive-executive-followup-research-2026-11-19.md).

**Results of this investigation:** [Deep review of intentions, curiosity, memory and cooperation](agent-autonomy-deep-investigation-2026-11-19.md); [testable benchmark contract](agent-autonomy-benchmark-contract-2026-11-19.md). The original questions below remain as the pre-investigation record.

## Why another investigation?

The earlier research establishes *what components* we need, but not their exact decision boundaries, learning dynamics, or evidence for selecting one architecture under **one shared 4B local model and multiple embodied NPCs**. Avoid building a speculative all-purpose framework without testing whether any additional layer changes grounded behavior.

## Open questions to investigate now

1. **Attention trigger design:** Can a small hysteretic cue router distinguish (a) bodily safety, (b) policy/known-task continuation, (c) new perceptual surprise, (d) genuine competing commitments, and (e) model-worthy social dilemmas? What is the risk of missed/misrouted cues versus a fixed polling approach? How to avoid leakage from world truth into actor-private attention?
2. **Intention persistence and actual autonomy:** Should durable goal ownership follow a BDI-like commitment structure, hierarchical project graph, utility scheduler, or combination? Which exact exceptions permit abandonment, and can alternatives be explored without flapping? Do ambitions emerge from grounded rewards without forcing every agent into the same profession?
3. **Human variation under code-only needs:** What traits, drives and social modes are minimally identifiable from observed choices? How can we distinguish voluntary solitude, attachment satisfaction, social fatigue, fear and values without claiming a human-accurate psychology engine? What is the proper timescale for trait/affect/goal updates?
4. **Memory as causal driver:** How do verified episodes, hearsay, interpreted outcomes and procedural learning affect future action selection? Can we demonstrate value from retrieval, rather than measuring lexical recall alone? How do we prevent model interpretations from laundering a rumor into fact?
5. **Local model capability envelope:** With the one-token Rein A–J selection API versus structured Hivemind responses, which cognitive tasks can be assigned to each without claiming that a ranked menu equals self-generated goals? How should cached strategic decisions survive unavailable model inference?
6. **Distributed social commitments:** How to represent invitation, consent, refusal, promises, shared work and reputation without forcing simulated friendship, scripted settlements or mind-reading? What physical receipts and knowledge provenance are required for each participant?
7. **Inventory and embodied feasibility:** Is a unified item-lot ledger needed immediately, or can a gradual identity-preserving migration from counts satisfy mass/volume/containers/ground and held workpiece conservation? How do water vessels and direct drinking interact with physical activity interruptions?
8. **Benchmark choice:** What tests distinguish genuine emergent difference from random wander, scripted utility biases, or verbose model output? What acceptance criteria can be measured headlessly before expensive hardware evaluation, and what *must* be validated on device?

## Competing hypotheses (not yet selected)

- **H1: Reactive utility + persistent BDI-like intentions** beats frequent LLM action-by-action polling at equal model-call budgets, because it preserves commitments without wasting calls on mundane activity.
- **H2: Actor-private cue routing** reduces calls and stale response decisions without increasing preventable deaths or critical response latency; false triggers and suppressed important events are primary risks.
- **H3: Structured traits + learned preferences** produce reproducible individual behavioral differences even when the LLM is unavailable; simply enriching persona prose does not.
- **H4: Richer physical affordances** (carrying, container constraints, hauling, worksite stock) elicit meaningful cooperation only if the world also permits actual negotiation, resource handoffs and shared-benefit choices.
- **H5: Long-run memory effects** are measurable only if retrieved evidence changes decisions or predictions in controlled counterfactual scenarios; recall accuracy alone is inadequate.

## Investigation discipline

Prefer primary papers with dated bibliographic data, repository code with exact link/path, and explicit statement of whether the claimed feature is **implemented**, **documented**, or **hypothesized**. Identify alternative explanations and failure modes. Record date and inspected source; do not infer benchmark results for our GTX/RTX 2060 from other people's hardware.

Deliver in a follow-on document: evidence-grade source matrix; adjudicated architectural decisions; minimal pseudocode connected to current `public/*` functions; exact experiment design with counterfactual baselines; ordered tickets that do not expand the live simulator until agreed.

This question register is intentionally separate from the final research findings to preserve the before/after progression.
