# AI-NPC-COG — a living 2D NPC sandbox

An experimental, local-first 2D village for testing autonomous NPC behavior with **Rein-NPC-4B-Q4_K_M.gguf**. The 2D renderer and simulation keep moving even during local model inference. Every decision is observable, labeled, and constrained by the world engine.

## Quick start (Windows — one click)

**No manual llama.cpp installation and no model download required.**

1. Place your existing model in this path inside the repository (you already have this file):

       Model\Rein-NPC-4B-Q4_K_M.gguf

2. **Double-click install.bat**. It checks for Node.js 20+, installs portable Node.js 22 LTS only if needed, and downloads the official Windows CUDA 12.4 llama.cpp server plus CUDA runtime DLLs. Both downloads are SHA-256 verified. It installs everything beneath the private _runtime folder and launches the program when successful.

3. The first run opens two console windows (model server and web server) and launches your browser at **http://127.0.0.1:5173**. Wait for the model to finish loading before expecting Rein-driven decisions.

For later sessions, **double-click start.bat**. You do not need to run the installer again. Leave the two server console windows open while using the simulation; close them to stop it.

The script uses **your existing local GGUF**, changes no system PATH or security settings permanently, needs no administrator rights, and does not install Python or use cloud inference. Windows PowerShell is used for downloading and verifying the official release ZIPs. The combined llama.cpp/CUDA downloads can be several hundred megabytes, so the first install needs an internet connection and free disk space.

If llama-server.exe reports out-of-memory on an RTX 2060 6GB, close other GPU applications and reduce the -ngl 99 setting to -ngl 25 in start.bat to offload some layers to RAM. If you already have Node.js, the installer reuses it. If interrupted, rerun install.bat; completed components are kept.

**Troubleshooting:** If Windows blocks the download, verify the archive is from the official [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp/releases) project. If the model server immediately exits with a CUDA DLL error, check that your NVIDIA graphics driver supports CUDA 12.4. Inspect the model server console for exact errors; the village UI will label offline fallback routines whenever Rein is not connected.

## Graphics — pixel-art village

Hearthbrook now uses an **original 16×16 pixel-art rendering layer** inspired by classic top-down RPG tilesets, including [Anokolisa's Pixel Crawler free pack](https://anokolisa.itch.io/free-pixel-art-asset-pack-topdown-tileset-rpg-16x16-sprites).

- Hand-authored procedural pixel tiles for grass, stone and dirt roads, flowerbeds, water, shrubs, trees, fences, lamps, well and market props.
- Six visually distinct NPC sprites plus the player, with four facing directions and four-phase walking animations.
- Buildings differentiated by roofing, windows, signs, doors, awnings, and other decorations.
- A **nearest-neighbor/pixel-perfect Canvas renderer** at a 640×416 logical resolution, with 1×/2×/3× camera zoom. The camera follows the player when zoomed in. The original 40×26 grid, pathfinding, interaction ranges, and save-state format are preserved.
- Static scenery is cached. Dynamic lighting, water ripples, drifting particles and campfire smoke are rendered over the scene without changing resource or AI state.
- The optional **Kenney Tiny Town CC0 16×16 atlas** is downloaded automatically once to `public/assets` on Windows startup. If installation fails or you are offline, the original procedural village continues to render. Use **Art: CC0 Tiny Town / Art: Original** in the toolbar to compare either treatment.

**Licensing:** The linked Anokolisa pack is a **visual reference**, not a dependency; its artwork is not redistributed here. The optional [Kenney Tiny Town](https://kenney.nl/assets/tiny-town) atlas is licensed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) and downloaded **locally**, not committed to this repository. Original procedural graphics are authored for AI-NPC-COG. If the network was unavailable at first launch, double-click `install-art.bat` to retry once you reconnect. A failed download does not prevent the simulation from starting.

**Camera:** Click `−` or `+` beside Camera, or use the minus/plus keys when the chat field isn't focused. 1× shows the complete village; 2× and 3× zoom follow the player. Click-to-move and NPC selection continue to work at all zoom levels.

## Physics and collision — top-down, no rigid-body dependency

The browser now uses `public/physics.js`: a small continuous **kinematic collision controller** with acceleration, deceleration, radius-aware tile collisions, swept incremental movement against walls, solid character bodies, and axis-based wall sliding. AI navigation still uses the original 40×26 integer grid, but physical bodies interpolate to each waypoint with acceleration and braking. This preserves world rules and existing NPC goals.

The camera follows the physical player position smoothly instead of snapping to successive tile centers. The renderer keeps its 640×416 logical resolution, integer sprite pixels and the 30 FPS rendering cap; inference stays on the original one-instance Rein server.

**Why not Matter.js or Box2D?** This is a ground-plane RPG testbed with no jumping, gravity, ropes or rigid-body piles. Adding a full physics engine would introduce a second authoritative collision model and larger integration risk without improving current gameplay. If the project adds pushable objects, vehicles or dynamic debris, a dedicated solver can be reconsidered.

**Important limitations:** Collision currently uses small circular footprints and tile-based static obstacles. It does not simulate terrain height, buoyancy or accurate per-pixel sprite contours. All AI world decisions remain authoritative in the existing simulation, and neither downloaded art nor graphics effects affect character cognition.

## Emergent inhabitants — no assigned occupations

Hearthbrook is a compact **2D autonomy experiment**, inspired by the world-first design of [VoxelMind](https://voxel-mind.com/). There are six inhabitants, **zero predetermined jobs**, and one loaded local Rein-NPC GGUF shared between all of them. Their personalities are starting dispositions, not occupational descriptions. The simulation never directs a character to go to work at a set time.

### Decision loop

1. Each inhabitant has hunger, energy, social need, curiosity, inventory, personal memories and earned experience. Each can perceive only relevant nearby people and resource nodes, not the entire hidden state of the map.
2. The environment creates a **bounded list of currently possible actions**: forage food, collect wood or stone, eat, recover, share food, socialize, explore or build a shared campfire when materials are available. Rein scores the options. There is no job slot, job schedule or fixed character-to-building mapping.
3. World rules validate and execute the chosen action. Characters have to walk to resources. Gathering depletes them, eating consumes food, sharing transfers an actual item, and construction spends wood and stone and leaves a persistent, visible campfire. Sources slowly regenerate.
4. Successful actions improve earned skills; practiced gatherers eventually collect more per trip while still depleting finite sources. The inspector describes the most common observed behavior only after it has happened multiple times; this is not a permanent class or job assignment. Memories preserve the consequences.
5. Idle inhabitants take turns using the **same model server**, while player conversation preempts background decisions. Offline fallback is marked as deterministic survival behavior, **not AI-driven emergence**.

The existing buildings are starting scenery and communal places, not employers or assigned homes. This remains a **small emergent-agent testbed**, not VoxelMind feature parity. There are no farms, governments, advanced craft chains, a real economy, reflective memory retrieval, or general-purpose open-ended planning yet. Characters can now sustain two world-grounded intentions and exchange short model-generated dialogue with nearby agents.

**Existing save migration:** Old trust, dialogue and memories are retained if a legacy browser save exists, but obsolete job actions and their routes are discarded. If you want every inhabitant to start without history from the previous job-based prototype, click **Reset** in the simulation. Reset clears local browser state.

## Controls
- Click a villager to inspect their mood, goal, memories and relationships.
- Hold WASD or the arrow keys for continuous acceleration and friction. Diagonal movement is normalized; collision with solid tiles and residents prevents walking through them.
- Click open ground for physically smooth, tile-navigated travel. The player can slide along obstacles while moving manually.
- Use **Physics: Debug on** to reveal walls, circular character collision bodies, and velocity vectors.
- **Art: CC0 Tiny Town / Art: Original** switches locally installed tiles and procedural art instantly.
- Approach an NPC within four tiles to talk; hit E or use Talk.
- Enter text to converse. Rein first evaluates a typed decision; only then generates a reply.
- Pause, change simulation speed, or reset the village from the toolbar.
- Watch the lower cognitive event log and selected NPC's decision scores.
- Progress and relationships persist locally in your browser (localStorage). Reset removes the saved local state.

## What is really AI-driven?

When the model health indicator says **Rein connected**:
- Background NPCs are periodically offered explicit action choices. Rein scores those choices using its trained 64-token decision interface. The highest-scoring valid action is executed.
- Player speech triggers a separate social-response decision, followed by an ordinary Rein chat-completion request.
- The backend uses llama.cpp's raw /completion for one-token option probabilities, calibrated with Rein's documented 0.812 temperature, and /v1/chat/completions for speech.

When the model is disconnected the sandbox continues with **clearly labeled deterministic routines and fallback dialogue**. Offline behavior is not presented as AI intelligence. The world remains authoritative: decisions cannot teleport people, cross blocked tiles or invent inventory. Movement, time, physical needs, resource regeneration and action outcomes are deterministic; NPC choices are event-driven and serialized to avoid GPU overload.

This is a prototype for *behavioral testing*, not a finished persistent-persona architecture: it has short episodic memory, individual needs, real inventory transfers, earned gathering experience and simple relationship scores, but not vector retrieval, reflective summarization, interiors or a full economy.

## Performance and architecture (RTX 2060 / 6 GB target)

The browser runs the **2D simulation continuously**, while the local Node bridge serializes access to `llama-server`. There are two request priorities:

- **Foreground conversation:** `POST /api/interact` combines Rein's trained decision pass and its dialogue pass in a *single priority job*. It includes the player's latest message in both stages, commits NPC mood/trust/memory **only after the complete reply succeeds**, and interrupts an in-flight background inference.
- **Background activity:** `POST /api/decide` and `POST /api/peer-exchange` share the same low-priority lane and **never queue multiple stale requests**. A busy server returns HTTP 429 so the browser can defer the work rather than falsely declaring the model offline.

This is still **one loaded GGUF**, not a separate model instance per resident. Chat and decisions are serialized because `start.bat` uses `--parallel 1` for the 6 GB GPU. Priority cancellation reduces wait time but cannot guarantee instantaneous interruption inside llama.cpp. The model server's actual throughput depends on GPU drivers, VRAM pressure and context.

The village now caches the unmoving map, renders dynamic characters at up to 30 FPS, and separates conversation and background busy state. Held WASD movement no longer clears its own path; walkable paths remain validated by the game. NPCs are offered only contextually possible resource and social actions; repeated idle decisions don't corrupt goals or restart routes.

When connected, background thinking begins at roughly one decision every 12 seconds or after the previous one has finished, whichever is later. Actual model latency is reported in the event timeline in milliseconds. The **Rein connected** indicator may remain online through short busy periods when health checks are delayed.

**For diagnosing slowness:** look at the two server windows after launching `start.bat`. If the browser says *offline*, inspect the model console for loading, GPU/driver, or out-of-memory errors. If dialogue works but takes many seconds, compare the timeline's reported decision/dialogue latency; GUI drawing and GPU inference are separate. Closing ComfyUI and other GPU-heavy programs can reduce competition for your 6 GB VRAM. Reduce `-ngl 99` to a smaller layer count in `start.bat` **only if GPU allocation fails**—CPU offload usually makes inference slower.

The app continues with explicitly marked offline routines if the model is not connected. This is not equivalent to AI-driven behavior.

### Verification

```bat
node --test tests/*.test.mjs
```

The test suite includes accelerated motion, collision sliding and anti-tunneling, plus Rein's special-token scoring, HTTP end-to-end peer and player dialogue with a fake local model, foreground cancellation, stale-result rejection, bounded multi-step intentions, save validation, static scene caching and held-key movement. CI also runs the Windows installer checks. Real-GGUF speed and visual polish still need evaluation on your own hardware.

## How to evaluate

Look at the event log's action probabilities and compare similar scenarios with different personalities, moods or relationship scores. Try asking one character for help, insulting them, and revisiting them after changing their mood. Ask a question outside their knowledge and see whether the response stays grounded. Restart and verify memories persist. Inspect Chrome DevTools if the model has an error: the UI distinguishes server failures from valid model decisions.

To run protocol tests:

       node --test tests/*.test.mjs

## Research / protocol

- Rein-NPC model card and exact two-request protocol: https://huggingface.co/jmc0/Rein-NPC-4B
- GGUF release: https://huggingface.co/jmc0/Rein-NPC-4B-GGUF
- VoxelMind's autonomous villager ideas: https://voxel-mind.com/blog/
- Generative Agents: memory, reflection, planning: https://arxiv.org/abs/2304.03442
- 2D NPC sandbox examples and world-authoritative execution: https://hub.stabilarity.com/living-npcs-zero-script-llm-characters-on-a-shared-engine-live-results-from-a-2d-village-and-a-3d-mage-isle/

The referenced YouTube videos were used as inspiration; their exact visuals and implementation have not been reproduced. This project does not reuse video assets or model weights.
