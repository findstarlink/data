const predict = require('sat-timings')

const TLE_UPDATE_ALARM_AGE = 72 * 60 * 60 // 72 hours (in sec)

module.exports = {
    checkTLEAge,
    checkTLEValidity,
    getEpochFromTLE,
    getEpochFromTLEDate,
    getEpochFromYearAndDay,
    getCoordDistanceSquared,
    isCoordNearby
}

function checkTLEAge(satId, tle) {
    var epochNow = new Date().getTime() / 1000 // seconds
    var epochTLE = getEpochFromTLE(tle) // seconds

    if (epochNow > epochTLE + TLE_UPDATE_ALARM_AGE) {
        console.log('TLE age', epochNow, epochTLE, (epochNow - epochTLE), TLE_UPDATE_ALARM_AGE)
        throw "TLE for " + satId + " is out of date!"
    }
}

function checkTLEValidity(satName, tle) {
    let sat = {
        "name": "starlink",
        "title": "Starlink",
        "tle": tle,
        "stdMag": 5
    }
    try {
        let res = predict.getVisibleTimes(sat, 20.7984, -156.3319, {daysCount: 5, startDaysOffset: -1})
    } catch (e) {
        console.log('Error using new TLE for ' + satName, e)
        throw e
    }
}

function getEpochFromTLE(tle) {
    var line1 = tle[0].replace(/\ +/g, ' ')
    var tleDate = line1.split(' ')[3]
    tleDate = tleDate.split('.')[0]

    return getEpochFromTLEDate(tleDate)
}

function getEpochFromTLEDate(tleDate) {
    var tleYear = tleDate.substring(0, 2)
    var tleDayOfYear = tleDate.substring(2)
    tleYear = parseInt(tleYear)
    tleDayOfYear = parseInt(tleDayOfYear)

    return getEpochFromYearAndDay(tleYear, tleDayOfYear) // sec
}

function getEpochFromYearAndDay(epochYear, epochDays) {
    var d = new Date(2000 + epochYear, 0)
    var days = parseInt(epochDays)
    d.setDate(days)

    return d.getTime() / 1000 // sec
}

function getCoordDistanceSquared(coordA, coordB) {
    let x = coordA[0] - coordB[0]
    let y = coordB[1] - coordB[1]
    return x * x + y * y
}

function isCoordNearby(coordA, coordB, latitudeRange=5, longitudeRange=5, altitudeRange=20) {
    let latDiff = Math.abs(coordA[0] - coordB[0])
    let longDiff = Math.abs(coordA[1] - coordB[1])
    let altDiff = Math.abs(coordA[2] - coordB[2])

    return (latDiff < latitudeRange && longDiff < longitudeRange && (coordA.length === 2 || altDiff < altitudeRange))
}
