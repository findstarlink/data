const fs = require('fs')

const LOCAL_TLE_JSON_FILE = 'tle.json'
const ONE_DAY = 24 * 60 * 60 * 1000
const MAX_LAUNCH_AGE_DAYS = 20
const MAX_LAUNCH_AGE_MS = MAX_LAUNCH_AGE_DAYS * ONE_DAY

function pruneOldLaunches() {
    const tles = JSON.parse(fs.readFileSync(LOCAL_TLE_JSON_FILE, 'utf8'))
    const satellitesBefore = tles.satellites
    const now = Date.now()
    const prunedSatellites = []

    tles.satellites = satellitesBefore.filter(sat => {
        if (!sat.launchDate) {
            return true
        }

        const launchTime = new Date(sat.launchDate).getTime()
        if (Number.isNaN(launchTime)) {
            console.warn(`Skipping ${sat.name}: invalid launchDate ${sat.launchDate}`)
            return true
        }

        if ((now - launchTime) > MAX_LAUNCH_AGE_MS) {
            prunedSatellites.push(sat)
            return false
        }

        return true
    })

    if (prunedSatellites.length === 0) {
        console.log(`No launches older than ${MAX_LAUNCH_AGE_DAYS} days found`)
        return
    }

    fs.writeFileSync(LOCAL_TLE_JSON_FILE, JSON.stringify(tles, null, 4))
    console.log(`Pruned old launches (${prunedSatellites.length}): ${prunedSatellites.map(sat => sat.title || sat.name).join(', ')}`)
}

process.on('unhandledRejection', reason => {
    console.error('[FATAL] Unhandled Promise Rejection:', reason)
    process.exit(1)
})

process.on('uncaughtException', err => {
    console.error('[FATAL] Uncaught Exception:', err)
    process.exit(1)
})

pruneOldLaunches()
