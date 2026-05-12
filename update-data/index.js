const fs = require('fs')

const { updateSatData } = require('./update-sat-data')
const { updateStrings } = require('./update-strings')
const { downloadSupplementalList } = require('./celestrak')

const LOCAL_SAT_DATA_JSON_FILE = '../sat-data.json'
const LOCAL_STRINGS_FILE = '../strings_en-US.json'

async function main() {
    await downloadSupplementalList()

    const oldSatData = JSON.parse(fs.readFileSync(LOCAL_SAT_DATA_JSON_FILE, 'utf8'))
    const oldStrings = JSON.parse(fs.readFileSync(LOCAL_STRINGS_FILE, 'utf8'))

    const newSatData = await updateSatData(oldSatData)
    const newStrings = await updateStrings(newSatData, oldStrings)

    // save the updated data
    fs.writeFileSync(LOCAL_SAT_DATA_JSON_FILE, JSON.stringify(newSatData, null, 4))
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
