# Portable-water supply recovery

The `water_supply` project, introduced after the physical `water_vessel` manufacturing project, requires **two actual water units inside a carried flask**. Discovering a recipe or knowing a spring exists never creates liquid. In the previous implementation, an unavailable `fill_water` action could send this project into unlimited directed exploration; a blocked project also prevented normal offline decisions.

This change extends the existing bounded water-project recovery contract to **both** `water_vessel` and `water_supply` rather than introducing a second scheduler. An unavailable source now yields a named `BLOCKED` prerequisite, retry backoff from 15 to 360 simulated minutes, and at most four *completed* project-directed scouting excursions. Merely proposing exploration, or rejecting an attempted move, does not consume that exploration allowance. While waiting, ordinary survival, exploration, inspection, and safe social choices remain possible without consuming materials for unrelated manufacturing.

A subsequently accessible, personally known spring may satisfy `fill_water` through the existing reservation and world-receipt executor. The source loses the amount physically contained; another resident cannot consume water already reserved by a rival. A refused start updates project failure state without claiming a completed physical operation. Existing v3 persistence retains the project, failed prerequisite, retry timestamp, and bounded counts.

Project retries request an affordance scan only when their backoff expires. The project still reconciles already-completed prerequisites during the wait, so outside actions can satisfy physical requirements without repeated visibility and path queries.

The browser scheduler uses the same bounded choices as headless simulation during a water or housing project's backoff. A resident can forage, rest or attend to other immediate needs without releasing their project or requesting a separate model review.

## Winter survival

Issue #146 reproduced a death on seed 431117, winter day 82, even though the resident rested within walking distance of a spring. The terminal trace showed hunger and thirst at 100, zero hydration, severe exhaustion, and repeated rest decisions.

Residents now retain up to 12 private freshwater landmarks they actually see while moving. An exhausted resident can attempt to drink directly from a remembered spring with a legal route within 18 tiles. The sighting carries no stock information. Arrival, reservation, and the drinking receipt determine whether the attempt actually delivers water. Current sight and recent depletion still govern what the resident can act on. Accepting rest once leaves recovery to physiology until conditions change.

## Verification

`tests/blocked-water-project.test.mjs` checks missing-source backoff, interrupted or failed scouting not counted as travel, bounded attempts, checkpoint restore, survival fallback, real recovery when freshwater is reachable, and two-person reservation contention. Existing `tests/water-vessel-project.test.mjs` covers the complete empty-hand craft → physical fill → off-source drinking path, and the headless production benchmark covers conserved inputs and actor-private manufacturing knowledge.

## Deliberate limits

This is *bounded recovery* rather than omniscient resource search. Personal observation and physical access remain required, and a spring could remain depleted long enough that the resident must find another source or abandon the project in a future planning feature. The four-scout limit is an operational budget, not a claim that all terrain is reachable or that every attempted route yields new information.
