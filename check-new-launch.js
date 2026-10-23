const fs = require('fs')

const LAUNCH_API_URL = "https://ll.thespacedevs.com/2.3.0/launches/previous/?search=starlink&limit=10"
const LOCAL_SAT_DATA_JSON_FILE = 'sat-data.json'

const ONE_HOUR = 60 * 60 * 1000
const CHECK_TILL = 5 * ONE_HOUR // after launch

async function checkForLaunch(dataFile = LOCAL_SAT_DATA_JSON_FILE) {
    let res = await fetch(LAUNCH_API_URL)
    let prevLaunches = await res.json()
    if (!prevLaunches.results || prevLaunches.results.length === 0) {
        console.log('No previous launches returned from launch API')
        return
    }

    const satData = JSON.parse(fs.readFileSync(dataFile, 'utf8'))

    // log every launch returned by the API (newest-first, as returned)
    for (let prevLaunch of prevLaunches.results) {
        let prevLaunchDate = new Date(prevLaunch.net) // example: "2024-10-30T21:10:00Z"
        let launchTimeDiff = new Date().getTime() - prevLaunchDate.getTime()

        console.log(`Previous launch (${prevLaunch.name}) was at ${prevLaunchDate} which is ${(launchTimeDiff / ONE_HOUR).toFixed(2)} hours ago`)
    }

    // multiple Starlink launches can happen within the CHECK_TILL window, so all of them are
    // checked (not just the most recent one). they are processed oldest-first, so that satellite
    // ids increase chronologically and the newest launch ends up at the top of sat-data.json.
    const now = new Date().getTime()
    const recentLaunches = prevLaunches.results
        .filter(launch => now - new Date(launch.net).getTime() < CHECK_TILL)
        .sort((a, b) => new Date(a.net) - new Date(b.net))

    for (let prevLaunch of recentLaunches) {
        let prevLaunchIntDes = prevLaunch.launch_designator
        let prevLaunchDate = new Date(prevLaunch.net)

        let added = await checkAndRegisterLaunchData(prevLaunch.name, prevLaunchIntDes, prevLaunchDate, satData)
        if (added) {
            fs.writeFileSync(dataFile, JSON.stringify(satData, null, 4))
        }
    }
}

// returns true if a new entry was added to satData.satellites
async function checkAndRegisterLaunchData(launchName, launchIntDes, launchDateTs, satData) {
    let groupInfo = extractLaunchGroup(launchName)
    if (groupInfo === null) {
        console.log(`Could not parse the Starlink group from launch name: ${launchName}, skipping!`)
        return false
    }

    // check if this launch has already been recorded in sat-data.json
    let sats = satData.satellites
    for (let idx in sats) {
        let sat = sats[idx]
        if (sat.title.indexOf("(G" + groupInfo + ")") !== -1) {
            console.log(`This launch (${launchName}) has already been recorded in sat-data.json, bailing!`)
            return false
        }
    }

    // else, make a new entry at the top of sat-data.json
    let mostRecentEntry = sats[0]
    let mostRecentEntryId = parseInt(mostRecentEntry.name.replace("starlink", ""))
    let newSatEntryId = mostRecentEntryId + 1

    // insert the current orbital data so a deployment failure does not leave the new launch without usable elements.
    // the per-launch CelesTrak file only exists for a few days after launch, so a missing or invalid
    // file is skipped gracefully — the next scheduled run retries while the launch is within CHECK_TILL.
    let launchOrbitalData = await fetchLaunchOrbitalData(groupInfo)
    if (launchOrbitalData === null) {
        return false
    }

    let omm = launchOrbitalData.ommList[1] // the per-launch file has the STACK first, then the SINGLE object
    let noradId = String(omm.NORAD_CAT_ID)
    let intDes = launchIntDes || omm.OBJECT_ID || null

    let newSatEntry = {
        "name": `starlink${newSatEntryId}`,
        "title": `Starlink-${newSatEntryId} (G${groupInfo})`,
        "omm": omm,
        "stdMag": 5,
        "noradId": noradId,
        "intDes": intDes,
        "dataUrl": launchOrbitalData.dataUrl,
        "launchDate": launchDateTs.toISOString(),
        "active": true
    }

    // insert the new entry at the top
    satData.satellites.unshift(newSatEntry)

    console.log("Added new launch", JSON.stringify(newSatEntry))
    return true
}

// extracts the Starlink group (e.g. "10-13") from a launch name:
//   "Falcon 9 Block 5 | Starlink Group 10-13" -> "10-13"
//   "Starship | Starlink Group 31-1 (Starship Flight 14)" -> "31-1"
// returns null if the name has no parseable group.
function extractLaunchGroup(launchName) {
    const match = launchName.match(/starlink(?:\s+group)?\s+(\d+-\d+)/i)
    return match ? match[1] : null
}

// returns { dataUrl, ommList } for the launch, or null if the per-launch CelesTrak file is
// unavailable (it only exists for a few days after launch, so treat that as a skip, not an error).
// note: CelesTrak returns HTTP 200 with a plain-text error body for unknown files, which fails
// JSON parsing — so the JSON error must also be caught here.
async function fetchLaunchOrbitalData(groupInfo) {
    const dataUrl = `https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink-g${groupInfo}&FORMAT=json`
    try {
        let res = await fetch(dataUrl)
        if (!res.ok) {
            console.log(`Unable to fetch launch orbital data (${res.status}) from ${dataUrl}, skipping this run!`)
            return null
        }

        let ommList = await res.json()
        if (!Array.isArray(ommList) || ommList.length < 2) {
            console.log(`No launch orbital data (or too few entries) returned from ${dataUrl}, skipping this run!`)
            return null
        }

        return { dataUrl, ommList }
    } catch (e) {
        console.log(`Could not fetch launch orbital data from ${dataUrl} (${e.message}), skipping this run!`)
        return null
    }
}

// Global error handlers for unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL] Unhandled Promise Rejection:', reason)
    process.exit(1)
})

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err)
    process.exit(1)
})

if (require.main === module) {
    checkForLaunch()
}

module.exports = { checkForLaunch, extractLaunchGroup }

