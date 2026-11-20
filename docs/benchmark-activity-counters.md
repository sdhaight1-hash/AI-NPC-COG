# Activity outcome telemetry in headless benchmarks

The headless scenario runner and long-running no-LLM soak now report `liveActivityCounters`: the sum of `started`, `completed`, `failed`, `blocked` and `abandoned` fields from the **retained, living NPCs' authoritative activity statistics**. Every key is present even when its value is zero. Results remain deterministic for identical seeds and schedules.

These counters complement (rather than replace) the `committed` and `rejected` physical-world receipt counts. A project being temporarily `BLOCKED` need not equal an abandoned activity; missing resources may result in project backoff instead of a terminated activity. The counters do **not** include deceased actors' discarded live statistics or historical project outcomes beyond the saved receipt window. The `autonomous_N_day_soak` output still gives the death summary and retained project completion count separately.

`tests/benchmarks.test.mjs` requires a positive real activity-completion count in the empty-handed flask-production scenario and checks that blocked/abandoned counters are numeric and nonnegative in production and soak runs. Further validation should add deliberate blocked and abandoned activity fixtures with positive counts; including a field with value 0 is not proof that the associated transition occurred.

Direct project activities include a stable project ID, project kind, and prerequisite ID in their receipt context. The fields survive save, interruption, resume, and completion. For example, an exploration receipt with `projectKind: shelter` and `projectNodeId: wood` traces a search for missing wood. The resident inspector shows the prerequisite on recent receipts. Routine exploration has no project attribution.
