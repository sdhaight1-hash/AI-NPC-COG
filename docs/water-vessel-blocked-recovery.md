# Bounded recovery for blocked water-vessel projects

## Bounded recovery from a blocked water-vessel project

An unavailable physical source or a failed completion remains an explicit `BLOCKED` project with a named prerequisite and an exponentially lengthening retry time (15–360 simulated minutes). The same impossible action is not scheduled every decision tick. Resource scouting is limited to four committed exploration attempts per missing prerequisite; subsequent exploratory activity must be an independently chosen ordinary action rather than compulsory project work. A newly available legal collection affordance can reopen the blocked prerequisite without resetting completed manufacturing dependencies.

While waiting, the resident may rest, drink at a real source, eat, forage, investigate, explore, or socialize. The offline scheduler does **not** start unrelated manufacturing that would consume project materials during this recovery interval. Neither the fallback nor a failed physical command grants items. Per-node scout and failure counts survive v3 checkpoint restore. The behavior is covered by `tests/blocked-water-project.test.mjs`, including a verified failed receipt after source depletion between claim and completion.

This is bounded recovery, not a complete social assistance or dynamic planning system. Further work should incorporate newly verified resource evidence, direct requests for help, and explicit abandonment or re-planning when waiting would harm survival.