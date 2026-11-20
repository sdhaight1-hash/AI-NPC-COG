# G2.1 — private sensory packets

The observer may inspect the whole authoritative simulation. An inhabitant may not.

## Inputs and authority
`Perception.snapshot(state, actor, soundEvents)` creates a newly allocated, recursively frozen packet. It reports only the actor's own bodily cues, visible objects, visually confirmed residents and audible event categories. Every sampled record carries a simulation clock. Neither references to private NPC objects nor their inventories, needs, beliefs, goals or conversational data are copied into another actor's packet.

Vision is deterministic, uses wrapped toroidal shortest-line tracing, and respects opaque world materials / closed doors, vertical levels, time of day, fog, storms and nearby campfire illumination. Terrain remains unchanged by darkness: the light affects perception, not physical truth.

Hearing uses loudness, Manhattan-like world distance, obstruction attenuation and coarse direction/proximity. A voice heard without a clear visual does not reveal a speaker name, ID, actual words or private attributes. Even raw event text cannot be injected into the percept.

Touch/intentional inspection requires physical proximity (one world tile), and returns a copy of the object facts allowed at that range. Exact finite stock and container contents are *not* visible at a distance; they require inspection. The authoritative inspector can still show everything, but those debugger facts are not model context.

## Model boundary
Browser `sceneFor` derives nearby people and resources from `Perception.snapshot`. `backgroundOptions` passes legal choices through `Perception.filterAffordances`: unseen referenced targets are removed unless the actor has prior personal evidence, and stock quantities are sanitized. No other NPC's private inventory or hunger is present. Models can suggest an allowed key; they cannot mutate the authoritative state.

The shared physical runtime now filters world-affordance candidates by what the actor can currently sense or has previously witnessed; model-free autonomy uses this same gate. When a needed gathering source is not known, the project planner may choose a legal exploratory move instead of assuming a hidden deposit exists. The underlying world-affordance generator still evaluates global topology internally and may select an unseen nearest node ahead of a visible alternative; refining candidate discovery and belief-driven navigation is future work. Memory consolidation and provenance-based recall belong to G2.2.

## Proof obligations
`tests/perception.test.mjs` covers wall occlusion and reopening, day/night and fog, whisper/loud-event hearing, hidden identity, local inspection, independent immutable snapshots, and model option stock suppression. CI also checks legacy browser tests, deterministic headless replay, thirty-day soak and Windows installer scripts. These checks do not constitute a manual Windows GPU test.

## Social contact and consequences

Companionship requires a willing, reachable resident on the same level and a clear line of contact at completion. A connected exchange also checks the original command, both positions and the partner reservation before committing speech. It expires after 45 simulated minutes or 24 real seconds once the model request starts. An urgent bodily need lets either participant withdraw and start a survival action.

Speech comes from a committed dialogue receipt at the encounter location. Silent companionship and material transfers do not create audible words. Overhearing reveals only the anonymous sound. The two participants keep their own attributed, reported dialogue and separately verify resource claims. Each model call receives a compact private scene with personally inspected source citations. A disconnected browser aborts the upstream peer request.

Physical aid and instruction affect the receiving resident’s bounded, directional relationship and mood. Visible competition for the same reserved material can create private tension. Repeated help or contention has a social cooldown. Tension fades over time, and a real act of help can reduce it. At higher tension a resident can refuse further companionship. The observer can inspect these social effects, and the model receives only its acting resident’s relationship history.
