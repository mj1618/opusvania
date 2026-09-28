# Memory index

Shared project knowledge. One topic per file, one line per file here: `- [Title](file.md) — hook`.
Keep entries current; delete stale ones.

<!-- entries below -->
- [Debug API](debug-api.md) — `window.__game` methods (trace, events, save/restore, tuning, tapes), input DSL, URL params
- [Clip tool](clip-tool.md) — `npm run clip` mp4/GIF/contact sheets, `--study` motion trail + event keyframes + frame numbers
- [Sim architecture](sim-architecture.md) — how sim, Game harness, loop, input and replays fit together
- [Toolchain](toolchain.md) — ports, vite preview base gotcha, TS7/Biome quirks, why each dev dep exists
- [Sim adapter](sim-adapter.md) — the one file to fix when the controller/rooms change; what tools probe
- [Replays and tapes](replays-and-tapes.md) — golden tapes in tests/replays, stale vs mismatch, build stamp
- [Search bot](bot.md) — `npm run bot` / `bot:all`: macro A* reachability, budgets, exhausted vs not-found, speed
- [Feel report](feel-report.md) — `npm run feel:report`: metric definitions, envelope, forgiveness sweeps
- [Loop timing](loop-timing.md) — why the fixed-step loop snaps near-60Hz frame times
