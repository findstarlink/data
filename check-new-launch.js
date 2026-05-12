const fs = require('fs')

const LAUNCH_API_URL = "https://ll.thespacedevs.com/2.3.0/launches/previous/?search=starlink&limit=1"
const LOCAL_SAT_DATA_JSON_FILE = 'sat-data.json'

const ONE_HOUR = 60 * 60 * 1000
const CHECK_TILL = 5 * ONE_HOUR // after launch

async function checkForLaunch() {
    try {
        let res = await fetch(LAUNCH_API_URL)
        let prevLaunches = await res.json()
        if (!prevLaunches.results || prevLaunches.results.length === 0) {
            console.log('No previous launches returned from launch API')
            return
        }

        let prevLaunch = prevLaunches.results[0]
        let prevLaunchIntDes = prevLaunch.launch_designator
        let prevLaunchDate = new Date(prevLaunch.net) // example: "2024-10-30T21:10:00Z"
        let launchTimeDiff = new Date().getTime() - prevLaunchDate.getTime()

        if (launchTimeDiff < CHECK_TILL) {
            await checkAndRegisterLaunchData(prevLaunch.name, prevLaunchIntDes, prevLaunchDate)
        }

        console.log(`Previous launch (${prevLaunch.name}) was at ${prevLaunchDate} which is ${(launchTimeDiff / ONE_HOUR).toFixed(2)} hours ago`)
    } catch (e) {
        throw e
    }
}

async function checkAndRegisterLaunchData(launchName, launchIntDes, launchDateTs) {
    let groupInfo = launchName.split(" ") // launchName example: "Falcon 9 Block 5 | Starlink Group 10-13"
    groupInfo = groupInfo[groupInfo.length - 1]

    // check if this launch has already been recorded in sat-data.json
    const satData = JSON.parse(fs.readFileSync(LOCAL_SAT_DATA_JSON_FILE, 'utf8'))
    let sats = satData.satellites

    for (let idx in sats) {
        let sat = sats[idx]
        if (sat.title.indexOf("(G" + groupInfo + ")") !== -1) {
            console.log("This launch has already been recorded in sat-data.json, bailing!")
            return
        }
    }

    // else, make a new entry at the top of sat-data.json
    let mostRecentEntry = sats[0]
    let mostRecentEntryId = parseInt(mostRecentEntry.name.replace("starlink", ""))
    let newSatEntryId = mostRecentEntryId + 1

    // insert the current orbital data so a deployment failure does not leave the new launch without usable elements.
    let dataUrl = `https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink-g${groupInfo}&FORMAT=json`
    let dataUrlRes = await fetch(dataUrl)
    if (!dataUrlRes.ok) {
        throw new Error(`Unable to fetch launch orbital data (${dataUrlRes.status}) from ${dataUrl}`)
    }

    let ommList = await dataUrlRes.json()
    if (!Array.isArray(ommList) || ommList.length === 0) {
        throw new Error(`No launch orbital data returned from ${dataUrl}`)
    }

    let omm = ommList[1]
    let noradId = String(omm.NORAD_CAT_ID)
    let intDes = launchIntDes || omm.OBJECT_ID || null

    let newSatEntry = {
        "name": `starlink${newSatEntryId}`,
        "title": `Starlink-${newSatEntryId} (G${groupInfo})`,
        "omm": omm,
        "stdMag": 5,
        "noradId": noradId,
        "intDes": intDes,
        "dataUrl": dataUrl,
        "launchDate": launchDateTs.toISOString(),
        "active": true
    }

    // insert the new entry at the top
    satData.satellites.unshift(newSatEntry)

    console.log("Added new launch", JSON.stringify(newSatEntry))

    fs.writeFileSync(LOCAL_SAT_DATA_JSON_FILE, JSON.stringify(satData, null, 4))
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

// checkAndRegisterLaunchData("Falcon 9 Block 5 | Starlink Group 10-14", "2024-11-05T11:10:00Z")

checkForLaunch()
