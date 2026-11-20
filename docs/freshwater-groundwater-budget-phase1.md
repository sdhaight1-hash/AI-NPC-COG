# Finite spring/catchment water budget — ecology gate #72, phase 1

Each generated freshwater spring now has two **physical** stores in the same 400 mL units as `drink_source`, `fill_water` and wet vessel-seal trials: `stock` (locally extractable surface water, bounded by the existing `max`), and `groundwater` (finite subsurface supply). A newly generated spring starts with twelve times its surface capacity in its aquifer, capped at sixteen times capacity. This is an explicitly modeled initial stock, not recurring unlimited regeneration.

`AgentWorld.regenerate` moves water **from the existing aquifer to the surface stock**, at a bounded discharge rate. Clear weather adds nothing. Rain, storm and snow add a measured external `rainAdmitted` amount to subsurface storage; rainfall above the capacity cap is not retained. The model keeps the transfer and accumulated rainfall separate. An empty aquifer cannot be discharged indefinitely, and fractional pending discharge does not bank unlimited imaginary future water. Ordinary source drinking, carried flask filling, and seal tests still debit the exact same extractable surface stock using their existing reservation and receipt pathways. Geological mineral deposits remain nonrenewable as before.

For a single unchanged spring and time interval, under fixed source extraction and no separate sinks, the testable accounting identity is:

`surface_after + groundwater_after = surface_before + groundwater_before + admitted_rain - extracted_water`

No change is made to `Perception` or model prompts: NPCs can see a spring's location and inspect **surface stock** but cannot remotely query its current groundwater. Observations of an empty spring must still be discovered through the usual private evidence paths.

Legacy v3 saves with no subsurface fields migrate once to that seed's initial finite aquifer. Current saves retain the bounded groundwater and total admitted precipitation exactly through checkpoints; invalid values are rejected. One-minute and 240-minute simulation partition checks exercise the same world clock and reservoir updates.

## Limits and validation gates

This is a deliberately small **catchment-budget prototype**, not a full mass-conserved hydrological cycle. Rain is externally supplied according to the existing weather generator; atmospheric vapor, evaporation, runoff beyond the local cap, hydraulic connectivity and stream flow are not yet simulated as finite stores. Wood/food/fiber still use provisional growth rates and need biomass/species/soil budgets. Spring depth and regional recharge are not geologically calibrated, and snow is presently an immediate equivalent source of catchment water. Those are unimplemented work under #72, not hidden claims of realism.

The generated aquifer size is a survival balance parameter. The unchanged seven-day founder viability test and 30-day soak **must pass** before merge. If they fail, investigate actual dry-source behavior and agent adaptation rather than granting fictional inventory or lowering mortality gates.

`tests/spring-groundwater-budget.test.mjs` covers dry-year exhaustion, exact discharge store transfer, rainfall input/cap, source-extraction receipts, v3 migration and deterministic simulation time partition.
