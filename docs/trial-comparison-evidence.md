# Private comparisons of physical flask trials

Scope: first executable portion of #123, following receipt-backed failed trials (#118) and private technical instruction (#120).

## Evidence, not omniscience

The final `craft_stage` receipt of each completed `hollow_wood_trial` contains the workpiece's inherited material quality and the actual state transition. Each resident privately retains a bounded trial record with its own source episode, receipt ID, simulated time, measured material quality and `heldWater` outcome. A leak consumes the physical inputs but does not grant `flask`. Missing, uncommitted, quoted, or fabricated result text does not create a trial.

A second trial that actually holds water and uses a **higher-grade binding** than an earlier failed trial creates one actor-private `inferred` comparison citing **both** distinct receipt and episode IDs. This records a correlation, not proof that binding quality alone caused the outcome. Two equal-grade failures, an uncertain verbal report, a single observed leak, or seeing someone else's result cannot create the comparison.

The comparison changes what the maker can **do**: when they later have the deliberate flask recipe and only another binding of the personally tested weak grade, the manufacturing affordance is withheld and a direct command is rejected before any resource is consumed. When both weak and stronger cords are carried, the maker chooses the higher-quality cord in the actual workpiece, which proceeds through the normal timed steps and authoritative receipts. A taught method alone does not reveal which materials fail; somebody without that private comparison can still try a bad binding, and a low-grade deliberate attempt can physically leak. The final receipt still marks the real labor `COMPLETED`, but the parent crafting goal is recorded as **failed** if no flask was produced. An active water-vessel project likewise records `TRIAL_LEAKED` instead of falsely completing its practical goal. Nothing upgrades an item, invents better materials, or mints a finished vessel.

The bounded `evidenceMemory.trials` and `comparisons` arrays persist through the v3 checkpoint; restored comparisons are accepted only when they reference source episodes and distinct trial outcomes of different qualities. A short ordinary cognitive memory notes the uncertain comparison so deliberation can retrieve it.

## Validation contract

`tests/trial-comparisons.test.mjs` checks a standalone physically completed leak, two contrasting workpiece outcomes, once-only private inference, blocked known-bad inputs without consumption, selection and manufacturing with a stronger binding, two equal-grade failures, a deliberately manufactured leaky flask that fails its goal, spoofed receipt rejection, and save/reload. Full Node/headless/soak/Windows CI is required before merge.

## Known limits

The initial model compares a single inherited **binding-grade** number and final seal outcome. It does not isolate every confounder, infer a mechanistic explanation, control wood grain or tool wear, model imperfect recall, source a conserved quantity of test water, or teach the inferred comparison to peers. The result is a bounded, conservative rule for avoiding a personally tested repeat failure, not a general scientific-invention engine. Future work should introduce a physically metered seal test and explicit choice between experimental alternatives before generalizing the inferred rule to the production catalog.
