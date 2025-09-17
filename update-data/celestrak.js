const fs = require('fs')

const LOCAL_STARLINK_SUPPLEMENTAL_FILE = '../starlink_celestrak_supplemental.json'
const STARLINK_SUPPLEMENTAL_URL = 'http://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle';

const cache = {}

module.exports = {
    downloadSupplementalList,
    getTLE,
    getAllTLEs,
    STARLINK_SUPPLEMENTAL_URL
}

async function downloadSupplementalList() {
    let res = await fetch(STARLINK_SUPPLEMENTAL_URL)
    res = await res.text()
    const json = convertTextToJSON(res)
    fs.writeFileSync(LOCAL_STARLINK_SUPPLEMENTAL_FILE, JSON.stringify(json, null, 2))
}

async function getTLE(satId, tleURL) {
    let tleList = await getAllTLEs(tleURL)
    let sat = tleList[satId]
    return (sat ? sat.tle : undefined)
}

async function getAllTLEs(tleURL) {
    if (cache[tleURL]) {
        return cache[tleURL]
    }

    let tleData = null
    if (tleURL === STARLINK_SUPPLEMENTAL_URL) {
        // Read and parse the JSON file directly
        tleData = JSON.parse(fs.readFileSync(LOCAL_STARLINK_SUPPLEMENTAL_FILE, 'utf8'))
    } else {
        let res = await fetch(tleURL)
        res = await res.text()
        tleData = convertTextToJSON(res)
    }

    cache[tleURL] = tleData
    return cache[tleURL]
}

function convertTextToJSON(tleText) {
    let lines = tleText.split('\r\n')

    let entry = {}
    let line1 = ''

    lines.forEach(line => {
        if (line === undefined || line.trim() === '') {
            return
        }

        let lineNum = line.substring(0, 2).trim()
        if (lineNum === '1') {
            line1 = line
        } else if (lineNum === '2') {
            let line2 = line
            let p = line2.split(' ')

            if (p.length < 2) {
                return
            }

            let satId = p[1].trim();
            if (satId === '') {
                return
            }

            entry[satId] = {
                noradId: satId,
                tle: [line1, line2]
            }
        }
    })

    return entry
}
