# First voluntary multi-resident construction logistics

This is a small actor-initiated cooperation step for [G4.3 housing #62](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/62) and finite custody [#26](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/26). It does not invent a shared NPC inventory, telepathic job assignment or a central faction labor planner.

## What permits an offer

A healthy resident physically holding spare wood/fiber can choose a new timed `give_wood` or `give_fiber` action only after **witnessing actual completed building work** by a nearby home-project owner, seeing the owner in person, and identifying further unfinished construction. An unbuilt hidden blueprint or private NPC project alone is not exposed to the helper. The donor chooses whether to spend their own time/material using their existing personal utility and social motivation; a new role is not assigned by the world.

The physical builder accepts only if still alive, nearby/on the same level, still carrying out that home project, not in critical thirst or hunger, and able to physically carry the contributed material. This is a bounded provisional willingness rule, not a modeled social contract or a verbal agreement.

## Material custody

The donor's *own personal inventory lot* is reserved for the two simulated minutes of travel and transfer. `WorldReceipts.execute` then simultaneously debits one unit from that donor and credits one real unit to the recipient. The physical receipt contains the donor's inventory debit and the **other actor's inventory credit**; no blueprint can mint goods, no material appears before the completed exchange, and failed/expired/canceled claims never increase stocks. The construction project may subsequently use its recipient's real carried material in an independent receipt-backed tile job. No automatic friendship or organization is created from the gift.

## Validation and deferred work

`tests/voluntary-construction-help.test.mjs` proves no unauthenticated construction intent is exposed to a remote/unsighted donor, donor and recipient stock changes plus subsequent consumed tile, mid-transfer checkpoint and claim preservation.

This is not yet task delegation, cooperative workpiece authorship, site storage, cargo routing from a distant crate, item-lot provenance all the way from harvested source, negotiated terms of ownership, or independent helpers building someone else's wall. Those are separate gate requirements of #26/#62 and should not be counted as delivered by this material sharing action.
