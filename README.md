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

## Controls

- Click a villager to inspect their mood, goal, memories and relationships.
- Click open ground to move the player; WASD / arrow keys also work.
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

When the model is disconnected the sandbox continues with **clearly labeled deterministic routines and fallback dialogue**. Offline behavior is not presented as AI intelligence. The world remains authoritative: decisions cannot teleport people, cross blocked tiles or invent inventory. Movement, time, proximity, mood changes, and schedules are deterministic; NPC inference is event-driven and serialized to avoid GPU overload.

This is a prototype for *behavioral testing*, not a finished persistent-persona architecture: it has short episodic memory, simple relationship scores, social choices and goal selection, but not vector retrieval, reflective summarization, interiors, job inventories or economies.

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
