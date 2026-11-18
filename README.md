# AI-NPC-COG — a living 2D NPC sandbox

An experimental, local-first 2D village for testing autonomous NPC behavior with **Rein-NPC-4B-Q4_K_M.gguf**. The 2D renderer and simulation keep moving even during local model inference. Every decision is observable, labeled, and constrained by the world engine.

## Quick start (Windows / PowerShell)

Requires Node.js 20+ and a recent CUDA-capable llama.cpp build that understands Rein's 64 added special tokens.

1. Start **your already-downloaded** model (replace the example path with the actual path on your computer):

       llama-server.exe -m "C:\path\to\Rein-NPC-4B-Q4_K_M.gguf" --host 127.0.0.1 --port 8080 -ngl 99 -c 8192 --parallel 1

2. In a second terminal in the repository folder:

       node server.mjs

3. Open http://127.0.0.1:5173

No npm install, Python environment, cloud API, or GGUF re-download is required. The model file stays where you downloaded it. If GPU allocation fails on your RTX 2060 6 GB, reduce context to 4096, close other GPU programs, or try -ngl 25 and adjust upward.

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
