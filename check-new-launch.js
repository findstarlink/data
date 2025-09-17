const fs = require('fs')

const LAUNCH_API_URL = "https://ll.thespacedevs.com/2.2.0/launch/previous/?search=starlink&limit=1"
const LOCAL_TLE_JSON_FILE = 'tle.json'

const ONE_HOUR = 60 * 60 * 1000
const ALERT_TILL = 2 * ONE_HOUR // after launch

async function checkForLaunch() {
    try {
        let res = await fetch(LAUNCH_API_URL)
        let prevLaunches = await res.json()
        let prevLaunch = prevLaunches.results[0]
        let prevLaunchDate = new Date(prevLaunch.net)
        let launchTimeDiff = new Date().getTime() - prevLaunchDate.getTime()

        if (launchTimeDiff < ALERT_TILL) {
            console.log(prevLaunch.name, prevLaunch.net, new Date(prevLaunch.net), new Date())
            await checkAndRegisterTLE(prevLaunch.name, prevLaunch.net)
        }

        console.log(`Previous launch (${prevLaunch.name}) was at ${prevLaunchDate} which is ${(launchTimeDiff / ONE_HOUR).toFixed(2)} hours ago`)
    } catch (e) {
        throw e
    }
}

async function checkAndRegisterTLE(launchName, launchDate) {
    let launchDateTs = new Date(launchDate) // launchDate example: "2024-10-30T21:10:00Z"
    let groupInfo = launchName.split(" ") // launchName example: "Falcon 9 Block 5 | Starlink Group 10-13"
    groupInfo = groupInfo[groupInfo.length - 1]

    // check if this launch has already been recorded in tle.json
    const tles = JSON.parse(fs.readFileSync(LOCAL_TLE_JSON_FILE, 'utf8'))
    let sats = tles.satellites

    for (let idx in sats) {
        let sat = sats[idx]
        if (sat.title.indexOf("(G" + groupInfo + ")") !== -1) {
            console.log("This launch has already been recorded in tle.json, bailing!")
            return
        }
    }

    // else, make a new entry at the top of tle.json
    let mostRecentEntry = sats[0]
    let mostRecentEntryId = parseInt(mostRecentEntry.name.replace("starlink", ""))
    let newSatEntryId = mostRecentEntryId + 1

    // insert the current TLE values, instead of relying on the deployment to set the correct TLE values.
    // otherwise the new launch will work with a bad TLE if the deployment step fails (e.g. due to outdated TLEs of other sats)
    let tleUrl = `http://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink-g${groupInfo}&FORMAT=tle`
    let tleUrlRes = await fetch(tleUrl)
    tleUrlRes = await tleUrlRes.text()
    tleUrlRes = tleUrlRes.split(/\r?\n/)  // split lines
    let tle = [
        tleUrlRes[4],
        tleUrlRes[5]
    ]
    let noradId = tleUrlRes[5].split(" ")[1].trim()

    let newSatEntry = {
        "name": `starlink${newSatEntryId}`,
        "title": `Starlink-${newSatEntryId} (G${groupInfo})`,
        "tle": tle,
        "stdMag": 5,
        "noradId": noradId,
        "tleUrl": tleUrl,
        "launchDate": launchDateTs.toISOString(),
        "active": true
    }

    // insert the new entry at the top
    tles.satellites.unshift(newSatEntry)

    console.log("Added new launch", JSON.stringify(newSatEntry))

    // deploy the new TLE
    fs.writeFileSync(LOCAL_TLE_JSON_FILE, JSON.stringify(tles, null, 4))
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

// checkAndRegisterTLE("Falcon 9 Block 5 | Starlink Group 10-14", "2024-11-05T11:10:00Z")

checkForLaunch()
