# Construction projection in the observatory

This is the first presentation milestone after receipt-backed tile work in [G4.2](physical-tile-construction-g4-2.md), not a separate source of building authority.

- Draw unbuilt `world.construction.blueprints` as dashed amber outlines with progress indicators only while a real `build_tile` activity is underway.
- Draw completed floor, wall, door and roof tiles from the *same authoritative world layer* consumed by traversal and save validation. Render above terrain and existing objects at the matching z-level without changing inventory, collision, support or receipt state.
- A selected resident standing directly beneath a roof gets a lightweight roof cutaway: suppress the roof fill locally while retaining its physical tile, movement and shelter rules. This is an observer-only projection; it does not manufacture an indoor environment.
- Allow clicks to inspect constructed tiles and unbuilt blueprints, with different labels and status. Physically constructed tiles become actor-visible and inspectable; another resident's private blueprint intention is **not** added to sensed world objects.
- Use the existing Canvas drawing pipeline and vector primitives for shapes and progress. No additional assets or rendering backend are needed for this milestone.

Headless client tests verify that rendering is pure (no world mutation) and shows distinct finished geometry. Full real-browser legibility, GPU frame-time at 1×/2×/3×, accurate multi-tile roofing and occlusion, enclosed indoor warmth, structural deterioration and animated cooperative builders are still outstanding in #64/#61/#62.