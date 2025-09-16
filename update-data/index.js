const fs = require('fs')

const { updateTLE } = require('./update-tle')
const { updateStrings } = require('./update-strings')
const { downloadSupplementalList } = require('./celestrak')

const LOCAL_TLE_JSON_FILE = '../tle.json'
const LOCAL_STRINGS_FILE = '../strings_en-US.json'

async function main() {
    await downloadSupplementalList()

    const oldTLE = JSON.parse(fs.readFileSync(LOCAL_TLE_JSON_FILE, 'utf8'))
    const oldStrings = JSON.parse(fs.readFileSync(LOCAL_STRINGS_FILE, 'utf8'))

    const newTLE = await updateTLE(oldTLE)
    const newStrings = await updateStrings(newTLE, oldStrings)

    // save the updated data
    fs.writeFileSync(LOCAL_TLE_JSON_FILE, JSON.stringify(newTLE, null, 4))
    fs.writeFileSync(LOCAL_STRINGS_FILE, JSON.stringify(newStrings, null, 4))
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

main()
