# G2.1 — private sensory packets

The observer may inspect the whole authoritative simulation. An inhabitant may not.

## Inputs and authority
`Perception.snapshot(state, actor, soundEvents)` creates a newly allocated, recursively frozen packet. It reports only the actor's own bodily cues, visible objects, visually confirmed residents and audible event categories. Every sampled record carries a simulation clock. Neither references to private NPC objects nor their inventories, needs, beliefs, goals or conversational data are copied into another actor's packet.

Vision is deterministic, uses wrapped toroidal shortest-line tracing, and respects opaque world materials / closed doors, vertical levels, time of day, fog, storms and nearby campfire illumination. Terrain remains unchanged by darkness: the light affects perception, not physical truth.

Hearing uses loudness, Manhattan-like world distance, obstruction attenuation and coarse direction/proximity. A voice heard without a clear visual does not reveal a speaker name, ID, actual words or private attributes. Even raw event text cannot be injected into the percept.

Touch/intentional inspection requires physical proximity (one world tile), and returns a copy of the object facts allowed at that range. Exact finite stock and container contents are *not* visible at a distance; they require inspection. The authoritative inspector can still show everything, but those debugger facts are not model context.

## Model boundary
Browser `sceneFor` derives nearby people and resources from `Perception.snapshot`. `backgroundOptions` passes legal choices through `Perception.filterAffordances`: unseen referenced targets are removed unless the actor has prior personal evidence, and stock quantities are sanitized. No other NPC's private inventory or hunger is present. Models can suggest an allowed key; they cannot mutate the authoritative state.

This is a deliberately narrow security boundary. The existing model-free autonomous physical policy still obtains candidates through the world-affordance kernel; that kernel will need an actor-knowledge gate and exploration behavior before all non-model decisions share this exact sensory restriction. Memory consolidation and provenance-based recall belong to G2.2.

## Proof obligations
`tests/perception.test.mjs` covers wall occlusion and reopening, day/night and fog, whisper/loud-event hearing, hidden identity, local inspection, independent immutable snapshots, and model option stock suppression. CI also checks legacy browser tests, deterministic headless replay, thirty-day soak and Windows installer scripts. These checks do not constitute a manual Windows GPU test.
