# Receipt-backed experimental failures: first water-vessel trial

The physical action can complete without producing the hoped-for usable object. A trial returning a leaking wooden vessel is **not** a rejected command and **must not** roll back consumed inputs, time or earned practice. It is also **not** a successful manufacturing discovery.

## Initial bounded rule

The existing hollow-wood trial uses a real carving blade, one piece of wood and one manufactured cord. Its workpiece already carries material quality inherited from consumed manufactured components. A cord at grade **1/5** yields a failed tilted-stopper seal test at the final timed stage. The actor loses the consumed wood and binding, keeps the cutting tool, gains the actual crafting practice, produces no usable flask and does not learn the deliberate flask recipe. A sounder binding produces the existing finite, traceable flask. This is a deterministic first quality-sensitive trial, not a random universal discovery algorithm or a proof that the actor understands the precise cause of the leak.

The command's receipt remains `COMPLETED`: work truly occurred. The final `craft_stage` receipt contains the workpiece transition and either a new flask plus the learned method, or no output/method for the leaking result. `EvidenceMemory.record` derives the witnessed retention/leak description **only from this committed receipt**, rather than promoting arbitrary narration or a model claim into fact.

An active `water_vessel` project treats a leaking result as an unresolved practical goal. It records `TRIAL_LEAKED`, preserves other dependencies, and defers immediate repetition for 60 simulated minutes. The resident still has evidence of the failure after checkpoint restore. A later attempt with different or improved bindings remains possible only if the NPC physically obtains the materials.

## Acceptance proof

`tests/flask-method-discovery.test.mjs` contrasts grade-1 and grade-2 bindings with identical starting primitive materials, verifies all input/output custody, private method knowledge, receipt-backed partial evidence, failure-goal memory, project backoff and v3 replay. Run the full Node/headless/Windows CI and benchmark gates before merging.

## Explicitly unfinished

This first rule does not yet include wood grain, dampness, alternative seal experiments, salvageable defective objects, procedural analogy or interpersonal instruction. Avoid inferring those features from the existence of one deterministic test. Refer to #107 and #110 for the broader experimental and learning work.
