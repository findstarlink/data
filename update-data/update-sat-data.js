const predict = require('sat-timings')
const celestrak = require('./celestrak')
const util = require('./util')

let satCoordCache = {}
const SATS_WITH_MISSING_ORBITAL_DATA = []

module.exports = { updateSatData }

async function updateSatData(satData) {
    SATS_WITH_MISSING_ORBITAL_DATA.length = 0

    const newSatData = await updateSatelliteOrbitData(satData)

    await updateLaunchesWithReplacementNoradIds(newSatData)

    if (SATS_WITH_MISSING_ORBITAL_DATA.length > 0) {
        throw new Error('[ERROR] Could not find orbital data for ' + SATS_WITH_MISSING_ORBITAL_DATA.length + ' satellites in supplemental list: ' + SATS_WITH_MISSING_ORBITAL_DATA.join(', '))
    }

    return newSatData
}

async function updateSatelliteOrbitData(satData) {
    let activeSats = satData.satellites.filter(sat => sat.active)

    for (var i = 0; i < activeSats.length; i++) {
        let sat = activeSats[i]
        let dataUrl = sat.dataUrl || sat.tleUrl
        let orbitalData = await celestrak.getOrbitalData(sat.noradId, dataUrl)

        if (orbitalData === undefined) {
            SATS_WITH_MISSING_ORBITAL_DATA.push(sat.noradId)
            console.log('Could not find orbital data for ' + sat.name + ' (' + sat.noradId + ') in URL: ' + dataUrl)
            continue
        }

        util.checkElementSetAge(sat.name, orbitalData.omm)
        util.checkElementSetValidity(sat.name, orbitalData.omm)
        setSatelliteOrbitData(sat, orbitalData, true)

        if (sat.batch) {
            for (let idx in sat.batch) {
                let batchSat = sat.batch[idx]
                let batchOrbitalData = await celestrak.getOrbitalData(batchSat.noradId, sat.dataUrl)
                if (batchOrbitalData !== undefined) {
                    setSatelliteOrbitData(batchSat, batchOrbitalData, false)
                }
            }
        }
    }

    return satData
}

// replace newly launched sat ids with a supplemental noradId, if available
async function updateLaunchesWithReplacementNoradIds(newSatData) {
    let supplementalList = await celestrak.getAllOrbitalData(celestrak.STARLINK_SUPPLEMENTAL_URL)

    let satsToReplace = newSatData.satellites.filter(sat => {
        if (!sat.active) {
            return false
        }

        if (sat.dataUrl.includes("starlink-g")) {  // it's a new launch
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

    replacementSats = Object.values(replacementSats)

    let replacementNoradId = replacementSats[0].noradId
    let replacementOmm = replacementSats[0].omm

    try {
        util.checkElementSetValidity(sat.noradId, replacementOmm)

        let satLabel = `${sat.name ? sat.name : ''} (${sat.noradId})`
        let logMsg = `Replaced NORAD ID ${satLabel} with ${replacementNoradId}`
        console.log(logMsg)

        let oldSatId = sat.noradId
        sat.noradId = replacementNoradId
        sat.omm = replacementOmm
        delete sat.satrec
        delete sat.tle
        delete sat.tleUrl

        // remove from missing list, if present
        let idx = SATS_WITH_MISSING_ORBITAL_DATA.indexOf(oldSatId)
        if (idx !== -1) {
            SATS_WITH_MISSING_ORBITAL_DATA.splice(idx, 1)
        }

        if (createBatch) {
            sat.dataUrl = celestrak.STARLINK_SUPPLEMENTAL_URL
            sat.batch = replacementSats.map(batchSat => ({
                noradId: batchSat.noradId,
                omm: batchSat.omm
            }))
        }
    } catch (e) {
        console.error('cannot replace', sat.name, 'with invalid orbital data', replacementOmm, e)
    }
}

async function getReplacementSats(satToReplace) {
    // if (satToReplace.name) {
    //     console.log('checking', satToReplace.name, satToReplace.noradId)
    // } else {
    //     console.log(' > checking batch', satToReplace.noradId)
    // }

    satToReplace = {  // keep a local copy
        omm: satToReplace.omm
    }

    const PATH_CHECK_MINS = 3

    let orbitalDataList = await celestrak.getAllOrbitalData(celestrak.STARLINK_SUPPLEMENTAL_URL)

    // console.log("fetched orbital data list")

    let currentCoord = predict.getCurrentSatelliteCoords(satToReplace)
    // console.log('curr coord', currentCoord)

    // prepare all the sats
    let allSats = []
    for (let noradId in orbitalDataList) {
        allSats.push(orbitalDataList[noradId])
    }

    // find nearby sats
    let nearbySats = allSats.filter(sat => {
        try {
            if (satCoordCache[sat.noradId] === undefined) {
                satCoordCache[sat.noradId] = predict.getCurrentSatelliteCoords(sat)
            }
        } catch (e) {
            console.error('could not compute current coords for sat', sat.noradId, sat.omm, e)
            return false
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

function setSatelliteOrbitData(sat, orbitalData, includeDataUrl) {
    sat.omm = orbitalData.omm

    if (includeDataUrl) {
        sat.dataUrl = orbitalData.dataUrl
    }

    delete sat.tle
    delete sat.tleUrl
    delete sat.satrec
}
