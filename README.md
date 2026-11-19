# AI-NPC-COG — Emergent Civilization Observatory

A local-first, top-down, grid-and-time simulation of independent Rein-controlled people living in a seeded, **finite toroidal world with bounded z-levels**. Humans can learn, gather, construct simple shelters, talk and die. The simulation owns physical truth; one shared local **Rein-NPC-4B-Q4_K_M.gguf** model selects personal intentions. The observer is god mode, **not** a player character.

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
- Gathering, eating, drinking, making a campfire, building a basic shelter, exploration, simple social exchange and individual hatchet-method experimentation are prototype actions. Crafting the hatchet requires discovery of its method; merely having ingredients does not reveal it.
- Bodies have energy, nutritional state, hydration, sleep pressure, stress, age metadata and simplified health. Death removes an inhabitant permanently and records their identity and cause. The world persists when no humans survive, allowing future independent arrivals.
- The inspectable event log is bounded for now. People have basic short individual memories and earned action experience; **full durable knowledge, genealogy, reproduction and historical provenance are scheduled for later phases**.

### Simulation clock

The speed selector advances simulated time independently of rendering frames. Its 1×, 60× and 3600× options are time multipliers. At 60×, one real second advances one in-game minute; at 3600×, one real second advances one in-game hour. Time acceleration can outpace local AI decisions: monitor model throughput and do not mistake offline defaults for rich autonomy.

### Saving and migration

Local storage now uses the ai-npc-cog-v3 key. Older v1/v2 player-and-village states cannot safely be mapped to the new wilderness, so they are **not automatically imported or erased**. Clicking Reset clears the current v3 world. New world selects a new seed after confirmation. Browser local storage is temporary prototype storage and does not yet provide the reliability of a server-side historical database.

## Roadmap and architecture

- [Emergent world roadmap](docs/emergent-world-roadmap.md) — the full set of design invariants, future phases, acceptance gates, and honest omissions.
- [Architecture and physiology research](docs/architecture-and-physiology.md) — the previous documented biology research and world/AI authority separation. Sections describing the older village/player layout are historical, not current features.

The future work includes a server-owned event queue and durable journal, editable multilevel geology, construction from individual components, researchable technologies and practical skill learning, population-wide plants/wildlife/monster ecology, genetic lineage, gestation and childhood, and genuinely emergent communities, ownership claims, laws, economics, treaties and conflict.

**Social institutions never appear by default.** Land claims are social assertions and possible laws; they never create impassable walls. Claims may never be invented in a given world. Cooperation is an individual's decision, not a compulsory algorithmic relationship bonus. If every living person dies, the world and its surviving physical artifacts persist.

## Tests

Node.js 22 runs the current suite with:

    node --test tests/*.test.mjs

The test suite covers toroidal generation, boundary pathfinding, monthly calendar events, zero-population survival, individual knowledge, biology and world resources, plus the HTTP Rein protocol. GitHub Actions also checks browser script syntax and exercises Windows installer validation. These tests do not replace an on-device visual/GPU smoke test.

## Art and licensing

The renderer is original procedural top-down pixel art, currently much simpler than the intended Kynseed-inspired visual direction. The optional locally downloaded [Kenney Tiny Town](https://kenney.nl/assets/tiny-town) atlas is [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Missing optional sprites never prevent the app from running. Kynseed, Wayward, Project Zomboid, Eco, Crusader Kings III and Dwarf Fortress are design references only; no proprietary game assets or source have been reused.
