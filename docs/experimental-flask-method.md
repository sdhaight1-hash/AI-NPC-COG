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

## Need-driven acquisition (issue #110)

A resident with no flask may create a `water_vessel` project if they personally see a spring or recall a firsthand inspection, have moderate thirst (at least 45, below immediate danger), enough hydration and energy for safe work, and no active commitment. The goal is portable water security rather than a preknown object name. The planner collects finite fiber and stone, uses real timed cord-making and stone knapping, then gathers wood and performs the hollow-wood trial. A resident who already has the flask method skips experimentation and uses direct production. Existing projects are not replaced by this preference; urgent bodily needs take priority through the survival scheduler.

`tests/water-vessel-project.test.mjs` checks firsthand evidence gating, different choices for residents with and without method knowledge, and the whole empty-possession production path through authoritative receipts. It does not assert that every seed, season or unknown resource layout guarantees a flask: missing supplies may block, trigger exploration, or require deferral. This remains an intentionally bounded first demonstration, not a global technology unlock or comprehensive crafting planner.

## Bounded recovery from a blocked water-vessel project

An unavailable physical source or a failed completion remains an explicit `BLOCKED` project with a named prerequisite and an exponentially lengthening retry time (15–360 simulated minutes). The same impossible action is not scheduled every decision tick. Resource scouting is limited to four committed exploration attempts per missing prerequisite; subsequent exploratory activity must be an independently chosen ordinary action rather than compulsory project work. A newly available legal collection affordance can reopen the blocked prerequisite without resetting completed manufacturing dependencies.

While waiting, the resident may rest, drink at a real source, eat, forage, investigate, explore, or socialize. The offline scheduler does **not** start unrelated manufacturing that would consume project materials during this recovery interval. Neither the fallback nor a failed physical command grants items. Per-node scout and failure counts survive v3 checkpoint restore. The behavior is covered by `tests/blocked-water-project.test.mjs`, including a verified failed receipt after source depletion between claim and completion.

This is bounded recovery, not a complete social assistance or dynamic planning system. Further work should incorporate newly verified resource evidence, direct requests for help, and explicit abandonment or re-planning when waiting would harm survival.
