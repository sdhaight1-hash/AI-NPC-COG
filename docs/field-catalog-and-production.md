# Field catalog and production design

The field catalog organizes survival and civilization content by stable ID. Open **Field catalog** in the observatory to browse definitions and inspect where each entry fits into production. The map's vector terrain and object mode shares the catalog's original path geometry and draws actual world stocks, dropped objects and structures. The legacy terrain and art-atlas controls remain available. See [content definitions](../public/content-catalog.js), [catalog UI](../public/catalog-ui.js) and [vector art](../public/content-art.js).

## Reference decisions

| Reference | Decision for AI-NPC-COG |
| --- | --- |
| [Vintage Story smithing](https://wiki.vintagestory.at/Smithing), [mechanical power](https://wiki.vintagestory.at/Mechanical_power) | Separate ore, bloom, refined stock and finished tools. Represent fuel, forming stations, shafts, gearing and power consumers explicitly. A mechanical mill requires both its hardware and a live power source when implemented. |
| [Dwarf Fortress stone industry](https://dwarffortresswiki.org/Stone_industry), [stockpiles](https://dwarffortresswiki.org/index.php/Refuse_stockpile) | Rock families provide material choices. Workshop production requires physical delivery from a stockpile, with slag and ash as explicit outputs. |
| [Wayward](https://www.waywardgame.com/), [crafting](https://wayward.fandom.com/wiki/Crafting) | A recipe should distinguish the tool from the materials it consumes. Track durability and quality at the individual-object level during runtime expansion. |
| [Eco crafting](https://wiki.play.eco/en/Crafting), [work parties and economy](https://wiki.play.eco/en/Economy) | Record inputs, outputs, delivery locations and work progress separately so residents can divide logistics from skilled manufacturing. |
| [RimWorld bills](https://rimworldwiki.com/wiki/Bill) | Keep the reusable recipe separate from the queued work order. Scope work orders by eligible stores, tools, worker capability and reachable output space. |
| [Kynseed](https://kynseed.com/kynseed-a-cozy-life-sim-rpg-with-farming-adventure.html), [shops](https://wiki.kynseed.com/wiki/Shops_Overview) | Use legible silhouettes, earthy palettes and clear seasonal cues. Give gardens, smithies, markets and apothecaries distinct roles in village life. |
| [Cataclysm: Dark Days Ahead JSON reference](https://docs.cataclysmdda.org/JSON/JSON_INFO.html), [pockets](https://docs.cataclysmdda.org/JSON/ITEM.html) | Use stable data IDs, explicit tool capabilities and defined container acceptance. Keep manufacturing recipes distinct from practice or research. |
| [UnReal World hunting](https://www.unrealworld.fi/wiki/index.php?title=Hunting) | Model tracking, capture, butchery, preservation and seasonality as separate actions with measurable outcomes. |

For resident decision-making, physical work, social learning, and the first acceptance scenario, see [Crafting decisions for autonomous residents](npc-crafting-and-learning.md).

## Runtime boundaries

- `ContentCatalog` is a versioned, immutable definition store shared by browser tooling and test fixtures. Entity identity, quantity, condition, owners and reservations belong to runtime state. Design rates and process quantities are game balancing defaults.
- The field catalog reads current recipes from `Crafting.RECIPES`. Its design recipes carry process duration, inputs, outputs, tools, station, research and shaft-power requirements where relevant. They remain inspectable until a runtime implementation exists.
- Soil, geology, flora and fauna have distinct records. Plant and animal outputs and crop seeds are linked by ID. Current world generation and pathfinding continue to use their existing authoritative tile and entity data.
- The starter vector set covers the full catalog with category glyphs plus distinct illustrations for important map entities. Residents, animation, underground terrain and building interiors retain their existing presentation.
- Original geometry is shared between SVG catalog icons and cached `Path2D` layers on the Canvas2D map. The renderer reads stock and position and has no write access to simulation state.

## Integration gates

1. Bind recipe inventory quantities to material lots with mass, volume and spoilage. Reserve an exact source and move lots to the station.
2. Work orders hold input, tool capability and station claims. Cancelled or interrupted orders reconcile all custody and resume by workpiece ID.
3. Connect seeds and soils to seasonal plots, and harvesting and hunting yields to conserved stocks. Link rock layers to extraction and processing.
4. Establish temperature, fuel, process yields and by-products before enabling metallurgy. Attach shaft power through measured source and transmission capacities before enabling powered production.
5. Record research as evidence from an experiment or observed successful process. Store knowledge separately from possession of a recipe definition.
6. Add unique map silhouettes from the same catalog IDs as each real entity enters the simulation. Use actual geometry and occupancy for doors, walls, roofs and interiors.
