# Emergent World — implementation plan and acceptance contract

Status: Phase 1 foundation implemented in branch feat/emergent-world-foundation. The remaining phases below are planned, NOT implemented.

## Core rules

The world is seeded, procedurally generated, finite and toroidal in X/Y, with bounded real z-levels. It starts as natural terrain, without roads, buildings, settlements, laws, jobs, governments, land claims or prearranged cooperation. All starting humans are independent adults. Five founders appear near one another; exactly one independent newcomer appears on each first-of-month calendar boundary, anywhere on suitable land. Beds and housing never gate arrivals. Human birth is separate from immigration. Dead people do not respawn; living population can reach zero without resetting the world. The next scheduled monthly newcomer may arrive in an abandoned world.

There is no player character. A god-mode observer can follow people, inspect history and change camera/z-level. Future explicit observer interventions must be marked as external causes. The simulation code owns physics, geometry, resources, biology, time, action execution and factual event recording. Rein owns individuals' goals, subjective perceptions, decisions, conversations and plans; it cannot directly change stocks or teleport anyone. A candidate action must be validated when committed, not merely when proposed.

Law, claims, property, shared defenses, communities, factions, currency, diplomacy and war may emerge but never exist automatically. Claims are social/legal assertions, not collision barriers. Recognition, physical occupancy/control, declared rights and willingness to enforce are separate variables. Social cooperation must never receive a scripted compulsory reward or be a predefined role.

Engine-known recipes are not person-known recipes. Knowledge is individualized, evidential, teachable, recordable, corruptible and losable. Skills require practice. A model's general pretraining does not authorize execution of undiscovered technology. Personal experiences are restricted to actual observers; only books, scrolls, tablets, teachings and physical evidence can bridge knowledge across deaths and generations.

Human biology includes aging, ancestry, reproduction, development, parenting and permanent mortality. Genetic inheritance is distinct from learned memories, skills, politics and moral values. Nonhuman organisms (plants, prey, predators, monsters, decomposers and parasites) are code-simulated ecological populations, not LLM-driven decorative spawns. Rendering is Kynseed-inspired top-down pixel art; authoritative spatial geometry remains three-dimensional and should not depend on the camera or frame rate.

## Phase 1: world foundation — this change

- Seeded, periodically sampled biomes across all 80×52 cells, with wrap-aware neighbors, distances and discovery.
- Finite z substrate with deterministic cave/stone/air materials and legal connectors; full editable geology remains pending.
- Five independent randomized founders near a resource-viable region; no starter settlement or controllable human avatar.
- Monthly arrival scheduler crossing exact calendar boundaries, including skipped days; arrivals are independent of beds.
- Permanent identity and death archive; initial survival health/age pressure. This is NOT full aging or genetics.
- Discrete grid travel with simulated duration, visual interpolation, camera pan/follow, z-level inspection and observer HUD.
- First recipe privacy gate: experimentation with physical materials establishes an individual hatchet recipe before crafting.
- Versioned v3 local save; v1/v2 prototype-town data is preserved in its old key but NOT imported into the incompatible new world.
- Deterministic unit, integration and Windows installer CI regressions; actual on-device visual validation remains to be done.

**Acceptance:** seed repeatability, no starter structures, wrapped boundary traversal, five nearby founders, one and only one arrival per monthly boundary, zero-population interval without world reset, nonresurrecting archived deaths, hidden recipe until learned, physical resource debits only at completion, no player controls, and safe persistence.

## Phase 2: server-owned simulation and durable cognition

Move authoritative world state, action priority queue and clock from the browser to a local Node world runtime with durable storage. A single deterministic event ordering handles simultaneous moves, resource races, calendar events, deaths, construction and biology. The renderer becomes an observer client. Establish immutable world events with action provenance and validated witnesses; then adapt AI-RP-Program's actor-scoped memory, evidence provenance, context-budget retrieval and stale-response protection. Build a full chunked, mutable X/Y/Z grid: solids, floors, supports, stairs, shafts, rooms, mines, fluid cells, bridges, roofs and save/restore. Verify deterministic replay, model isolation and seam traversal for each z-level.

## Phase 3: survival, construction, skills and technology

Implement code-owned processes (materials, stations, duration, by-products, waste, tool wear, dangers) and individual discovery states (unknown, hypothesis, experiment, learned, practiced). Rein can propose bounded experiments but never reads the secret catalog. Meaningful learning and proficiency follow practice, mentorship, observation and durable instructions; failures can teach partial clues. Buildings must arise from sequential AI labor and materials, without magic completed prefab spawns. Room geometry, beds and shelter affect comfort and survival, not arrival eligibility. Add detailed injuries, infections, sleep, physiology, disease and nutrition with transparent gameplay approximations.

## Phase 4: ecology and nonhuman life

Start with a conserved simple food web: plant biomass, herbivores, predators, carrion, decomposers and soil. Code-driven individual fauna have perception, food/water needs, territoriality, mating, offspring, migration, illness and mortality. Remote populations can use deterministic cohorts with conservation, not spawn-on-view. Include fish, parasites and monsters through the same ecological rules. Expand hydrology and climate cycles; test resource conservation, carrying capacity, migration across toroidal seams and extinction.

## Phase 5: genetic lineages and development

Add permanent genealogy and distinct biological/social parenthood. Compact recombining genotype influences biological predispositions without inheriting acquired knowledge or reducing human personalities to genetic scores. Implement fertility, gestation, childbirth, childhood dependence, learning milestones, guardians/caregivers, adolescent development, aging and mortality. Test birth chronology, kinship, death preservation, orphan needs, learned knowledge transmission and continuity over centuries.

## Phase 6: emergent settlements, economy, law and conflict

Build affordances for possession, offers, exchange, contracts, shared labor, obligations, verified recognition, competing territorial claims and voluntary enforcement. People may form or never form settlements, families, businesses, associations, religions, governments, currencies, armies, treaties or alliances. No ownership flag blocks entry. An action may be a violation in one observer's jurisdiction but permissible under another's norms. Track detection, interpretation, compliance, noncompliance and enforcement separately. Test conflicting claims, lawless communities, intra-group divergence, faction splits, war and treaty breakdown without scripted history.

## Phase 7: durable culture and civilizational archaeology

Represent books, scrolls, tablets, maps, tool examples, oral traditions, languages, interpreters, ruins and their physical durability. A stored model dialogue is not an objective world fact. Death destroys private unshared knowledge; descendants inherit bodies/lineage but learn culture through actual caregivers and records. A god observer may inspect archived true history that inhabitants cannot know. Test successive population extinctions and rediscovery of lost technology and past political institutions.

## Phase 8: rich art, long-run profiling and release hardening

Replace rough prototype assets with an original top-down pixel-art pipeline inspired by Kynseed's environmental density, not copied artwork. Render plants, seasons, weather, creatures, modular architecture, cutaway interiors, underground views and structural changes. Profile the RTX 2060 6GB, i5-9000F, 16GB setup under real Rein inference. Benchmark latency, NPC decision throughput, GPU memory, FPS, long-run determinism, save size, and centuries of simulated history.

## Honest limits of Phase 1

The z-layer is currently a deterministic read-only geological substrate, not a complete excavatable underground ecosystem. Legacy shelters/campfires remain simple constructs; true walls/floors/rooms and multistep construction need Phase 3. Aging and health are simplified. There is no reproduction, animal population, dynamic government, physical document system or comprehensive knowledge invention yet. Browser localStorage is NOT a reliable long-term historical database. These features must not be advertised as shipped until they have code, tests and reproducible demonstration.

Implementation principle: simulation facts are authoritative, cognitive perspectives are actor-specific, and emergent societies are allowed to fail.