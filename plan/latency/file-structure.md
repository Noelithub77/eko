# Files

- `frontend/shared/utils/latency-summary.ts`: shared rolling summaries for UI and operators.
- `frontend/shared/utils/web-rtc-stats.ts`: selected-pair and path interpretation.
- `frontend/web/client/features/playback/`: recent stats and signaling profiler delivery.
- `frontend/desktop/features/devices/`: per-listener delay and detail popup.
- `rust/src/profiler.rs`: bounded validated samples, canonical device and room, frontend command.
- `scripts/latency/`: bounded live profiling, capture comparison and headless media experiments.
- `tests/latency/`: reporting and buffering regressions.
- `.agents/skills/eko-latency/SKILL.md`: discoverable agent workflow.
- `docs/latency.md`: operator reference, measurement limits and ranked approaches.
