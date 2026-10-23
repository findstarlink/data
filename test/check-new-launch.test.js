const test = require('node:test')
const assert = require('node:assert')

const { extractLaunchGroup } = require('../check-new-launch')

test('extractLaunchGroup parses standard Falcon 9 launch names', () => {
    assert.strictEqual(extractLaunchGroup('Falcon 9 Block 5 | Starlink Group 10-13'), '10-13')
})

test('extractLaunchGroup parses Starship names with a parenthetical suffix (regression for the Sept 28 crash)', () => {
    // the old code took the last space-separated token ("14)"), producing the invalid group
    // "14)" -> an invalid CelesTrak URL -> a JSON parse crash that killed the whole workflow
    assert.strictEqual(extractLaunchGroup('Starship | Starlink Group 31-1 (Starship Flight 14)'), '31-1')
})

test('extractLaunchGroup returns null for launch names without a Starlink group', () => {
    assert.strictEqual(extractLaunchGroup('Starship | Flight 14'), null)
    assert.strictEqual(extractLaunchGroup('Falcon 9 Block 5 | USSF-481'), null)
})
