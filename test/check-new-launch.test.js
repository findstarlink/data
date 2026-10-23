const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { checkForLaunch, extractLaunchGroup } = require('../check-new-launch')

const ONE_HOUR = 60 * 60 * 1000
const CELESTRAK_PREFIX = 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink-g'

// existing entry as currently present in sat-data.json (Starlink-420 / G15-25)
const EXISTING_SAT = {
    name: 'starlink420',
    title: 'Starlink-420 (G15-25) (new)',
    omm: { OBJECT_NAME: 'STARLINK-38472', OBJECT_ID: '2026-232AC', NORAD_CAT_ID: 101030, EPOCH: '2026-10-16T08:11:41.999971' },
    stdMag: 5,
    noradId: '101030',
    intDes: '2026-232B',
    dataUrl: 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json',
    launchDate: '2026-10-13T00:28:11.000Z',
    active: true
}

function makeOmm(objectName, objectId, noradId) {
    return {
        OBJECT_NAME: objectName,
        OBJECT_ID: objectId,
        EPOCH: '2026-10-16T08:11:41.999971',
        MEAN_MOTION: 15.99673772,
        ECCENTRICITY: 0.0003847,
        INCLINATION: 70.0023,
        RA_OF_ASC_NODE: 94.3807,
        ARG_OF_PERICENTER: 265.4291,
        MEAN_ANOMALY: 325.2563,
        EPHEMERIS_TYPE: 0,
        CLASSIFICATION_TYPE: 'C',
        NORAD_CAT_ID: noradId,
        ELEMENT_SET_NO: 289,
        REV_AT_EPOCH: 1,
        BSTAR: -0.0044767,
        MEAN_MOTION_DOT: -0.02122,
        MEAN_MOTION_DDOT: 0,
        RMS: '0.376',
        DATA_SOURCE: 'SpaceX-E'
    }
}

// per-launch CelesTrak files have the STACK first, then the SINGLE object (ommList[1] is used)
function makeLaunchOmmList(group, launchDes, stackNoradId, singleNoradId) {
    return [
        makeOmm(`STARLINK-G${group} STACK`, `${launchDes}A`, stackNoradId),
        makeOmm(`STARLINK-G${group} SINGLE`, `${launchDes}B`, singleNoradId)
    ]
}

function makeLaunch(name, launchDes, hoursAgo) {
    return {
        name,
        launch_designator: launchDes,
        net: new Date(Date.now() - hoursAgo * ONE_HOUR).toISOString()
    }
}

function clone(obj) {
    return JSON.parse(JSON.stringify(obj))
}

// --- test scaffolding ---

const tmpDirs = []
const originalFetch = globalThis.fetch
const originalConsoleLog = console.log

let logLines
let fetchedUrls

function writeSatData(satellites) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-new-launch-test-'))
    tmpDirs.push(tmpDir)
    const dataFile = path.join(tmpDir, 'sat-data.json')
    fs.writeFileSync(dataFile, JSON.stringify({ satellites }, null, 4))
    return dataFile
}

function readSatData(dataFile) {
    return JSON.parse(fs.readFileSync(dataFile, 'utf8'))
}

// mocks the two network calls checkForLaunch makes:
//  - the launch library API (returns { results: launches })
//  - the per-launch CelesTrak files (launchFiles maps group -> ommList; 'plaintext' simulates
//    CelesTrak's HTTP 200 + plain-text error body for unknown files)
function mockFetch({ launches, launchFiles = {} }) {
    globalThis.fetch = async (url) => {
        fetchedUrls.push(url)
        if (url.includes('ll.thespacedevs.com')) {
            return { ok: true, status: 200, json: async () => ({ results: launches }) }
        }
        if (url.includes('FILE=starlink-g')) {
            const group = url.match(/FILE=starlink-g([^&]+)/)[1]
            const file = launchFiles[group]
            if (file === undefined) {
                return { ok: false, status: 404, json: async () => { throw new Error('404 body') } }
            }
            if (file === 'plaintext') {
                // real CelesTrak behavior: HTTP 200 with a plain-text error body, which fails JSON parsing
                return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token I, "Invalid query..." is not valid JSON') } }
            }
            return { ok: true, status: 200, json: async () => clone(file) }
        }
        throw new Error('unexpected fetch url: ' + url)
    }
}

test.beforeEach(() => {
    logLines = []
    fetchedUrls = []
})

test.before(() => {
    // keep test output clean and capture log lines ("Added new launch" is what the CI workflow greps for)
    console.log = (...args) => { logLines.push(args.join(' ')) }
    console.error = (...args) => { logLines.push('[error] ' + args.join(' ')) }
    // the module installs fatal process handlers; remove them so a test failure is reported
    // by the test runner instead of killing the process
    process.removeAllListeners('unhandledRejection')
    process.removeAllListeners('uncaughtException')
})

test.after(() => {
    globalThis.fetch = originalFetch
    console.log = originalConsoleLog
    for (const tmpDir of tmpDirs) {
        fs.rmSync(tmpDir, { recursive: true, force: true })
    }
})

test.afterEach(() => {
    globalThis.fetch = originalFetch
})

// --- group parsing ---

test('extractLaunchGroup parses standard Falcon 9 launch names', () => {
    assert.strictEqual(extractLaunchGroup('Falcon 9 Block 5 | Starlink Group 10-13'), '10-13')
})

test('extractLaunchGroup parses Starship names with a parenthetical suffix (the Sept 28 crash case)', () => {
    // old code took the last space-separated token ("14)") -> invalid CelesTrak URL -> crash
    assert.strictEqual(extractLaunchGroup('Starship | Starlink Group 31-1 (Starship Flight 14)'), '31-1')
})

test('extractLaunchGroup returns null for launch names without a Starlink group', () => {
    assert.strictEqual(extractLaunchGroup('Starship | Flight 14'), null)
    assert.strictEqual(extractLaunchGroup('Falcon 9 Block 5 | USSF-481'), null)
})

// --- registration ---

test('registers a Starship launch whose name ends with a parenthetical (regression for the Sept 28 miss)', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)])
    mockFetch({
        launches: [makeLaunch('Starship | Starlink Group 31-1 (Starship Flight 14)', '2026-225', 1)],
        launchFiles: { '31-1': makeLaunchOmmList('31-1', '2026-225', 71233, 71234) }
    })

    await checkForLaunch(dataFile)

    const satData = readSatData(dataFile)
    assert.strictEqual(satData.satellites.length, 2)

    const newSat = satData.satellites[0]
    assert.strictEqual(newSat.name, 'starlink421')
    assert.strictEqual(newSat.title, 'Starlink-421 (G31-1)')
    assert.strictEqual(newSat.stdMag, 5)
    assert.strictEqual(newSat.noradId, '71234') // the SINGLE object (ommList[1])
    assert.strictEqual(newSat.intDes, '2026-225') // from the launch designator
    assert.strictEqual(newSat.dataUrl, CELESTRAK_PREFIX + '31-1&FORMAT=json')
    assert.strictEqual(newSat.active, true)
    // launchDate should be ~1h ago (the launch's net time)
    const launchDateDiff = Math.abs(new Date(newSat.launchDate) - (Date.now() - ONE_HOUR))
    assert.ok(launchDateDiff < 5000, `launchDate should be ~1h ago, diff was ${launchDateDiff}ms`)
    assert.deepStrictEqual(newSat.omm, makeOmm('STARLINK-G31-1 SINGLE', '2026-225B', 71234))

    // the CI workflow greps stdout for this exact line
    assert.ok(logLines.some(line => line.startsWith('Added new launch')), 'expected an "Added new launch" log line')
})

test('registers multiple launches within the 5-hour window, oldest-first ids, newest at the top', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)])
    mockFetch({
        launches: [
            makeLaunch('Falcon 9 Block 5 | Starlink Group 15-26', '2026-236', 3),
            makeLaunch('Falcon 9 Block 5 | Starlink Group 15-27', '2026-237', 4.5)
        ],
        launchFiles: {
            '15-26': makeLaunchOmmList('15-26', '2026-236', 71333, 71334),
            '15-27': makeLaunchOmmList('15-27', '2026-237', 71443, 71444)
        }
    })

    await checkForLaunch(dataFile)

    const satData = readSatData(dataFile)
    assert.strictEqual(satData.satellites.length, 3)
    // ids increase chronologically: the older launch gets 421, the newer 422, which ends up on top
    assert.strictEqual(satData.satellites[0].title, 'Starlink-422 (G15-26)')
    assert.strictEqual(satData.satellites[1].title, 'Starlink-421 (G15-27)')
    assert.strictEqual(satData.satellites[2].title, EXISTING_SAT.title)
    assert.strictEqual(satData.satellites[0].noradId, '71334')
    assert.strictEqual(satData.satellites[1].noradId, '71444')

    assert.strictEqual(logLines.filter(line => line.startsWith('Added new launch')).length, 2)
})

test('skips an already-recorded launch but still registers the other launch in the window', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)]) // EXISTING_SAT is (G15-25)
    mockFetch({
        launches: [
            makeLaunch('Falcon 9 Block 5 | Starlink Group 15-25', '2026-232', 1), // already recorded
            makeLaunch('Falcon 9 Block 5 | Starlink Group 15-26', '2026-236', 2)  // new
        ],
        launchFiles: { '15-26': makeLaunchOmmList('15-26', '2026-236', 71333, 71334) }
    })

    await checkForLaunch(dataFile)

    const satData = readSatData(dataFile)
    assert.strictEqual(satData.satellites.length, 2) // existing + only the new launch
    assert.strictEqual(satData.satellites[0].title, 'Starlink-421 (G15-26)')
    assert.strictEqual(satData.satellites[1].title, EXISTING_SAT.title)
    assert.ok(logLines.some(line => line.includes('has already been recorded in sat-data.json')))
    assert.strictEqual(logLines.filter(line => line.startsWith('Added new launch')).length, 1)
})

test('a second run does not duplicate the entry (idempotency)', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)])
    mockFetch({
        launches: [makeLaunch('Falcon 9 Block 5 | Starlink Group 15-26', '2026-236', 1)],
        launchFiles: { '15-26': makeLaunchOmmList('15-26', '2026-236', 71333, 71334) }
    })

    await checkForLaunch(dataFile)
    const afterFirstRun = readSatData(dataFile)
    assert.strictEqual(afterFirstRun.satellites.length, 2)

    await checkForLaunch(dataFile)
    const afterSecondRun = readSatData(dataFile)
    assert.strictEqual(afterSecondRun.satellites.length, 2)
    assert.deepStrictEqual(afterSecondRun, afterFirstRun)
    assert.ok(logLines.filter(line => line.includes('has already been recorded in sat-data.json')).length >= 1)
})

test('keeps the existing entry untouched when registering a new launch', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)])
    mockFetch({
        launches: [makeLaunch('Falcon 9 Block 5 | Starlink Group 15-26', '2026-236', 1)],
        launchFiles: { '15-26': makeLaunchOmmList('15-26', '2026-236', 71333, 71334) }
    })

    await checkForLaunch(dataFile)

    const satData = readSatData(dataFile)
    assert.deepStrictEqual(satData.satellites[1], EXISTING_SAT)
})

// --- graceful skips (the per-launch CelesTrak file only exists for a few days) ---

test('skips gracefully when the per-launch CelesTrak file is missing (404)', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)])
    mockFetch({
        launches: [makeLaunch('Falcon 9 Block 5 | Starlink Group 15-26', '2026-236', 1)],
        launchFiles: {} // no per-launch file
    })

    await checkForLaunch(dataFile) // must not throw

    const satData = readSatData(dataFile)
    assert.strictEqual(satData.satellites.length, 1) // nothing registered
    assert.ok(logLines.some(line => line.includes('Unable to fetch launch orbital data (404)')))
    assert.ok(logLines.every(line => !line.startsWith('Added new launch')))
})

test('skips gracefully when CelesTrak returns HTTP 200 with a plain-text error body', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)])
    mockFetch({
        launches: [makeLaunch('Falcon 9 Block 5 | Starlink Group 15-26', '2026-236', 1)],
        launchFiles: { '15-26': 'plaintext' }
    })

    await checkForLaunch(dataFile) // must not throw

    const satData = readSatData(dataFile)
    assert.strictEqual(satData.satellites.length, 1) // nothing registered
    assert.ok(logLines.some(line => line.includes('Could not fetch launch orbital data')))
})

test('skips gracefully when CelesTrak returns fewer than 2 OMM entries', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)])
    mockFetch({
        launches: [makeLaunch('Falcon 9 Block 5 | Starlink Group 15-26', '2026-236', 1)],
        launchFiles: { '15-26': [makeOmm('STARLINK-G15-26 STACK', '2026-236A', 71333)] }
    })

    await checkForLaunch(dataFile) // must not throw

    const satData = readSatData(dataFile)
    assert.strictEqual(satData.satellites.length, 1) // nothing registered
    assert.ok(logLines.some(line => line.includes('No launch orbital data (or too few entries)')))
})

// --- window / API behavior ---

test('does nothing when all launches are older than the 5-hour window', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)])
    mockFetch({
        launches: [makeLaunch('Falcon 9 Block 5 | Starlink Group 15-26', '2026-236', 6)],
        launchFiles: { '15-26': makeLaunchOmmList('15-26', '2026-236', 71333, 71334) }
    })

    const before = fs.readFileSync(dataFile, 'utf8')
    await checkForLaunch(dataFile)
    const after = fs.readFileSync(dataFile, 'utf8')

    assert.strictEqual(after, before) // nothing registered, file untouched
    assert.ok(logLines.some(line => line.includes('which is 6.00 hours ago')))
    assert.strictEqual(fetchedUrls.filter(url => url.includes('celestrak.org')).length, 0) // no orbital data fetch attempted
    assert.ok(logLines.every(line => !line.startsWith('Added new launch')))
})

test('logs and returns when the launch API returns no results', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)])
    mockFetch({ launches: [] })

    const before = fs.readFileSync(dataFile, 'utf8')
    await checkForLaunch(dataFile)
    const after = fs.readFileSync(dataFile, 'utf8')

    assert.strictEqual(after, before) // file untouched
    assert.ok(logLines.some(line => line.includes('No previous launches returned from launch API')))
})

test('writes sat-data.json with 4-space indentation (existing file format)', async () => {
    const dataFile = writeSatData([clone(EXISTING_SAT)])
    mockFetch({
        launches: [makeLaunch('Falcon 9 Block 5 | Starlink Group 15-26', '2026-236', 1)],
        launchFiles: { '15-26': makeLaunchOmmList('15-26', '2026-236', 71333, 71334) }
    })

    await checkForLaunch(dataFile)

    const raw = fs.readFileSync(dataFile, 'utf8')
    assert.ok(raw.includes('\n            "name"'), 'expected 4-space indented JSON')
})
