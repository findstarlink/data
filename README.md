# data
Updates the TLE and strings data.

* TLE: [https://data.findstarlink.com/tle.json](https://data.findstarlink.com/tle.json)
* Strings: [https://data.findstarlink.com/strings_en-US.json](https://data.findstarlink.com/strings_en-US.json)

### Operations
* [check_for_new_launch.yml](.github/workflows/check_for_new_launch.yml) runs every 2 hours to check for a new launch of Starlink.
* [update_tle_data.yml](.github/workflows/update_tle_data.yml) runs every 6 hours to update the TLE (from Celestrak) and strings data.
* [ci_deploy_workflow.yml](.github/workflows/ci_deploy_workflow.yml) deploys the latest data to Cloudflare Pages on every push to the main branch.
* [refresh_cache_workflow.yml](.github/workflows/refresh_cache_workflow.yml) refreshes the Cloudflare and AWS Lambda caches when a new release is created.

### Data Sources
- TLE data is sourced from [Celestrak](https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json).
