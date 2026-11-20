# First production-knowledge gate: hollowed wood to flask

This slice advances #107 using the behavior described in #108 without attempting to activate the whole proposed catalog.

## Behavior

- A resident may attempt **hollowing and sealing wood** with one actual wood unit, one actual cord and a reusable cutting blade. The action is not called a flask recipe to a resident who has not discovered the output.
- Three work stages consume simulated time. Input counts are debited once into the existing resumable workpiece. The final timed seal test creates one physically identified flask and adds the **flask** method only to that actor.
- The world receipt for the final stage records the new individual object, material changes and `delta.knowledge.learnedMethods`. The private evidence ledger retains the receipt. Other residents do not gain knowledge from the global catalog.
- Thereafter, `craft_flask` can be offered only when the resident knows the method **and** actually has inputs, a blade and room for the output.
- Checkpoints preserve the trial workpiece and the learned recipe through v3 restore. Existing flask physical-custody fixtures explicitly state that their test craftsperson already knows how to make one.

## Known limits and follow-ups

This is deliberately a **single successful, bounded physical trial** with existing carving and sealing stages. It is not a full general-purpose inventive search or guaranteed discovery algorithm for all catalog recipes. It does not simulate wood grain, progressive leakage or seal quality, and other starter recipes remain ungated. The next slice should use measured conditions and failures during a trial, preserve partial evidence, and support socially observed multi-stage demonstrations and explicit teaching without promoting mere sight of an object to technique knowledge.

Validation: `tests/flask-method-discovery.test.mjs`, `tests/water-vessel.test.mjs`, existing headless and benchmark suites via CI.
