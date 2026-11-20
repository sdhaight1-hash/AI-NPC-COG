# AI-NPC-COG — Emergent Civilization Observatory

A local-first, top-down, grid-and-time simulation of independently acting people living in a seeded, **finite toroidal world with bounded z-levels**. Humans can learn, gather, construct simple shelters, talk and die. The simulation owns physical truth; one shared local **Rein-NPC-4B-Q4_K_M.gguf** model selects personal intentions. The observer is god mode, **not** a player character.

This repository is an **active prototype**, not yet the finished generational civilization and ecology simulator described in the [implementation roadmap](docs/emergent-world-roadmap.md). The new v3 world foundation is the first stage.

## Quick start on Windows

1. Place the existing model at Model\Rein-NPC-4B-Q4_K_M.gguf inside the repository.
2. Double-click **install.bat** once if this machine does not already have the required local runtime. It installs a private Node.js runtime when needed and the official llama.cpp CUDA binary with hash verification.
3. Subsequently double-click **start.bat**. It runs the local model/server and opens the app at http://127.0.0.1:5173.

No administrator access or external AI service is required. First-time installation may download hundreds of megabytes of official runtime files. If inference exhausts the RTX 2060's 6 GB of VRAM, reduce the -ngl 99 setting in start.bat to -ngl 25 and close other GPU applications. The UI labels offline fallback rules clearly; they are **not equivalent to genuine Rein cognition**.

## Phase-1 gameplay and observer controls

- **Five randomized adults** begin near one another in viable wilderness. No seeded houses, roads, town, affiliation, designated friendship or profession. Additional adults spawn anywhere suitable on the first day of every simulated month; no bed or room is required.
- The world uses deterministic 80×52 terrain, seeded habitats and finite wild resources. X wraps east/west, Y wraps north/south. Existing z-level support is a **bounded subterranean material substrate and vertical-connection rule**, not a completed excavation/building simulator.
- Inhabitants occupy authoritative integer grid tiles. Movement and actions cost simulated time and sprite motion is interpolated. Pausing and time acceleration do not grant free actions. Resource stocks, digestion and weather are code-driven.
- **No controllable avatar.** WASD or arrows pan the camera; click an inhabitant to inspect/follow; F follows the selected inhabitant; +/- zoom; PageUp/PageDown or the Layer controls inspect z-levels; the grid diagnostic can be toggled.
- Gathering, eating, drinking, making a campfire, building a basic shelter, exploration and social exchanges remain prototype actions. Traditional hatchet-method experimentation still requires discovery. A separate primitive manufacturing chain allows NPCs to learn by doing: twisting cord, knapping blades, hafting axes, building workbenches, splitting planks and assembling crates. Each process uses distinct timed stages, finite ingredients, tools or stations, with item-quality records.
- Bodies have energy, nutritional state, hydration, sleep pressure, stress, age metadata and simplified health. Death removes an inhabitant permanently and records their identity and cause. The world persists when no humans survive, allowing future independent arrivals.
- The inspectable event log is bounded for now. People have basic short individual memories and earned action experience; **full durable knowledge, genealogy, reproduction and historical provenance are scheduled for later phases**.

### Simulation calendar

Twelve nine-day months form a 108-day game year, divided into four 27-day
seasons. Temperature, rain, snow and plant renewal follow the season. Aging,
monthly arrivals, the HUD and NPC context share this same calendar.
This is game-time chronology, not a 365-day real-world calendar.

### Simulation clock

The speed selector advances simulated time independently of rendering frames. Its 1×, 60× and 3600× options are time multipliers. At 60×, one real second advances one in-game minute; at 3600×, one real second advances one in-game hour. Time acceleration can outpace local AI decisions: monitor model throughput and do not mistake offline defaults for rich autonomy.

### Saving and migration

Local storage now uses the ai-npc-cog-v3 key. Older v1/v2 player-and-village states cannot safely be mapped to the new wilderness, so they are **not automatically imported or erased**. Clicking Reset clears the current v3 world. New world selects a new seed after confirmation. Browser local storage is temporary prototype storage and does not yet provide the reliability of a server-side historical database.

## Multi-stage crafting foundation

Crafting is **not** instantaneous recipe conversion. Rein or Hivemind can choose
a legal manufacturing intention. Materials are spent on a persistent unfinished
workpiece; the world executes each timed stage and awards an item only after
all required steps pass. Intermediate components, quality, maker identity and
workshop locations are saved. A crafted crate can be placed as finite, shared
storage, and quality affects capacity, wood gathering or workshop precision.
The original v3 hatchet is preserved on old saves.

This is an intentionally narrow **working production chain**, not a complete
pottery, food, textile or metallurgy system. See the
[crafting and production architecture](docs/crafting-architecture.md) for
material-property, process, ecology, wear, logistics and workshop expansion gates.

## Final pre-code contracts (2026-11-19)

The [final research and implementation handoff](docs/final-research-implementation-handoff-2026-11-19.md) fixes the architecture decisions for the next coding sequence. Read the separate [time/causality](docs/final-research-time-causality-contract-2026-11-19.md), [physical inventory and conservation](docs/final-research-physical-ownership-contract-2026-11-19.md) and [cognitive executive](docs/final-research-cognitive-executive-contract-2026-11-19.md) contracts before touching those systems. These documents are proposals, **not implemented gameplay features**.

## Roadmap and architecture

- [Emergent world roadmap](docs/emergent-world-roadmap.md) — the full set of design invariants, future phases, acceptance gates, and honest omissions.
- [Architecture and physiology research](docs/architecture-and-physiology.md) — the previous documented biology research and world/AI authority separation. Sections describing the older village/player layout are historical, not current features.
- [Full repository audit and implemented-vs-planned ledger (2026-11-19)](docs/full-repository-audit-ledger-2026-11-19.md) — source-grounded module/PR/issue/CI audit; do not equate merged foundations with complete NPC autonomy.
- [Architecture priorities and test gates (2026-11-19)](docs/full-audit-design-decisions-test-gates-2026-11-19.md) — cross-system dependency plan and exact validation questions.
- [Top-down vector rendering, 2D chunks, WFC and space colonization research](docs/topdown-vector-chunk-worldgen-research-2026-11-19.md) — renderer-neutral world authority and procedural art comparisons.
- [Cross-project technology transfer](docs/cross-repository-architecture-transfer-2026-11-19.md) and [ecology/time study](docs/ecology-time-and-emergent-paths-research-2026-11-19.md) — actual reused ideas versus future hypothetical systems.

The future work includes a server-owned event queue and durable journal, editable multilevel geology, construction from individual components, researchable technologies and practical skill learning, population-wide plants/wildlife/monster ecology, genetic lineage, gestation and childhood, and genuinely emergent communities, ownership claims, laws, economics, treaties and conflict.

**Social institutions never appear by default.** Land claims are social assertions and possible laws; they never create impassable walls. Claims may never be invented in a given world. Cooperation is an individual's decision, not a compulsory algorithmic relationship bonus. If every living person dies, the world and its surviving physical artifacts persist.

## Tests

Node.js 22 runs the current suite with:

    node --test tests/*.test.mjs

The test suite covers toroidal generation, boundary pathfinding, monthly calendar events, zero-population survival, individual knowledge, biology and world resources, plus the HTTP Rein protocol. GitHub Actions also checks browser script syntax and exercises Windows installer validation. These tests do not replace an on-device visual/GPU smoke test.

## Art and licensing

The renderer is original procedural top-down pixel art, currently much simpler than the intended Kynseed-inspired visual direction. The optional locally downloaded [Kenney Tiny Town](https://kenney.nl/assets/tiny-town) atlas is [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Missing optional sprites never prevent the app from running. Kynseed, Wayward, Project Zomboid, Eco, Crusader Kings III and Dwarf Fortress are design references only; no proprietary game assets or source have been reused.

## Optional Hivemind model

Rein-NPC-4B remains the default via `start.bat`. To try Hivemind Heretic,
put `Qwen3-4B-Hivemind-Inst-Hrtic-Ablit-Uncensored-Q4_K_M-imat.gguf`
in `Model` and run `start-hivemind.bat`. Close both old server windows
before changing models. Only one GGUF uses VRAM at any moment.

Rein retains its 64-token action scoring; Hivemind selects an exact legal key
by chat and never fabricates comparable probabilities. Both use identical
authoritative world rules and save data. Invalid outputs are rejected.
The UI identifies the active model. Comparative performance is not yet benchmarked.

### Field catalog

Open **Field catalog** to search materials, flora, fauna, tiles, tools, and workstations. Entries list related processes and distinguish simulated recipes from designs. **Vector terrain and objects** switches the live surface map between the new path art and the legacy presentation. See the [content and production design](docs/field-catalog-and-production.md).
