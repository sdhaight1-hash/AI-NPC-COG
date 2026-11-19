# Code seam audit: unify personal knowledge access without rewriting memory

**2026-11-19. Status: design finding; no code changes.**  
**Related:** [Deep investigation](agent-autonomy-deep-investigation-2026-11-19.md) and [causal tests](agent-autonomy-benchmark-contract-2026-11-19.md).

## Specific current sources

- [public/cognition.js](../public/cognition.js) maintains a legacy 160-entry textual episode list and uses token overlap/salience/recency/locality for recall. Its locality score currently computes **unwrapped Cartesian Manhattan distance** from stored x/y: this does not respect the simulation's toroidal X/Y coordinates, potentially demoting a remembered event just across a world seam.
- [public/agency.js](../public/agency.js) independently maintains per-source personal beliefs, failure heuristics, practice weights and an action-key goal. Its `observe` reads an authoritative object only after selected physical actions; this deserves a contract test ensuring the actor was actually entitled to learn that precise fact.
- [public/evidence-memory.js](../public/evidence-memory.js) separately records verified receipts, personally inspected facts, reported claims with speaker evidence, and daily source-cited summaries. Its `recall` ranks episode texts, while its consolidation currently selects a small number of **receipt-linked physical-work episodes**; it is not yet a complete autobiographical reflection system.
- [public/perception.js](../public/perception.js) creates bounded private visible/heard/body packets and filters affordances using the old `agency.beliefs` and `knowledge.observations`. Its source knowledge gate should be able to use new evidence without creating parallel contradictory truth caches.
- [public/app.js](../public/app.js) constructs connected model context from *both* Cognition.recall and EvidenceMemory.recall, plus `agency.beliefs`, physiology and visible objects. This is useful but is not one coherent actor-known-state contract.
- [public/receipts.js](../public/receipts.js) holds authoritative action deltas and includes other actors' private states for **internal** difference accounting. That internal accounting is not model-visible. We must preserve this boundary.

## What is the failure risk?

More memory stores are not inherently wrong; the risk is assigning competing authority for **the same observable proposition**. For example, a legacy belief might say a water source is available, a new inspected episode may establish it was depleted, and a reported hearsay claim may say it has water again. A utility scorer could use one store and the model-context compiler another.

It would be incorrect to declare the most recent rumor to be a witnessed fact, or to silently erase the old episode. The correct design is to derive a **read-only, actor-owned, evidence-ranked current working belief** from its available sources.

## Minimal architecture recommendation

Do **not** rewrite all memory, discard legacy saves, add a vector database, or make world facts directly accessible to the model.

Prefer a lightweight `ActorKnowledge` read adapter initially:

~~~text
ActorKnowledge.forActor(actor, targetId, atClock)
  -> candidate personally observed facts with receipt IDs and timestamps
  -> candidate received claims with speaker, time, verification status
  -> derived effective belief and uncertainty (never erases originals)
  -> actor-visible evidence IDs for a cue/action candidate
~~~

Existing `EvidenceMemory` remains the strongest source of physical evidence; legacy memories remain legitimate as *subjective reminiscence* and compatibility data. Existing agency-belief consumers can gradually use the projection, rather than maintaining two independently authoritative stock values. The world still independently checks actual action preconditions.

## Failure-directed tests before any migration

1. **Toroidal recall locality:** NPC at x=0 retrieves an old personal episode at x=width-1 as geographically near, not far; equally for y seam. Verify exact map distance, not just retrieval string.
2. **Contradictory observations:** firsthand full spring at T1, firsthand depleted at T2, hearsay at T3; preserve all records, rank latest firsthand knowledge appropriately, do not promote hearsay to certainty.
3. **Source privacy:** a third party cannot receive a belief or cue from someone else's private inspection until communication or direct observation actually occurs.
4. **Behavior effect:** if the character chooses a different known source due to its own corrected belief, verify the changed physical route, failure avoidance and receipt—not merely updated prose.
5. **Save/migration:** old `n.memories`, `n.agency.beliefs` and new evidence collections survive v3 restore without duplicated source claims or spontaneous fabrication.
6. **No context leaks:** authoritative `WorldReceipts.snapshot().others` must never become an input to the actor's language prompt or model-facing cue.

This is an **integration seam**, not evidence that the current memory system already misbehaves in a particular observed player recording. Confirm via deterministic counterfactual tests before changing code.
