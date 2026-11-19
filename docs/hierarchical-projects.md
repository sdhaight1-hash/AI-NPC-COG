# Hierarchical embodied projects (G1.3)

## Authority and invariants
An NPC has private `project` state and a bounded `completedProjects` history. A project graph describes desired world predicates, prerequisite edges, runnable action keys, attempt counters and blocked reasons. No node directly adds inventory, structure, knowledge or skill. Physical effects remain behind `WorldRuntime.begin`, `AgentWorld.complete`, the finite `Reservations` ledger, `Crafting`, and `WorldReceipts.execute`.

`Projects.next` is deterministic and accepts only current legal `AgentWorld.available` options. It never sends commands to the renderer or model and never treats generated narrative as verified progress. A completed action contributes to `completedActions` only after authoritative completion. Intermediate `craft_stage` receipts count as physical work, including the eight shelter construction stages.

## Dependency lifecycle
- `requires` edges are validated as a bounded DAG. Cycles, duplicate node identifiers and missing dependencies fail validation.
- Nodes are evaluated against actual inventory, learned shelter/campfire methods and owned/nearby structures. Inputs may reopen after consumption or loss. Acquired knowledge remains learned. Workbench ownership is tied to a real structure's `maker` field; moving away cannot manufacture a new need for an already-built bench.
- `BLOCKED` records include the exact unavailable action or failed world effect. `nextAt` bounds retries. If a legitimate source or prerequisite reappears, the project retries rather than wiping completed nodes.
- Survival instinct can interrupt a project activity. The activity subsystem owns remaining time and command identity; reservations protect finite held inputs. The project is not cancelled by the interruption.
- When a project finishes, it remains inspectable. At the next autonomous decision boundary it is archived in bounded `completedProjects` and a new goal can be selected.

## Implemented templates
`shelter` obtains wood and fiber, discovers the shelter procedure through legal experimentation, replenishes spent bindings and executes `craft_shelter` as eight timed stages. `campfire` gathers materials, discovers the process and builds a real campfire. `workbench` manufactures cord before building a bench. `storage` assembles a multi-recipe supply chain: cord, bench, knapped blade, hafted hatchet, split planks, bound crate, path to an available placement site and placement.

World predicates (not generated prose) determine terminal success. The presence of a valid project never makes an unavailable action legal.

## Validation
The CI suite runs browser smoke tests, 10,000-minute headless replay, the thirty-day simulation soak, full Node tests and Windows installer-script checks. Focused `tests/projects.test.mjs` covers graph validation, distinct personality preferences, blocked unknown recipes, durable checkpoint recovery, shelter production, thirst interruption, finite workbench and crate construction, lost-tool repair, completed-project archiving and persistence. `tests/crafting.test.mjs` validates learned eight-stage shelter manufacturing.

## Known limitations
This is a bounded deterministic HTN-style planner, not open-ended language-generated planning. Crafting's older recipe catalog still models some procedural methods as initially available; explicit discovery is enforced for the new shelter method and for legacy shelter/campfire construction. Storage hauling continues to use the existing real path/time-bound crate/cache substrate. There is not yet a distributed multi-actor work-order scheduler, social delegation, universal item provenance graph or a general symbolic theorem prover. Connected model inference may propose only validated world actions; projects execute through the shared physical runtime.
