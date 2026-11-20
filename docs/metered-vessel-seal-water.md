# Metered freshwater in wooden vessel sealing trials

Implements the explicit wet-test conservation gate in [issue #122](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/122), advancing #110 and #72.

A resident cannot finish the final hollow-wood trial or learned flask seal stage merely by standing near an invented wet-test concept. The actor must have a real, **personally visible or personally remembered/inspected spring** within 18 tiles, on the same z-level. A source sighting provides only position, not live stock. The next `craft_stage` affordance identifies its spring without revealing remaining supply.

The existing `Reservations` ledger exclusively claims **one real water unit** at the final timed stage. The ordinary world activity executor approaches the source; after completing the scheduled work and checking that the real spring is still adjacent and contains a unit, `Crafting.advance` debits `node.stock -= 1`. The successful command's world receipt records both the source-stock delta and the resulting workpiece/product/method state. A bad seal consumes the measured test unit **even when it produces no usable vessel and does not teach the flask recipe**. The test water is poured away and does not appear as carried water; `water_supply` still needs a distinct actual fill receipt.

No spring, no private source evidence, lost source stock, a rival reservation, tool loss or incomplete activity means **no wet completion**, no material or workpiece advancement from the rejected wet step, and no extra flask. Source stock regenerates only through the existing finite world regeneration rules; this patch adds no extra spawn.

When a source allocation fails, the resident temporarily sets that spring aside. Only contact with an empty spring records depletion. A remote rejection records failed access without revealing the stock or the reason for the rejection. The vessel project resumes its existing workpiece at another reachable, personally known spring. With no legal destination, it can scout under its existing four-trip limit and then backs off with a `seal_test_water` prerequisite. Searching for water consumes no replacement wood or cord.

## Validation

`tests/seal-water-conservation.test.mjs` covers a completed leak and successful seal, exact one-unit receipts, a dry source, absence of source memory, rival contention for the last unit, an unfinished seal-stage checkpoint with live reservation replay, and the same outcome across one-minute and batched simulation. Existing flask-trial, instruction, comparison, full vessel from empty hands, and scenario benchmark fixtures use existing generated finite freshwater sources. The generator is unchanged; tests never create an unmetered stock.

## Explicit limitations

- This is a *mechanically metered* wet seal test, not detailed evaporation, seepage or water-quality physics. One aggregate finite node unit is spent. It is not added to the flask.
- A known source may turn dry after a prior sighting. Reservations and commit-time physical checks still have authority. General exploration, blocked-project recovery, and personally learned source estimates are separate.
- Suspending a wet stage currently retains its existing reservation until resumed, evicted, abandoned, expired or committed, consistent with the shared `Activities` lifecycle. A future shared-resource lease policy can release and reacquire reservations without discarding partial labor; it must first guarantee single-command replay safety.
- This does not include a generalized engineering experimentation framework for food, shelter, metallurgy, crops, or machines. The field catalog remains descriptive until particular physically gated workflows are implemented.
