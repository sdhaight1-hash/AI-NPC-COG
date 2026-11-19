# Final pre-code research II — Physical inventory, ownership, conservation and migration

**Reviewed:** 2026-11-19. **Status:** Smallest viable data/transaction contract, **not implemented**.  
**Baseline:** `main` at `32318081588a805d51ac31e0f3e31c91f4291c11`.  
**Tracking:** [#26 finite resource reservations and hauling](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/26), [#61 construction tile jobs](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/61), [#63 survival](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/63), [#72 resource cycles](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/72).

## 1. What real implementations teach us

- [Cataclysm: DDA item definitions](https://docs.cataclysmdda.org/JSON/ITEM.html) have volume, pocket mass limits, watertight suitability and encumbrance properties. [item_pocket.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_pocket.cpp) actually validates pocket/container rules, supports item stacks and tracks capacity. Its full item-pockets complexity is **not required** to obtain our first correct inventory.
- [Cataclysm: DDA player activity](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/PLAYER_ACTIVITY.md) distinguishes a resumable activity from its cancellation cleanup. This is important for workpieces holding consumed inputs and for reserved logistics.
- [Phaser inventory API](https://www.phaser.io/packs/inventory/api) is useful as a small reference: `transact(operations, preview)` applies operations to a candidate copy, checks capacity/weight/equipment, then commits **all or none**. It is an external commercial extension's specification; **not evidence that our implementation currently behaves atomically**.
- [Microsoft PlayFab inventory overview](https://learn.microsoft.com/en-us/xbox/playfab/economy-monetization/economy-v2/inventory/items-and-inventory-overview) distinguishes definitions, unique instances, stacked quantities, transfer operations and transaction IDs. Networked marketplace concerns are mostly out of scope for a single-player local simulation.
- The user's [Voxel-Survival conserved-water implementation](https://github.com/sdhaight1-hash/Voxel-Survival/blob/main/src/hydrology.rs) is especially relevant for physical conservation: liquid quantity and reservoir accounting are separate from graphics.
- Classic game inventory is not a model for social/moral ownership: the NPC physically holding an item may be its custodian, while a person or community **claims** it belongs to them. Our physical ledger must represent location/custody objectively; claims, law, theft and promises should remain social beliefs and witnessed agreements.

## 2. Code-grounded shortcomings of today's AI-NPC-COG

- [`AgentWorld.newAgent`](../public/emergence.js) grants each new person food:1 and water:2; [`Biology.create`](../public/biology.js) creates an equal number of named pantry portions. **New residents must start with zero possessions**; biological hydration and metabolic energy stores are not inventory.
- [`AgentWorld.complete`](../public/emergence.js) increments item-category counters on gather and allows up to 1,000 units of wood in inventory. Water is gathered as a counter without a physical vessel and consumed by counter; only wood has limited ground-item identity. The code has distinct store/create/pickup paths, not one canonical item location.
- [`Crafting.begin`](../public/crafting.js) removes inputs and creates a `workpiece`; final steps generate `craftedItems` and inventory counters; crates have a count-based capacity instead of independent mass/volume. This is a useful real staged-work precursor, but currently multiple representations of the same thing can diverge.
- [`Reservations.claim`](../public/reservations.js) prevents oversubscribing category stock with a command ID, but does **not** move the reserved mass and does not commit custody changes. The physical ledger must treat reservation as a *claim against* actual stock, not a second owner.
- [`WorldReceipts.execute`](../public/receipts.js) checks deltas after calling a mutating callback. If a callback throws or returns failure **after partially mutating world state**, the code throws but does not roll the mutation back. An atomic physical transaction therefore needs upfront validation plus a single commit, not merely a postcondition exception.
- [`WorldReceipts.committed`](../public/receipts.js) looks only at the bounded last 4,096 receipts. This is adequate for short-term audit UI, but **not a permanent deduplication authority for arbitrary replay of old commands**. Monotonic command IDs and durable resolved-command checks are needed before expanding transaction use; do not treat the bounded display log as a complete event-sourcing journal.
- [`Civilization.die`](../public/civilization.js) archives then removes the resident; physical carried objects do not yet have a complete death/remains disposition. This is a physical loss/conservation issue independent of the social and emotional consequences.

## 3. Decision: one item/lot custody authority, no generic ECS rewrite

Separate immutable **definition**, mutable **physical lot/instance**, **placement/custody**, **reservation**, and **social claim**.

```ts
ItemDefinition {
  kind, unit, massKgPerUnit, volumeLPerUnit,
  phase: 'solid'|'liquid', stackable, canUseBareHands,
  // only for containers:
  capacityKg?, capacityL?, liquidTight?, openingLimitL?
}
PhysicalLot {
  id, kind, quantity, quality?, condition?, createdByReceiptId?,
  location: {type:'actor_hand'|'actor_container'|'ground'|'structure_container'|
                  'workpiece'|'world_source', id, slot?},
  provenanceId?, revision
}
Reservation {
  id, commandId, lotId, quantity, actorId, expiresAt,
  state:'active'|'consumed'|'released'|'expired'
}
SocialClaim { claimantId, lotId, reasonEvidenceIds[], assertedAt } // actor knowledge/social layer ONLY
```

**Important:** A lot is not a social property owner. `location` is physical custody, not a claim of legal permission. Every existing volume of actual physical material must be represented exactly once. A stack of fungible rock portions may use one lot identity; a specific quality hatchet or waterskin should be a unique instance.

### Explicit type distinction: water source vs container vs metabolism

A spring/water reservoir owns its **liquid stock** in physical water units (recommend **mL** for drinking and carried liquid). A waterskin owns a finite, liquid-compatible storage pocket; the water amount is a contained water lot. The actor's `bio.hydrationBudgetMl` is an internal physiological variable, **not** a portable inventory container. Drinking at a spring can transfer water into body directly (at legal proximity and activity time), while filling a waterskin transfers source stock into a water lot owned by the vessel.

We can simplify the first slice to exactly **one liquid type** and **one capacity per vessel**, with mass and volume conservation. Do not add fluid mixing, pressure, chemistry, hygiene or complex nested bags before tests require them.

### One material may have different forms

The existing recipe `2 wood -> 3 planks` cannot be validated using **quantity conservation alone** because type/units transform. Conservation of ordinary physical mass/volume must allow *documented loss, waste or densification*: input mass = finished product mass + explicitly recorded waste (subject to a tolerance/rounding policy), while simple same-kind transfers conserve both quantity and mass exactly.

**Do not use item count as material-mass conservation.** Track a conversion receipt with input lot IDs, output lot IDs, yield coefficients, waste/scrap destination and full provenance.

### Hand/volume/mass policy

- Empty-handed adult has bounded hand slots and a physiological *carried mass* limit; **no starting bag or waterskin**.
- No carried liquid without a watertight vessel.
- An actor can carry a single heavy load in hands but may have insufficient free hands for tool use or climbing.
- Large, low-mass bundles can fail **volume/shape** limits. Dense rocks can fail **mass** limits. The same character can be overburdened without being completely unable to move; define penalties distinct from hard pickup refusal.
- An object dropped due to load exists on a legal ground tile; occupied hands are not infinitely extendable.
- Containers have fixed capacities; a bag changes feasible stowage volume, **not** muscular strength.
- A crafted workpiece's inputs remain real, claimed physical content within the workpiece or explicitly recorded input consumption, not in the builder's pocket.

## 4. Atomic transactions: minimal API proposal

```pseudo
transfer(commandId, actorId, inputs, outputs, expectedRevisions):
    if resolvedCommandId(commandId): return priorOutcome
    verify actor alive; path/distance/legal activity; available lots & holds
    verify all input lot IDs, quantities and expected revision
    verify destination body/container mass, volume, hands and liquid suitability
    verify exact source/destination custody + resource conservation
    candidate = buildIntendedChangesWithoutMutatingWorld()
    if invalid(candidate): return FAILED with **zero world changes**
    apply(candidate)   // one synchronous authoritative commit
    record completedCommandId + receipt + newly changed stock revision
    return receipt
```

Within one synchronous JS simulation, there is no need for a distributed database transaction. But the **function must be all-or-nothing by construction**. Keep the current `WorldReceipts` envelope for external observability; don't rewrite it as an entire event-sourced database now.

**Split/merge:** splitting a lot creates a new stable ID with `parentLotId` provenance; merging compatible fungible lots records both inputs and retained/new ID deterministically. A location change without kind/quality change should preserve stable identity where possible. Never copy one object to two locations to show it both in hands and crate.

**Reservation expiry:** a reservation holds the right to consume a portion, *not the physical material*. On interruption, release/renew according to activity stage; expiry must not silently refund already-consumed materials. On death, release outstanding claims and physically drop or attach possessed objects to remains, preserving owned lot IDs.

## 5. Migration: new spawn empty, historical saves lossless

1. Snapshot the old v3 save before conversion; reject malformed data without partially changing live state.
2. Convert each old `n.inventory[kind]` to exactly one or more newly identified physical lots located in actor custody. Use `bio.pantry` **only to annotate the types of the same existing food portions**, not create extra food. Reconcile discrepancies conservatively, with an explicit migration diagnostic.
3. Convert existing crate/cache contents and real ground objects to distinct lots; do not duplicate numeric counters and `craftedItems` as both separate instances.
4. Convert unfinished workpiece inputs without refunding them to inventory. Retain active command/reservation IDs, partial work progress and maker/provenance.
5. **New founders and newcomers have zero possessions** after migration code exists. Already played saves keep all legitimate acquired material.
6. During transition, `n.inventory` must become a **derived read projection** of the authoritative lot store. Temporarily preserving compatibility is fine; **dual writes are not**.
7. Version the new physical-lot schema and make migration **idempotent**, with deterministic IDs and save/reload tests.

## 6. Test gates before G4.2

| Test | Expected invariant |
| --- | --- |
| New founder/newcomer | Physical inventory empty, hydration and physiological reserves intact |
| Drink from spring | Actor adjacent, real finite source debited, body hydrated, no inventory water minted |
| Fill waterskin | Real vessel exists, water mL fits, source debited, total water conserved |
| Fill without vessel | Specific `NO_LIQUID_CONTAINER` refusal, no stock lost |
| Pick up stone/fiber/log | Each limit (mass, volume, occupied hands) independently enforced |
| Move/haul/store/death | Each lot exists at one location; exact path/time and source/destination receipts |
| Two actors reserve same material | Never overclaim or duplicate, even after interruption, expiry and race |
| Failed transaction/throw | Physical state unchanged and failed receipt records why, no partial mutation |
| Craft conversion | Stage inputs, outputs, scrap/waste mass, quality and provenance accounted for |
| Save migration | Old legitimate food/tools/stores/workpiece not duplicated or lost; second restore idempotent |
| Long receipt retention | Old resolved command cannot be reexecuted after 4,096 new audit receipts |
| Physically impossible access | No transfers across impassable tiles, z levels or unseen/private locations |

## 7. Implementation boundaries

**First vertical slice:** item definitions for wood/stone/fiber/edible portion/water/vessel, canonical custody, direct-source drinking, mass+volume+hands, zero-inventory new spawn, atomic movement of basic lots and back-compat save. Existing recipes/legacy materials may be adapted incrementally via the projected inventory view.

**Not yet:** fully generic nesting/pockets, equipment rarity economics, NPC property law, liquid mixing, procedural chemistry, spoilage rates for all items, elaborate encumbrance injury, multiplayer/network locks or a single universal materials pipeline.

**Decisive rule:** if item accounting requires the LLM to decide how many liters a bag holds, the boundary is wrong. The LLM can decide *why* it wants the water and whose request to honor; physics decides how the water can move.

## Implemented prerequisite — direct freshwater consumption (2026-11-19)

[PR #79](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/79) introduces `drink_source`: a physically timed, reachable freshwater-node action that reserves one finite water-source unit, debits it only on completed consumption and restores an actor's bodily hydration **without creating portable inventory water**. Tests cover lawful source consumption, depletion mid-action, and pending-action v3 save/restore.

This is a prerequisite for **zero-possession spawning**, not that final feature. Today's founders/new arrivals still receive initial carried food/water and the legacy `fill_water` action can still create carried counter-based water without a physical vessel. Do **not** claim that #26's physical inventory or water-container requirement is complete. The next authority change must replace portable water counters with actual vessel-compatible physical lots **before** switching new NPC spawns to empty inventories, then rerun multi-seed founder survival.

## Implementation checkpoint — live-command authority beyond receipt retention (2026-11-19)

[PR #84](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/84) addresses a narrow identity-replay gap: `WorldReceipts.execute` previously relied only on the bounded recent 4,096 receipts to identify committed commands. Now an effect may execute only while the matching command key, target and command ID are **still the actor's active physical task**, and the actor still exists and is alive. A replayed callback cannot mutate world effects after the task was cleared, even after the original receipt has been evicted from audit history.

Tests prove both that (a) an old completed water-gather action cannot mint a second water amount after 4,101 unrelated decision receipts and (b) a *legitimately active* task still finishes even if its ACCEPTED audit receipt has been evicted. The existing receipt delta/history format and persistence v3 schema stay unchanged.

This is **not** a global durable transaction log, rollback after partially mutating exceptions, or protection from maliciously forged local saves that fabricate both actor tasks and world records. Full canonical item-lot transactions remain #26. It is a minimal correctness guard in the current single-process authoritative action model.

## In-progress recovery invariant — stale activity reservations (2026-11-19)

The mineral-scarcity survival diagnostic in [PR #83](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/83) exposed a concrete liveness failure: an expired material claim on a suspended activity blocked **every** fresh attempt to carry out the same lawful action. The tested corrective rule is: when an actor deliberately retries an activity whose original reservation is invalid, remove **only the stale suspended activity**, release its residual reservation token, keep any physically consumed workpiece intact, then acquire a **new command ID and legitimate stock claim**. A valid suspended claim must continue with the original command ID and exact remaining work. This is the first exercised claim-expiry recovery, not full canonical physical item ownership or transactional rollback.

## Implementation checkpoint — zero-possession creation (2026-11-19)

[Issue #85](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/85) / [PR #86](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/86) change `AgentWorld.newAgent` to initialize **every** inventory counter to zero for original founders and monthly arrivals. `Biology.create(index,n.inventory.food)` therefore seeds no pantry ration; normal internal hydration and caloric reserves are physiological and remain intact. A direct freshwater action can already drink from finite source stock without a vessel or minting portable water (#79). This patch preserves historical, acquired version-3 food/water/wood in save/restore and does **not** remove any legitimate older resident's holdings.

**Known temporary inconsistency:** legacy `fill_water` still creates portable water-counter units without an actual watertight vessel. That must be replaced by a canonical material lot/container transaction in #26; a character starting with nothing is not proof of physical carry capacity, encumbrance, vessel validity or fully conserved hydrology. Do not mark those features complete based on this narrowly scoped spawn rule. The strict 7-day survival and 30-day soak gates remain unchanged.

## Implementation checkpoint — mass and volume as a read-only load view (2026-11-19)

[Issue #87](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/87) / [PR #88](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/88) add deterministic `AgentWorld.carrying(n)` and `AgentWorld.roomFor(n,kind)`, **pure calculations on the existing authoritative numeric `n.inventory`**, with an explicit item-definition table and two independent bounded budgets: 32 gameplay kg and 45 L of loose carried bulk. This models an armful/carry envelope, **not** a fictional bag, free hand slots or a physical liquid vessel. No secondary mutable item state is created. Five tests cover zero load for fresh residents, dense-stone versus bulky-fiber limit differences, practical early construction ingredients, invalid/unknown item values, and unchanged measurements after v3 save/restore.

**Not yet enforced:** these functions currently report candidate capacity and overload; harvest, pickup, sharing, crafting and crate withdrawal must be wired to check them at physical commit points before these numbers become **actual** limits. Older saves may retain heavy acquired items. No encumbrance speed effect, hands, canonical item lots, containers or mass-conserving recipe conversion is implemented by this read-only slice. Future inventory-related work must use this interpretation as a temporary validation aid and avoid copying inventory counts into a second authority. Track remaining physical authority under #26.

## Implementation checkpoint — enforce mass/bulk for physical acquisition (2026-11-19)

[PR #89](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/89) builds on the read-only `AgentWorld.carrying/roomFor` foundation in #88 and adds **actual preflight enforcement** at all current high-level ways raw or crafted counted inventory is acquired: harvesting, loose ground pickups, cache withdrawal, crafted-crate withdrawals, cooperative food transfers and final crafting output. Reservations for harvesting claim **only quantities that physically fit**. If space disappears before completion, the authoritative action fails **without** stock deduction, food-pantries changing, completed tool creation or a duplicated workpiece. If work output does not fit, the real multi-stage workpiece remains at its final checkpoint for a lawful later retry.

To avoid making high-volume burden a death trap, stone and fiber can be set down as unique, saveable `world.items` ground objects with action durations and receipt deltas, just like preexisting dropped wood. The deterministic hunger instinct may choose to unload raw material when no food and no feasible forage action exist. Test fixtures check mass-only versus bulk-only blocks, partial harvest/claim accounting, changed capacity mid-task, food sharing recipient bounds, storage withdrawal, ground-item save/reload/pickup and a blocked final crafting stage.

**Limits still not claimed:** the 32 kg / 45 L figures are gameplay bounds applied to an actor's legacy category counts, not a physiological scientific model; their armful bulk estimate is **not a backpack or hidden storage compartment**. This is still *not* an authoritative globally unified item-lot ledger: numeric counts remain canonical for carried goods and individual world-item IDs remain physical only while dropped. Encumbrance mobility penalty, hands, physical vessels for legacy water carrying and mass-conserving recipe transformations remain work under #26. Old saves may legitimately restore overweight and must remain allowed to drop/store contents.

### Integration finding: finite cargo exposes station-recall failures

With 32 kg / 45 L bounds, previous storage benchmarks that seeded **9 wood + 4 stone + 12 fiber** or **14 wood + 8 stone + 18 fiber** on one resident were physically impossible; those *test fixtures*, not real recipes or capacity limits, were reduced to practical seed loads. The actual project planner then gathers additional stock over time, and the ordinary 37-step storage chain still completes.

This revealed a genuine cognition / world routing seam: after tool loss, the actor fetched replacement supplies and ended up ~38 toroidal tiles from their previously constructed workbench. `Crafting.options` discarded the workshop because its station search only considered a radius of eight; `Perception.filterAffordances` also required immediate sight or an explicit observation ID. A maker now retains the location of a station **they personally constructed**, and can plan a physical travel route to it. A distant unobserved station constructed by someone else remains inaccessible without personal evidence. The action still needs proximity to the real station when completed. A separate counterfactual test and lost-tool repair integration test guard both rules.

**Important:** this is memory of an actor's own *physical construction receipt/maker marker*, not a new legal ownership claim, global omniscient object awareness, free teleportation or a background LLM call. This behavior belongs to known-method project repair, not a new cognition scheduler.

## Implementation checkpoint — crafted physical water vessel (2026-11-19)

[Issue #91](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/91) and [PR #92](https://github.com/sdhaight1-hash/AI-NPC-COG/pull/92) introduce a deliberately small **manufactured wooden flask** for carrying water. Three time-costed `Crafting.RECIPES.flask` stages require one source-gathered wood unit, one manufactured cord and an existing blade tool, producing a real persisted crafted item with identity/quality metadata. Creation **does not** produce any liquid. The carved body and fitted stopper are the gameplay approximation of a primitive portable bottle; research references include archaeological wooden vessel stoppers in [Medieval York](https://collections.yorkarchaeologicaltrust.co.uk/files/original/74502/GB2837-PUB-AY-17-13_Wood-and-Woodworking-in-Anglo-Scandinavian-and-Medieval-York_C-A-Morris_web.pdf), and documented [organic water containers](https://pmc.ncbi.nlm.nih.gov/articles/PMC7343145/). These references establish plausibility, **not** proof that an unsealed piece of wood is watertight.

- A flask holds **two existing 400 mL source units (800 mL)**. `AgentWorld.vesselRoom` and `AgentWorld.roomFor` jointly gate the `fill_water` affordance, stock intention, finite source reservation quantity and actual physical effect commit. The world spring is debited only by a completed timed action, exactly equal to gained units. If the vessel disappears while filling, commit fails without adding water or reducing spring stock.
- Direct `drink_source` remains available to empty-handed residents; personal memory and hearsay about a spring may motivate **direct** source drinking without inventing a vessel, subject to physical travel, perception and confidence rules. The actor cannot know unseen live stock. A dry firsthand direct-drink failure can mark their own matching hearsay stale.
- Historical v3 saved carried water can still be drunk even without a recognized flask, but the owner **cannot manufacture more water** using `fill_water` until a real flask is crafted. Save/restore of a crafted flask retains its physical crafted record, count, and water units.
- The new `flask` kind is counted in current mass/bulk constraints (0.6 kg / 1.2 L empty, plus separate contained water mass/bulk), with **no starting gear**. This is a real container-capacity gameplay constraint; **not yet** a globally canonical unique per-container water lot or hand-slot authority.

**Still open under #26:** typed contained-water lots with custody and provenance; one flask may not be destroyed/stolen/dropped independently of its contents until a general item operation is added; historical numeric water needs deterministic lot migration; leakage/decay, suitable sealant methods, hand occupancy and encumbrance speed need later evidence and tests. No LLM call is needed to decide capacity or source debits.
