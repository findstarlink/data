const predict = require('sat-timings')
const celestrak = require('./celestrak')
const util = require('./util')

let satCoordCache = {}
const SATS_WITH_MISSING_TLE = []

module.exports = { updateTLE }

async function updateTLE(TLE) {
    const newSatData = await updateSatTLEs(TLE)

    await updateLaunchesWithReplacementNoradIds(newSatData)

    if (SATS_WITH_MISSING_TLE.length > 0) {
        throw new Error('[ERROR] Could not find TLE for ' + SATS_WITH_MISSING_TLE.length + ' satellites in supplemental list: ' + SATS_WITH_MISSING_TLE.join(', '))
    }

    return newSatData
}

async function updateSatTLEs(TLE) {
    let activeSats = TLE.satellites.filter(sat => sat.active)

    for (var i = 0; i < activeSats.length; i++) {
        let sat = activeSats[i]
        let tle = await celestrak.getTLE(sat.noradId, sat.tleUrl)

        if (tle === undefined) {
            SATS_WITH_MISSING_TLE.push(sat.noradId)
            console.log('Could not find TLE for ' + sat.name + ' (' + sat.noradId + ') in URL: ' + sat.tleUrl)
            continue
        }

        util.checkTLEAge(sat.name, tle)
        util.checkTLEValidity(sat.name, tle)

        sat.tle = tle

        if (sat.batch) {
            for (let idx in sat.batch) {
                let batchSat = sat.batch[idx]
                let newTle = await celestrak.getTLE(batchSat.noradId, sat.tleUrl)
                if (newTle !== undefined) {
                    batchSat.tle = newTle
                }
            }
        }
    }

    return TLE
}

// replace newly launched sat ids with a supplemental noradId, if available
async function updateLaunchesWithReplacementNoradIds(newSatData) {
    let supplementalList = await celestrak.getAllTLEs(celestrak.STARLINK_SUPPLEMENTAL_URL)

    // Example switches: 72001 (on launch) -> 72010 (a few days later) -> 68012 (after official switch)

    let satsToReplace = newSatData.satellites.filter(sat => {
        if (!sat.active) {
            return false
        }

        if (sat.tleUrl.includes("starlink-g")) {  // it's a new launch, e.g. 72001 -> 72010
            return true
        }

        if (supplementalList[sat.noradId] === undefined) { // e.g. 72010 -> 68012
            // it's a provisional to official id switch, since the noradId wasn't found in the list
            return true
        }

        return false
    })

    satCoordCache = {}

    for (let idx in satsToReplace) {
        let newSat = satsToReplace[idx]

        await replaceSatNoradId(newSat)
    }
}

async function replaceSatNoradId(sat) {
    let replacementSats = await getReplacementSats(sat)
    if (replacementSats.length === 0) {
        return
    }

    replacementSats = Object.values(replacementSats)

    let replacementNoradId = replacementSats[0].noradId
    let replacementTLE = replacementSats[0].tle

    try {
        util.checkTLEValidity(sat.noradId, replacementTLE)

        let satLabel = `${sat.name ? sat.name : ''} (${sat.noradId})`
        let logMsg = `Replaced NORAD ID ${satLabel} with ${replacementNoradId}`
        console.log(logMsg)

        let oldSatId = sat.noradId
        sat.noradId = replacementNoradId
        sat.tle = replacementTLE

        // remove from missing list, if present
        let idx = SATS_WITH_MISSING_TLE.indexOf(oldSatId)
        if (idx !== -1) {
            SATS_WITH_MISSING_TLE.splice(idx, 1)
        }

        sat.tleUrl = celestrak.STARLINK_SUPPLEMENTAL_URL
        sat.batch = replacementSats
    } catch (e) {
        console.error('cannot replace', sat.name, 'with invalid TLE', replacementTLE, e)
    }
}

async function getReplacementSats(satToReplace) {
    // if (satToReplace.name) {
    //     console.log('checking', satToReplace.name, satToReplace.noradId)
    // } else {
    //     console.log(' > checking batch', satToReplace.noradId)
    // }

    if (!satToReplace.intDes) {
        throw new Error('sat ' + satToReplace.name + ' (' + satToReplace.noradId + ') is missing intDes, cannot reliably find replacement TLE')
    }

    let tleURL = `https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?INTDES=${satToReplace.intDes}&FORMAT=tle`
    return await celestrak.getAllTLEs(tleURL)
}
