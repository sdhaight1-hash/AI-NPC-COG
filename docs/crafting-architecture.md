# Crafting and material production architecture

## Design contract

Crafting is a world process, not an inventory conversion granted by an LLM.
The world validates **materials → process → tools/station → labor time →
unfinished workpiece → finished object**. Any inhabitant can undertake the
same process if it has the same knowledge, capabilities, access and supplies.

Reference design influences (not copied mechanics):
- Vintage Story: multiple physical production methods, e.g. stone knapping,
  clay forming, firing and heating metal.
- Wayward: materials, tools, quality, and meaningful item wear.
- Dwarf Fortress: persistent production jobs, specialists, workshops,
  inventory flows and settlement-level supply chains.
- Kynseed: individual craftsmanship, products affected by technique, and
  livelihoods built around cooking, smithing, and other trades.

The world simulator is the sole authority on materials and quality. Rein or
Hivemind selects among legal intentions; production substeps are deterministic,
time-costed world jobs, not additional model prompts. No automatic profession,
knowledge, guild, shop or ownership is assigned merely because a recipe exists.

## Implemented first vertical slice (PR #17)

- Six manufacturing methods: fiber to cord, stone to blade, hafted hatchet,
  primitive workbench, split planks and a wooden storage crate.
- Three distinct operations per recipe, with individual time costs.
- Inputs are consumed when starting a workpiece. An interrupted workpiece
  persists and cannot produce an item until its remaining stages complete.
- Ingredient/tool/workshop checks happen at the relevant stage.
- Producing an item creates a structured record: type, quality 1–5, crafter,
  time, process and inherited quality of crafted components.
- Crafting skill affects finished quality; high-quality workbenches improve
  precision, and higher-quality axes improve wood harvesting.
- Workbenches become physical inspected world structures; finished crates
  can be placed as physical objects and store finite wood, stone and fiber.
  A crate's capacity depends on its crafting quality.
- Crafted item counts and structured records round-trip through saves.
  Older inventory-count hatchets migrate without being erased.
- NPC intent choices are exposed by the same availability API as survival,
  exploration, socializing and construction.

This is **not** yet an ecosystem of full metallurgy, farming, weaving,
machinery, pottery, architecture, or universal item wear. The first slice
proves the production interface and conservation mechanics.

## Production-domain model to extend

**Material lot:** material kind, species/ore/mineral subtype, quantity,
mass, grade, moisture, impurities, temperature, origin, age/rot, ownership.
No material should appear from a job without an input or a conserved process.

**Item:** material composition, shape, maker, condition, quality, sharpness,
durability, capacity, provenance, timestamp, and repair history. A crafted
item is not a magic tag: it participates in wear, storage, transport and
use according to its component properties.

**Workpiece/job:** recipe and method, completed and outstanding operations,
staged components, bound workshop and tools, progress, failure/defect
state, interruption, reservation, and outputs. Persist jobs as game state.

**Station:** physical occupied tiles, dimensions, access, tool fixtures,
heat/fuel requirements, capacity, quality, efficiency, work queue,
condition and material bins. Stations are built and maintained.

**Knowledge:** acquired practical methods, material observations, failures,
personal memories and transmitted instruction. Understanding an item
does not automatically reveal its manufacturing recipe.

**Skills:** practiced techniques affect efficiency, yield, quality
distribution and failure probability without imposing predefined jobs.

## Discipline roadmap and acceptance gates

1. **Primitive material transformation**
   Tree → branches/logs → split timber, stakes, plank stock; rock → knapped
   edges; raw fiber → spun cord → woven goods. Validate material quantities,
   intermediate products and tool constraints.

2. **Containers and logistics**
   Ground piles, crates, baskets, containers, capacity by volume and mass,
   hauling, item ownership, reservations, shared stockpiles and missing
   material recovery. Two NPCs must be able to hand off a work order without
   duplicating stock.

3. **Woodworking and building**
   Workbenches, saws, splitting, shaped components, doors, walls,
   structural joints, roofs and furniture. Construction requires component
   placement, labor and stable terrain rather than a single build action.

4. **Pottery, heat and metallurgy**
   Clay extraction and processing, forming, drying, firing, kiln fuel,
   smelting ores, alloy composition, casting, forging, tempering, cooling.
   Temperature and process order matter; invalid sequences can fail.

5. **Food production and preservation**
   Field-to-kitchen chain: sowing, harvesting, milling, cutting, mixing,
   fermentation, cooking, smoking, drying, storage and spoilage.
   Ingredient quality, nutrition and contamination affect the result.

6. **Textiles, leather and chemistry**
   Fiber preparation, spinning, dyeing, loom work, tanning, soap,
   medicines, glass and simple reagents. Mechanisms emerge from material
   constraints, not hard-coded claims of industrial knowledge.

7. **Community-scale production**
   Specialist skill learned through experience, apprenticeships,
   work assignment, workshop queues, warehousing, quality inspection,
   repair, trade and multi-person projects. Persistent job records let
   production survive interruptions, deaths, save/load and model changes.

## Non-negotiable automated tests

- Materials never go negative or duplicate during start, failure, cancel,
  partial completion, handoff or reload.
- A workpiece cannot complete without the required stages and station.
- Resource quality and worker skill measurably affect a product.
- Output can be physically used, placed, stored, moved and inspected.
- Invalid model output, unfamiliar recipes and inaccessible stations fail
  without mutating world state.
- A save restores ongoing production and legacy inventory safely.
- Thousands of deterministic simulated ticks must not require one LLM
  call per hammer strike or fiber twist.
