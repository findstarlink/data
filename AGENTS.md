# data/ Notes

- `check-new-launch.js` is invoked as a standalone CLI by `.github/workflows/check_for_new_launch.yml` (every 2 hours). The workflow greps its stdout for the exact string `Added new launch` to decide whether to commit/push and trigger `update_sat_data.yml` — keep that log line intact when refactoring.
- New satellite entries in `sat-data.json` use the shape `{ name: starlink<N>, title: "Starlink-<N> (G<group>)", omm, stdMag, noradId, intDes, dataUrl, launchDate, active }`. The group is parsed from the launch name (`"Starship | Starlink Group 31-1 (Starship Flight 14)"` → `31-1`), NOT from the last token of the name (that caused the Sept 2026 Starship launch miss).
- Dedup is by the `(G<group>)` substring in satellite titles. Satellite ids increment from the current top entry (`satellites[0].name`).
- Per-launch CelesTrak files (`FILE=starlink-g<group>`) only exist for a few days after a launch. A missing/invalid file is a graceful skip (log + retry on the next run), never a crash. CelesTrak also returns HTTP 200 with a plain-text error body for unknown files, which fails JSON parsing — handle both.
- `checkForLaunch()` processes ALL launches within the 5-hour `CHECK_TILL` window (oldest-first, so ids increase chronologically), not just the most recent one.
- Tests use the built-in `node:test` runner with mocked `fetch` and temp `sat-data.json` files; run from this directory: `node --test test/check-new-launch.test.js`.
- The CelesTrak supplemental mirror (`celestrak.json`) is gitignored and downloaded at runtime; published data goes to data.findstarlink.com (see README.md).
