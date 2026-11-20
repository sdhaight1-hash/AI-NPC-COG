# G4.3 first autonomous roofed-room project

This advances [housing objective #62](https://github.com/sdhaight1-hash/AI-NPC-COG/issues/62). It connects learned methods, finite inputs and private resident projects to the receipt-backed G4.2 construction layer. This is a **compact one-floor/one-room prototype**, not a full town planner.

## Actor-owned planning

A resident who has learned the existing shelter method, already has basic survival infrastructure nearby, is safe enough to commit work and lacks a nearby finished room may choose the new `home` goal. The decision scans only an immediately accessible five-cell footprint and refuses occupied, flooded, predesignated or resource-occupied sites. No pre-populated buildings, resources or authoritative roof state are granted.

An eight-simulated-minute `design_home` action uses the ordinary activity/receipt path. **Only on completion** does `Construction.designHome` place six blueprints as a single validated group: one floor, three perimeter walls, one open doorway and one roof. Their creation is captured as an exact `constructionBlueprints` change in `WorldReceipts`. Site rejection leaves no partially created plan or spent goods.

## Autonomous material work

The `Projects.home` graph records its original evidence and exact site separately from its executable dependencies. It selects legal `build_tile` work when a real owned blueprint and its materials are available; otherwise it gathers actual finite wood or fiber through the regular physical world operations, with bounded backoff and survival-safe fallbacks while blocked. Existing individual tile work claims one material lot, works for 18 simulated minutes, and completes through a single authoritative receipt. Roof can be made only after finished support exists; a complete perimeter, door, floor and roof are necessary before `Construction.sheltered` returns true. A checkpoint stores project site, pending plans, built tiles, time spent and reservations.

Existing legacy single-object shelter construction remains available to keep early survival viable until migration and autonomous housing survival across many seeds is measured.

## Known limitations

- A one-room plan is not a learned architectural style, multiroom design, structural engineering or material optimization. Site checks are local and intentionally simple.
- A project is individually owned. A second resident does not yet volunteer, supply a jobsite, teach building knowledge or inherit a dead builder's job.
- No roof above an elevated floor, active doors, storm infiltration, demolition, decay, communal housing rights, plots, zones or furniture system.
- Receipt-backed completed tiles currently require their original matching log receipts during reload; indefinite worlds still require durable compact construction proof across the receipt ring's 4096-event eviction.
- Full multi-seed autonomous survival, verified ownership/hauling and browser GPU profiling remain separate gates. Do not close #62 based on this milestone.

Tests in `tests/autonomous-house-project.test.mjs` cover unknown-procedure denial, real eight-minute design evidence, six finite tile jobs after zero-possession collection, completed envelope and exact consumed materials, and checkpoint replay halfway through construction.
