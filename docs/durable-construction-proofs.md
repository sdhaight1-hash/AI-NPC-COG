# Long-lived construction proofs after receipt-ring eviction

Issue #61 requires that a physically completed building survive save/load for an indefinite simulated lifespan. The world event log intentionally retains only the most recent 4,096 receipts. Prior to this change, `Construction.restore` required each finished tile's original `build_tile` receipt still to be present in that ring. Consequently, normal world activity could make an old valid wall or roof disappear on reload even though the physical building had not changed.

## Durable construction audit

- `WorldReceipts.execute` remains the only path from a timed legal building action to a completed physical `world.construction.tiles` record. It still debits exactly one required carried wood/fiber lot through the action kernel, and the event receipt records the tile addition.
- After a **successful completed** tile action, `Construction.recordProof` retains a bounded copy of the exact material debit, tile addition, actor, project target, command ID and timestamp in `world.construction.proofs`. This evidence is created at commit time, not recomputed from a visible drawing or user claim.
- When loading v3, the restore validator checks each tile against the compact archive or a still-present completed receipt and requires an exact matching tile, actor, command, time and material debit. A changed proof or mismatched command is rejected. The new archive is reconstructed on restore from old valid v3 save receipts when missing.
- Maximum archive size is the existing maximum of 512 constructed physical tiles. Event log ring eviction no longer automatically destroys valid old buildings. No extra materials or finished items are created on checkpoint.

## Scope and integrity limits

This is **self-consistency and provenance validation inside the saved simulation state**, not cryptographic anti-cheat. Both the archive and the legacy event log reside in client-controlled save data; an attacker who fabricates an internally consistent save can still lie about history. Cross-save cryptographic attestation would require an external trusted authority, which is not part of this offline simulation.

No hauling custody ledger, demolition, fire/damage history or structural repair logic is added here. These will need proof lifecycle rules before destructible buildings launch. A valid legacy structure remains separate from tiled construction.

`tests/durable-construction-proofs.test.mjs` creates a real timed tile job, evicts its original event from the 4,096-record ring with later decisions, reloads it twice, rejects altered material receipts and forged command IDs, and migrates the old live-receipt-only save transparently.
