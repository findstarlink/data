const predict = require('sat-timings')

const ELEMENT_SET_UPDATE_ALARM_AGE = 72 * 60 * 60 // 72 hours (in sec)

module.exports = {
    checkElementSetAge,
    checkElementSetValidity,
    getEpochFromOMM,
    getCoordDistanceSquared,
    isCoordNearby
}

function checkElementSetAge(satId, omm) {
    var epochNow = new Date().getTime() / 1000 // seconds
    var elementEpoch = getEpochFromOMM(omm) // seconds

    if (epochNow > elementEpoch + ELEMENT_SET_UPDATE_ALARM_AGE) {
        console.log('element set age', epochNow, elementEpoch, (epochNow - elementEpoch), ELEMENT_SET_UPDATE_ALARM_AGE)
        throw "Element set for " + satId + " is out of date!"
    }
}

function checkElementSetValidity(satName, omm) {
    let sat = {
        "name": "starlink",
        "title": "Starlink",
        "omm": omm,
        "stdMag": 5
    }

    try {
        predict.getVisibleTimes(sat, 20.7984, -156.3319, { daysCount: 5, startDaysOffset: -1 })
    } catch (e) {
        console.log('Error using new element set for ' + satName, e)
        throw e
    }
}

function getEpochFromOMM(omm) {
    var epochMs = new Date(omm.EPOCH).getTime()

    if (Number.isNaN(epochMs)) {
        throw new Error(`Invalid OMM epoch: ${omm.EPOCH}`)
    }

    return Math.floor(epochMs / 1000)
}

function getCoordDistanceSquared(coordA, coordB) {
    let x = coordA[0] - coordB[0]
    let y = coordA[1] - coordB[1]
    return x * x + y * y
}

function isCoordNearby(coordA, coordB, latitudeRange = 5, longitudeRange = 5, altitudeRange = 20) {
    let latDiff = Math.abs(coordA[0] - coordB[0])
    let longDiff = Math.abs(coordA[1] - coordB[1])
    let altDiff = Math.abs(coordA[2] - coordB[2])

    return (latDiff < latitudeRange && longDiff < longitudeRange && (coordA.length === 2 || altDiff < altitudeRange))
}
