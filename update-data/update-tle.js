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

    let satsToReplace = newSatData.satellites.filter(sat => {
        if (!sat.active) {
            return false
        }

        if (sat.tleUrl.includes("starlink-g")) {  // it's a new launch
            return true
        }

        if (supplementalList[sat.noradId] === undefined) {
            // it's a provisional to official id switch, since the noradId wasn't found in the list
            return true
        }

        return false
    })

    satCoordCache = {}

    for (let idx in satsToReplace) {
        let newSat = satsToReplace[idx]

        if (newSat.hasOwnProperty("batch")) {  // provisional to official
            for (let batchIdx in newSat.batch) {
                let batchSat = newSat.batch[batchIdx]
                await replaceSatNoradId(batchSat, false)
            }

            await replaceSatNoradId(newSat, false)
        } else {  // new satellite
            await replaceSatNoradId(newSat, true)
        }
    }
}

async function replaceSatNoradId(sat, createBatch) {
    let replacementSats = await getReplacementSats(sat)
    if (replacementSats.length === 0) {
        return
    }

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

        if (createBatch) {
            sat.tleUrl = celestrak.STARLINK_SUPPLEMENTAL_URL
            sat.batch = replacementSats
        }
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

    satToReplace = {  // keep a local copy
        tle: [
            satToReplace.tle[0],
            satToReplace.tle[1]
        ]
    }

    const PATH_CHECK_MINS = 3

    let tleList = await celestrak.getAllTLEs(celestrak.STARLINK_SUPPLEMENTAL_URL)

    // console.log("fetched tle list")

    let currentCoord = predict.getCurrentSatelliteCoords(satToReplace)
    // console.log('curr coord', currentCoord)

    // prepare all the sats
    let allSats = []
    for (let noradId in tleList) {
        allSats.push(tleList[noradId])
    }

    // find nearby sats
    let nearbySats = allSats.filter(sat => {
        if (satCoordCache[sat.noradId] === undefined) {
            satCoordCache[sat.noradId] = predict.getCurrentSatelliteCoords(sat)
        }
        return util.isCoordNearby(satCoordCache[sat.noradId], currentCoord)
    })

    // sort by distance
    nearbySats.forEach(sat => {
        sat.distSqr = util.getCoordDistanceSquared(satCoordCache[sat.noradId], currentCoord)
    })

    nearbySats.sort((a, b) => {
        return a.distSqr - b.distSqr
    })

    nearbySats.forEach(sat => {
        delete sat.distSqr
    })

    // console.log('nearby sats', nearbySats.map(sat => sat.noradId))

    if (nearbySats.length === 0) {
        return nearbySats
    }

    let currentPath = predict.getSatellitePath(satToReplace, PATH_CHECK_MINS).path

    let satsOnSamePath = nearbySats.filter(sat => {
        let path = predict.getSatellitePath(sat, PATH_CHECK_MINS).path

        for (let idx in currentPath) {
            let currPathCoord = currentPath[idx]
            let newPathCoord = path[idx]

            if (!util.isCoordNearby(currPathCoord, newPathCoord)) {
                return false
            }
        }

        return true
    })

    satsOnSamePath.forEach(sat => {
        if ('satrec' in sat) {
            delete sat.satrec
        }
    })

    // console.log('nearby sats following the same path', satsOnSamePath.map(sat => sat.noradId))

    return satsOnSamePath
}
