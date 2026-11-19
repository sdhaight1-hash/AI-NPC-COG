# Integrated NPC agency — implementation contract

The NPC is an embodied individual, not an LLM request loop. Its personal state
has five connected parts:

1. **Needs:** physiology (hunger, thirst, energy, health), social need and
   curiosity create changing pressures. Urgent survival instinct runs without
   waiting for inference.
2. **Motivations:** stable, non-professional dispositions inferred from the
   character's generated traits combine with current needs and bounded practice
   feedback. Two people can score the same available action differently.
3. **Beliefs:** individual, fallible memories of resource locations and
   conditions, acquired through actual inspection or interaction. No character
   learns another's discoveries from a shared world registry. Old beliefs fade
   in confidence and can be disproved by fresh observation.
4. **Goals and plans:** a chosen intention persists while the existing
   deterministic world planner performs the necessary timed physical substeps.
   Each NPC's agency records the reason, start time and progress. Supply goals,
   discovered construction plans and crafting workpieces remain separate from
   urgent survival reflexes.
5. **Decisions and learning:** only currently legal actions are candidates.
   Utility accounts for physiological pressure, dispositions, personal
   knowledge, recent failures, task distance and existing commitment. Rein or
   Hivemind can decide among this bounded set. In offline mode, or after a
   model abstains, the same legal options support deterministic autonomous
   choices. A completed or failed action changes that NPC's personal evidence,
   modestly reinforces practiced interests, and affects future ranking.

## Execution invariants

- LLM outputs do not change resources, health, relationships or knowledge.
  Only world action completion can produce physical effects or firsthand
  beliefs. Dialogue creates witnessed conversation experience for each
  actual participant, but not automatic transfer of factual resource beliefs.
- No extra per-step model calls: multi-stage construction and crafting jobs
  remain world-authoritative and proceed by simulation time.
- Personal dispositions are **preferences, not locked classes**. Practice
  reinforcement is capped and never grants inaccessible actions.
- An intention has continuity without becoming uninterruptible. Critical
  hunger, dehydration and exhaustion can preempt a task; the existing
  unfinished workpiece remains and resumes under the previous project.
- Personal beliefs and agency restore from version-3 saved NPCs with
  bounded counts, validated fields and conservative defaults. Older saves
  without agency fields remain valid.
- The model scene presents current motives, active intention, own witnessed
  beliefs and relevant episodic recall near its beginning. This matters
  because the decision server bounds scene text to 1,800 characters.

## Verification / gameplay expectations

When observed over multiple simulation hours:
- A thirsty person should prefer real water over idle exploration, while
  other non-emergency preferences differ between individuals.
- A supply project should execute multiple gathering trips with actual
  world-stock reduction, not merely display a goal label.
- Successful tasks and encountered failures should change future choices.
- A distant resource belief can become stale; only renewed observation or
  interaction corrects it.
- Conversations reinforce both participants' social experience without
  telepathic information sharing.
- NPC model request counts and completed physical actions are separate
  metrics, visible in the inspector.

## Deliberate limitations

This is **not** full symbolic HTN/GOAP planning or a human-like psychological
model. Resource selection still uses a small affordance list and short
deterministic plans. Future extension should focus on dependency-based
multi-day projects, resource reservation, cooperation and negotiated shared
goals, reliable misinformation handling, and explicit communication of
structured observations—each tested against resource conservation and
individual knowledge boundaries.
