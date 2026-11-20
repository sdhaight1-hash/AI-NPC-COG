# Actor-local stale model decision guard

This is the first enforceable slice of [issue #73](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/73). It hardens the already-connected `public/app.js` asynchronous Rein/Hivemind selection path. It does not change the simulation's authoritative material executor.

## What is captured at inference issuance

- Actor ID, aliveness, simulated issue time, work command, path/plan and practical project identity/status, personal goal, inventory and bodily emergency thresholds.
- The actor's own inspected observations, prior visual spring sightings, first-hand source beliefs, receipt-linked evidence sequence and received claim states. A correction of an existing fact invalidates a pending answer even when the list length is unchanged.
- For each *actor-permitted action key*, the **first physical affordance** the world would use if `WorldRuntime.begin` were called: source reference, available physical stock/count and competing reservations for that shared node, ground item or crate. This internal safety fingerprint never appears in the model prompt. Other actors' inventory, cognition and unrelated world events are excluded.

## Commit-time policy

When a response arrives, it is discarded (with a `WorldReceipts.decision` `REJECTED` event) if its actor was removed, died, changed context, encountered a new critical need, revised personal evidence or goal, its chosen source or claims changed, or more than **45 simulated minutes** have elapsed. A changed or missing action option is not trusted merely because the model named a previously valid action key. The model response still has to pass `WorldRuntime.begin` and the finite reservation and physical executor, which remain the final authority.

`none` remains a legal abstention and may still be replaced by an ordinary autonomous purpose. No global world revision invalidates an unrelated actor's private decision. Survival reflexes continue independently during model inference, including at accelerated simulation speeds.

## Tests

`tests/client.test.mjs` tests depletion during inference, same-lot contention, unrelated private inventory changes, private belief/report revisions, simulated expiry, actor death and a deliberately unresolved model response that arrives after an urgent physical drink starts.

**Remaining issue #73 scope:** fairness and decision-quality metrics across the shared 4B inference lane; goal/observation evidence hashing rather than raw bounded JSON; model latency versus simulated clock policy calibration; privacy assertions under all future model prompt constructors. A slow mocked model is covered, but no GPU/live external model was run.
