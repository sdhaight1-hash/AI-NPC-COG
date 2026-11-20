# G4.2 enclosure-based shelter rather than hut sprite proximity

A constructed tile is not, by itself, a livable room. This increment evaluates actual committed building geometry each time `AgentWorld.stepNeeds` applies environmental pressure.

`Construction.sheltered(world, actor)` starts on the actor's same-level **completed floor** and checks that every connected interior floor cell has a **completed roof**. The bounded (maximum 64-cell) toroidal flood respects existing completed walls and doors as room boundaries. Every exposed edge must touch a real barrier and the room must have at least one door. Blueprints, unattached roof segments, an exterior wall, and a roof with a missing section provide **no physical shelter**.

The result is passed to the pre-existing `Biology.advance` sheltered flag and determines weather-related energy loss and rest recovery. No extra proximity aura is added for tiles. Legacy one-object shelter buildings retain their existing radius behavior for backwards-compatible worlds until migration has explicit material accounting.

Two whole-engine tests construct a one-cell interior from real timed material-consuming tile jobs and demonstrate that no partial/blueprint room helps. They then measure storm-time recovery, remove a wall to demonstrate loss of enclosure, and save/reload all six exact receipt-backed tiles. A forged roof command lacking material evidence cannot grant shelter.

**Explicit remaining work:** an open door currently doubles as a weather barrier and a passable movement cell; there is no door-open/closed operation yet. Connected rooms, multi-floor support, fire heating, roofing above nonzero z levels, time-varying infiltration, structural decay, true heat transfer and autonomous building design remain future acceptance gates in #61/#62. The first one-cell enclosed room is a correctness baseline, not a complete architecture simulator.
