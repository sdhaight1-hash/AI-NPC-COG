# AI-NPC-COG: world-owned simulation and AI-owned cognition

**Status:** research-backed architecture and phase-one biological implementation.
**Purpose:** original embodied 2D multi-agent survival simulation, not a copy of Wayward or Eco.

## 1. Authority contract

One character is one embodied agent, NOT one model process. All agents use a
single shared Rein-NPC-4B inference service; every agent has isolated memory,
beliefs, personality, inventory and biology.

| World-owned deterministic code | AI agent |
| --- | --- |
| Physical position, acceleration, collisions, movement paths | Goals and priorities |
| Growth, resource stocks, pollution, time, weather | Interests, intentions, social behavior |
| Inventory, crafting, recipes, action validation | Choosing among possible actions |
| Digestion, metabolism, hormonal game signals, illness systems | Subjective descriptions of discomfort |
| Factual event logs and observers | Interpretation, beliefs, explanations, dialogue |
| Action effects, costs and task results | Planning, negotiation, reflection |

Never let natural-language output directly grant items, alter biological state
or invent physical results. Model text may assert a claim; only a validated
world action can create a verified event.

The working loop is:

1. Tick world systems without calling a model.
2. Detect meaningful events and changed needs.
3. Build a character-specific perception (never global omniscience).
4. Retrieve memories and unresolved goals relevant to the decision.
5. Ask Rein what that agent intends to do, only when a decision matters.
6. Validate the proposed action against current world, tools and inventory.
7. Execute physical tasks in code, not with repeated text generation.
8. Record timestamped facts and their actual observers.
9. Let each character interpret important experiences separately.

DeepMind's Concordia architecture distinguishes language agents from a Game
Master validating physical outcomes. CoALA provides an organizing model for
separate cognitive memory and action spaces. Stanford's Generative Agents
demonstrates the value of reflection and planning atop remembered experience.

References:
- https://deepmind.google/research/publications/64717/
- https://arxiv.org/abs/2309.02427
- https://arxiv.org/abs/2304.03442

## 2. Applying Eco's systems thinking

Official Eco sources describe a simulated ecosystem, environmental damage
from excessive resource use, specialization, cooperative construction,
economic incentives, laws, and nutrition affecting skills.

- https://www.play.eco/
- https://wiki.play.eco/en/Food
- https://wiki.play.eco/en/Getting_Started

What should emerge in AI-NPC-COG:
- Resource stocks and flows create ecological constraints.
- Agents develop expertise through repeated choices, not assigned jobs.
- Shared consequences can motivate exchange, protection, restraint,
  competition, agreements and rules.
- Ecological knowledge is acquired through observation or communication.
- The model selects intentions; code owns regrowth and material flows.

Eco's four-way carbohydrates/protein/fat/vitamins balance is a GAME progression
mechanic and not an adequate physiological model. We separate nutrients and
do not assert that their ideal biological proportions are equal.

## 3. Implemented biological foundations

The initial survival world had only generic hunger, thirst and counted food
stacks. The new deterministic biology module separates physiological process
from those user-facing need scores. Every player/NPC gets:

- A food pantry of distinct owned portions: ration, berries, nuts, roots.
- A defined per-serving food composition: carbohydrate, protein, fat,
  fiber, vitamin C, iron, potassium, sodium, water.
- Calorie accounting derived from 4/4/9 kcal per gram of carbohydrate,
  protein and fat.
- Gradual digestion, short-term accessible energy and long-term reserves.
- Environmental hydration loss, drinking, exertion, weather-related costs.
- Sleep pressure, stress and circadian timing.
- A rolling 24-simulation-hour nutrient intake log and diversity summary.
- Five 0-to-100 GAME hormone-like signals: ghrelin, leptin, insulin,
  cortisol and melatonin.
- Save restoration, bounds checking and reconciliation with legacy stacks.

The first food profiles are handcrafted approximate game content. They have
NOT been sourced from exact USDA food identifiers or validated for use in
human diet analysis. Future catalog entries should carry source ID, serving
weight, preparation type and dataset version, using USDA FoodData Central.

The current daily nutrient coverage targets are gameplay values. They are
not dietary reference recommendations for people; human dietary targets
vary with age, physiology and life stage.

Sources:
- USDA FoodData Central: https://fdc.nal.usda.gov/api-guide/
- NIH nutrient references: https://ods.od.nih.gov/HealthInformation/nutrientrecommendations/

### Endocrine scope and scientific honesty

Hormones are not personality traits. They are biological signals mediated by
metabolic, endocrine, environmental and neural feedback systems. In the game:

- Ghrelin rises with fasting and contributes to experienced hunger.
- Leptin changes slowly with modeled long-term energy status.
- Insulin is a bounded digestion/carbohydrate-response PROXY.
- Cortisol reflects coarse circadian arousal plus modeled stress.
- Melatonin reflects time-of-day sleep timing, not sleep stage or diagnosis.

These numbers are NORMALIZED GAME INDICES, not measured serum
concentrations, diagnoses, blood sugar measurements or drug-dose inputs.
The equations and time constants are gameplay heuristics. Even research
findings about the effects of sleep restriction on leptin and ghrelin
are mixed. Avoid overstating universal hormonal responses.

- Appetite physiology: https://www.ncbi.nlm.nih.gov/books/NBK555906/
- Energy homeostasis: https://www.ncbi.nlm.nih.gov/books/NBK570658/
- Sleep physiology: https://www.ncbi.nlm.nih.gov/books/NBK482512/
- Meta-analysis finding mixed hormone effects:
  https://pubmed.ncbi.nlm.nih.gov/30870662/

The model should hear: "I'm thirsty, hungry, sleepy and exhausted."
It should not receive internal numerical hormone values it could not sense.
The inspector may show the latter as explicitly labeled game proxies.
Physiological sex differentiation, sex steroid cycles, reproduction,
disease, infections, drugs, puberty and organ systems are NOT implemented
and cannot be inferred from these simplified signals.

## 4. Memory architecture to implement next

World events are factual. Personal memory and belief are perspectival.

**World ledger:** append-only event ID, simulation time, actor, action,
validated arguments, results, location, observer set, provenance. No AI
response can fabricate an authoritative harvest or trade outcome.

**Episodic memory:** character-specific observations of the world,
conversations and subjective feelings. Include timestamp, direct
observation vs hearsay, location, reliability, parties and relevance.
Keep contradictory claims; they are not automatically reconciled.

**Semantic memory and reflection:** retrieved meaning and interpretations
built from episodes. Generated summaries should explicitly refer to
supporting episode IDs and should not erase original facts.

**Procedural memory:** acquired skills, habits and successful plans have
mechanical ground truth in code; AI can describe a personal preference
for an activity without generating free expertise.

Example: Mara tells Jonas about a river. The river remains a world fact
only if it exists. Jonas gains a secondhand claim, not omniscient river
coordinates. His subsequent exploration can confirm or refute the claim.

Current state: NPCs still have short browser-local memory lists, not an
append-only event ledger, observer sets or semantic search. This requires
a dedicated implementation phase.

## 5. Ecological roadmap

First create tested stock-and-flow systems per biome: plant biomass,
water, soil nutrients, shelter resources and seasonal growth. Explicit
harvesting must remove biomass, with regrowth driven by conditions. Add
animal populations, food webs, migration and reproduction only after
plant/soil/water mechanics are consistent.

Pollution and waste require sourced flows and sinks, not arbitrary
unexplained state mutation. Economic exchange needs actual goods and
ownership; laws and civic institutions follow shared-resource conflict
and collective agent coordination rather than hardcoded social roles.

## 6. Execution and performance

Local 4B inference on a 6GB GPU cannot evaluate every footstep,
digestive increment, harvesting animation or hormone tick.

Use game code for continuous simulation; spend model calls on meaningful
events, significant goal decisions, interactions, and occasional
reflection. The server's high-priority player dialogue must remain
responsive while low-priority background cognition can be cancelled.

The current Node inference bridge handles this partially. Before
supporting hundreds of residents or long-running economies, move
simulation authority, event recording and snapshot storage to the Node
server with deterministic tick replay and typed event contracts.

## 7. Verification gates and limitations

- No harvested item without depletion of an existing source.
- No food transfer unless the donor possessed that exact portion.
- Digestion cannot create more energy than the consumed meal provided.
- Biological values stay finite and bounded under variable timestep.
- Recent intake is based on simulated world hours, not wall-clock hours.
- Rest, hunger and weather influence simulation state even offline.
- NPC prompts include private sensations, not other agents' hidden state.
- Interrupted model requests cannot retroactively apply outdated effects.
- Invalid and legacy saves restore to bounded consistent defaults.
- Endocrine game indices are never represented as clinical measurements.

Current tests cover food composition, digestion, nutrient logs, water
loss and replenishment, stress/sleep pressure, circadian signal changes,
item transfer, legacy reconciliation, plus existing survival, physics,
dialogue and Windows launcher regression suites.

## 8. Recommended next milestones

**A. This phase:** deterministic biological state and nutrient composition,
validated food identity across harvest/eat/share, cognition sensations,
persistence and debugging.

**B. Next infrastructure phase:** server-owned world event ledger,
personal observation records, memory retrieval with provenance,
typed world action API, replayable saves and prioritized cognition.

**C. After B:** conserved ecosystem stocks, plant and animal ecology,
farming, spoilage, food processing and multiple nutrient sources.

**D. Longer term:** injury and illness, modeled physiology variability,
validated nutritional catalogs, more complex endocrine modules and
calibrated consequences. Expand only with explicit mechanics and tests.

**E. Emergent society:** negotiated specialization, property, trade,
relationships, norms, cooperation, conflict and rule formation.

The goal is a testable living-world simulation with autonomous cognition,
not a game where the LLM writes every physical consequence.

## Procedural resident profiles

Founders and arrivals use the same generator. World seed, resident ID, and stable per-field salts produce the original identity plus a versioned appearance and 35 numeric traits. The map and inspector render the same layered skin, hair, face, eyes, clothing, build, and detail profile. Appearance never enters decision scoring.

Temperament covers exploration, work habits, social style, cooperation, emotional regulation, learning, and priorities. Orientation values set broad tendencies. Individual facets refine action scores, affect social willingness, and change how quickly emotional state recovers. Existing physiological urgency, private evidence, and legal affordances still govern what a resident can do.

Joy, calm, concern, and frustration have personal baselines. Bodily strain shifts the current values, and each resident recovers at a trait-dependent rate. Actual help and material competition can cause brief emotional changes. The inspector shows both current values and the baseline. A version 3 checkpoint preserves supported visual and trait fields and current emotions. Missing or invalid fields are regenerated or reset individually.
