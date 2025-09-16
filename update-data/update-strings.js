const STRING_LAUNCHED = "The new Starlink satellites have launched!"
const STRING_UPCOMING = "The next Starlink launch is planned in a few days"
const STRING_NOT_VISIBLE = "Hi there, based on user reports, Starlink trains are not very visible right now.<br/><br/>This is because Starlink's company has reduced their brightness (to avoid disturbing astronomers): <a href=\"http://bbc.com/news/technology-52391758\" target=\"_blank\">more details</a><br/><br/>But a few reports of successful sightings come in every day, so you can try your luck :) I'm working on predicting this better, sorry.<br/><br/>The next Starlink launch is planned in a few days, and will be very bright for 3-4 days after that. Good luck!"
const STRING_LOW_VISIBILITY = "This may not be visible, based on recent user reports"

const RECENT_LAUNCH_THRESHOLD_DAYS = 7 // days

module.exports = { updateStrings }

async function updateStrings(newSatData, strings) {
    let epochNow = new Date().getTime() / 1000  // seconds
    let activeSats = newSatData.satellites.filter(sat => sat.active)

    let isAnySatelliteRecent = false

    for (var i = 0; i < activeSats.length; i++) {
        let sat = activeSats[i]

        let epochLaunch = new Date(sat.launchDate).getTime() / 1000  // seconds
        let daysSinceLaunch = (epochNow - epochLaunch) / 3600 / 24  // days

        if (daysSinceLaunch > RECENT_LAUNCH_THRESHOLD_DAYS) {
            sat.title = sat.title.replace(" (new)", "")  // remove the (new) label, if present

            strings['note_' + sat.name] = STRING_LOW_VISIBILITY  // user advisory for low visibility chances
        } else { // recent launch
            if (sat.title.indexOf(" (new)") === -1) { // it's new, but doesn't have the (new) label
                sat.title += " (new)"
            }
            isAnySatelliteRecent = true
        }
    }

    if (isAnySatelliteRecent) {
        strings["announcementHome"] = STRING_LAUNCHED
        strings["announcementPopup"] = ""
    } else {
        strings["announcementHome"] = STRING_UPCOMING
        strings["announcementPopup"] = STRING_NOT_VISIBLE
    }

    return strings
}
