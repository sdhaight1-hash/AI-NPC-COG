# G4.2 physical tile work — authoritative first slice

This implementation takes [the G4 architecture](construction-g4-architecture.md) beyond blueprint declarations. It does **not** claim the entire multi-resident housing and cutaway system is complete.

## Pipeline

`Construction.plan(world, kind, tile, actorId)` still creates a zero-cost, non-solid blueprint. A builder who has *personally learned the existing shelter method*, holds the required material, and can reach their own site receives a `build_tile` affordance. The physical executor claims **one blueprint slot and one unit of the real carried material** through `Reservations`, carries out **18 simulated minutes** in `Activities`, and then commits through `WorldReceipts.execute`. A floor, wall or door uses one wood unit; a roof uses one fiber unit for thatch. The material is consumed only at successful work completion.

A `world.construction.tiles` record includes the blueprint ID, builder, exact coordinates, time and command ID. `WorldReceipts.snapshot` now includes these tiles, so a completed `build_tile` receipt records both the inventory debit and the tile addition. A command cannot commit twice; a rival reservation cannot take the same pending blueprint; a blocked or interrupted task leaves the intended tile unbuilt and releases/retains its claims through the existing activity lifecycle.

An actual wall (not its blueprint) blocks `Frontier.traversable` and the navigation and sightline projections. Doors are open passages. Roof work requires **completed** same-level barrier support, not another plan. A wall cannot be built on top of a resident. On committing a tile, the navigation component cache is invalidated. This is a gameplay rule, not a graphical convention.

## Checkpoints

Existing v3 saves retain their structure. A finished tile is restored only when its command is present as a matching `COMPLETED build_tile` world receipt with a corresponding tile-addition delta and exact material debit. A forged tile without that proof is rejected. Planned tile records are still validated for location, uniqueness, owner, and roof support. Old v3 saves without a construction layer load with empty plans and tiles. A builder's unfinished timed work, resource claims and blueprint survive the ordinary checkpoint codec.

## Limitations and next dependencies

- This is a **resident-owned tile job**, not yet an autonomous house planner. NPCs do not spontaneously designate multiroom blueprints; that belongs to #62.
- Roof support is a one-tile structural predicate, **not** full load distribution or weather enclosure. Legacy `shelter` objects are still supported and still provide legacy-radius shelter benefits until the actual room-enclosure step in #61.
- The renderer needs the intended layered wall/floor/door/roof cutaway projection and in-world progress art. The authoritative simulation and draw code remain separated.
- The world event log is bounded to 4,096 receipts, so the current strict save validator needs a **durable compact construction-proof archive** before very old, heavily developed buildings can reliably survive indefinite checkpoint compaction. Do not close #61 until that and the roof/render/shelter tests are addressed.
- Physical input provenance can follow harvest and transfer receipts, but independent haulers, delivery sites, shared construction roles, demolition and structural decay remain future milestones. These must not be silently inferred from the first tile action.

## Regression evidence

`tests/physical-construction.test.mjs` tests zero-effect plans, timed exact-once floor commitment with material receipts, barrier collision vs door passability, physical roof support, same-plan reservation contention, interruption/checkpoint replay, saved completion proof and rejection of forged tiles. Existing construction, reservation, receipt, time partition, and client tests run in the complete CI gate.
