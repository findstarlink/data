# data
Updates the published satellite data and strings data.

* Satellite data: [https://data.findstarlink.com/sat-data.json](https://data.findstarlink.com/sat-data.json)
* Strings: [https://data.findstarlink.com/strings_en-US.json](https://data.findstarlink.com/strings_en-US.json)

### Operations
* [check_for_new_launch.yml](.github/workflows/check_for_new_launch.yml) runs every 2 hours to check for a new launch of Starlink. Every launch whose `net` time is within 5 hours of the run is registered in `sat-data.json` — multiple Starlink launches within that window are all registered. Orbital data is read from the per-launch CelesTrak file (`FILE=starlink-g<group>`), which only exists for a few days after a launch, so a missing file is skipped gracefully (the next run retries while the launch is within the window).
* [prune_old_launches.yml](.github/workflows/prune_old_launches.yml) runs every Thursday to remove launches older than 20 days from `sat-data.json`.
* [update_sat_data.yml](.github/workflows/update_sat_data.yml) runs every 12 hours to update the orbital data (from CelesTrak supplemental OMM JSON) and strings data.
* [ci_deploy_workflow.yml](.github/workflows/ci_deploy_workflow.yml) deploys the latest data to Cloudflare Pages on every push to the main branch.
* [refresh_cache_workflow.yml](.github/workflows/refresh_cache_workflow.yml) refreshes the Cloudflare and AWS Lambda caches when a new release is created.

### Data Sources
- Satellite element data is sourced from [CelesTrak supplemental OMM JSON](https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json).

### Caching
- CelesTrak supplemental OMM data is a mirror of an external source, so it is **not stored in git** (see `.gitignore`).
- Each update run downloads the mirror from CelesTrak to a local `celestrak.json` (`update-data/celestrak.js`), which is then read from disk — the file is just not committed anymore.
- The deploy workflow (`ci_deploy_workflow.yml`) downloads the mirror at deploy time to build the published `celestrak.js`/`celestrak.json` on data.findstarlink.com.

### Testing
- [check-new-launch.js](check-new-launch.js) is covered by [node:test](https://nodejs.org/api/test.html) tests in [test/](test/) with mocked network calls (no real API/CelesTrak hits).
- Run them from this directory with:
  ```
  node --test test/check-new-launch.test.js
  ```
