const fs = require('fs')

const LOCAL_STARLINK_SUPPLEMENTAL_FILE = '../celestrak.json'
const STARLINK_SUPPLEMENTAL_URL = 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json';

const cache = {}

module.exports = {
    downloadSupplementalList,
    getOrbitalData,
    getAllOrbitalData,
    STARLINK_SUPPLEMENTAL_URL
}

async function downloadSupplementalList() {
    const res = await fetch(STARLINK_SUPPLEMENTAL_URL)
    validateResponseOk(res, STARLINK_SUPPLEMENTAL_URL)

    const json = normalizeOmmList(await res.json(), STARLINK_SUPPLEMENTAL_URL)
    cache[STARLINK_SUPPLEMENTAL_URL] = json
    fs.writeFileSync(LOCAL_STARLINK_SUPPLEMENTAL_FILE, JSON.stringify(json, null, 2))
}

async function getOrbitalData(satId, dataUrl) {
    const orbitalData = await getAllOrbitalData(dataUrl)
    return orbitalData[String(satId)]
}

async function getAllOrbitalData(dataUrl) {
    if (cache[dataUrl]) {
        return cache[dataUrl]
    }

    let orbitalData = null
    if (dataUrl === STARLINK_SUPPLEMENTAL_URL) {
        orbitalData = JSON.parse(fs.readFileSync(LOCAL_STARLINK_SUPPLEMENTAL_FILE, 'utf8'))
    } else {
        const res = await fetch(dataUrl)
        validateResponseOk(res, dataUrl)
        orbitalData = normalizeOmmList(await res.json(), dataUrl)
    }

    cache[dataUrl] = orbitalData
    return cache[dataUrl]
}

function normalizeOmmList(list, dataUrl) {
    if (!Array.isArray(list)) {
        throw new Error(`Expected OMM JSON array from ${dataUrl}`)
    }

    const entry = {}

    list.forEach(raw => {
        const normalized = normalizeOmmEntry(raw, dataUrl)
        if (normalized === undefined) {
            return
        }

        entry[normalized.noradId] = normalized
    })

    return entry
}

function normalizeOmmEntry(raw, dataUrl) {
    if (!raw || raw.NORAD_CAT_ID === undefined || raw.EPOCH === undefined) {
        return undefined
    }

    return {
        noradId: String(raw.NORAD_CAT_ID),
        omm: raw,
        dataUrl: dataUrl
    }
}

function validateResponseOk(res, dataUrl) {
    if (!res.ok) {
        throw new Error(`CelesTrak request failed (${res.status}) for ${dataUrl}`)
    }
}
