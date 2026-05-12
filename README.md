# data
Updates the published satellite data and strings data.

* Satellite data: [https://data.findstarlink.com/sat-data.json](https://data.findstarlink.com/sat-data.json)
* Strings: [https://data.findstarlink.com/strings_en-US.json](https://data.findstarlink.com/strings_en-US.json)

### Operations
* [check_for_new_launch.yml](.github/workflows/check_for_new_launch.yml) runs every 2 hours to check for a new launch of Starlink.
* [prune_old_launches.yml](.github/workflows/prune_old_launches.yml) runs every Thursday to remove launches older than 20 days from `sat-data.json`.
* [update_tle_data.yml](.github/workflows/update_tle_data.yml) runs every 12 hours to update the orbital data (from CelesTrak supplemental OMM JSON) and strings data.
* [ci_deploy_workflow.yml](.github/workflows/ci_deploy_workflow.yml) deploys the latest data to Cloudflare Pages on every push to the main branch.
* [refresh_cache_workflow.yml](.github/workflows/refresh_cache_workflow.yml) refreshes the Cloudflare and AWS Lambda caches when a new release is created.

### Data Sources
- Satellite element data is sourced from [CelesTrak supplemental OMM JSON](https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json).
