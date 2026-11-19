import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDice, rollDice, rollD20, makeBackup, parseBackup, backupName, signed } from '../src/dice.js'
import { bundle, bundle3d } from '../scripts/build.mjs'

const seq = (...v) => { let i = 0; return () => v[i++ % v.length] } // rng values in [0,1)

test('parseDice reads the sheet formulas', () => {
  assert.deepEqual(parseDice('1d8+3'), { dice: [{ n: 1, sides: 8 }], bonus: 3 })
  assert.deepEqual(parseDice('1d10+3+6'), { dice: [{ n: 1, sides: 10 }], bonus: 9 })
  assert.deepEqual(parseDice('d20-1'), { dice: [{ n: 1, sides: 20 }], bonus: -1 })
  assert.deepEqual(parseDice('2d6 + 1d4'), { dice: [{ n: 2, sides: 6 }, { n: 1, sides: 4 }], bonus: 0 })
  for (const bad of ['', 'abc', '1d', 'd1', '1d8++3', '999d6']) assert.equal(parseDice(bad), null, bad)
})

test('rollDice: total, faces, and a crit doubles the dice but not the bonus', () => {
  const r = rollDice('1d8+5', { rng: seq(0.5) }) // 0.5*8 → 5
  assert.deepEqual([r.total, r.rolls[0].faces], [10, [5]])
  const c = rollDice('1d8+5', { rng: seq(0.5, 0.99), crit: true })
  assert.deepEqual([c.total, c.rolls[0].faces], [5 + 8 + 5, [5, 8]])
})

test('rollD20: advantage keeps the high die, disadvantage the low one; nat 20 / nat 1', () => {
  const adv = rollD20(5, 'adv', seq(0.1, 0.96)) // 3 and 20
  assert.deepEqual([adv.faces, adv.kept, adv.total, adv.nat20], [[3, 20], 20, 25, true])
  const dis = rollD20(5, 'dis', seq(0.1, 0.96))
  assert.deepEqual([dis.kept, dis.total, dis.nat1], [3, 8, false])
  assert.equal(rollD20(0, 'normal', seq(0)).nat1, true)
  assert.equal(signed(3), '+3'); assert.equal(signed(-1), '-1')
})

test('backups: round trip, bad files are refused with a readable message', () => {
  const data = { level: 6, scores: { STR: 12, DEX: 16, CON: 13, INT: 8, WIS: 17, CHA: 10 }, hp: { current: 41, max: 41 }, feats: [] }
  const text = makeBackup([{ name: 'Main', level: 6, updatedAt: 1, data }, { name: 'broken', data: { level: 99 } }])
  assert.deepEqual(parseBackup(text), [{ name: 'Main', data }])
  assert.throws(() => parseBackup('not json'), /isn't a Katsebushi backup/)
  assert.throws(() => parseBackup('{"kind":"other"}'), /isn't a Katsebushi backup/)
  assert.throws(() => parseBackup(makeBackup([{ name: 'x', data: { level: 0 } }])), /No characters/)
  assert.match(backupName(Date.parse('2026-11-19T10:00:00Z')), /^katsebushi-2026-11-19\.json$/)
})

test('the committed app.js is the build of src/ (run npm run build)', async () => {
  assert.equal(readFileSync('app.js', 'utf8'), await bundle())
  assert.equal(readFileSync('dice3d.js', 'utf8'), await bundle3d())
})

test('the service worker caches every file the page needs, and its version follows the build', () => {
  const sw = readFileSync('sw.js', 'utf8')
  for (const f of ['index.html', 'app.js', 'dice3d.js', 'manifest.webmanifest', 'icons/apple-touch-icon.png']) assert.ok(sw.includes(`'${f}'`), f)
  assert.match(sw, /const VERSION = 'k-[0-9a-f]{10}'/)
  assert.ok(!readFileSync('index.html', 'utf8').includes('babel'), 'no in-browser Babel')
})

test('dice thrown on screen: the expression says which dice to throw, and their faces are used as rolled', async () => {
  const { diceNeeded, d20Needed, rollPool, poolSides, poolLabel } = await import('../src/dice.js')
  assert.deepEqual(diceNeeded('1d8+3'), [8])
  assert.deepEqual(diceNeeded('2d6+1d4', { crit: true }), [6, 6, 6, 6, 4, 4])
  assert.deepEqual(d20Needed('adv'), [20, 20])
  assert.equal(rollDice('1d8+3', { faces: [7] }).total, 10)
  assert.deepEqual(rollD20(6, 'adv', Math.random, [4, 17]).total, 23)
  assert.deepEqual(poolSides({ 6: 2, 20: 1 }), [20, 6, 6])
  const r = rollPool({ 6: 2, 20: 1 }, 2, { faces: [14, 3, 5] })
  assert.deepEqual([r.total, r.text], [24, 'd20[14] d6[3, 5] +2'])
  assert.equal(poolLabel({ 20: 1, 6: 2 }, -1), 'd20 + 2d6 − 1')
})

test('dice shapes: each die has its number of flat faces; a d6 adds up to 7 across', async () => {
  const { makeDie, faceNormal, readTop } = await import('../src/polyhedra.js')
  for (const s of [4, 6, 8, 10, 12, 20]) {
    const d = makeDie(s)
    assert.equal(d.faces.length, s, `d${s}`)
    assert.deepEqual([...d.values].sort((a, b) => a - b), s === 10 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : Array.from({ length: s }, (_, i) => i + 1))
  }
  const d6 = makeDie(6)
  d6.faces.forEach((f, i) => {
    const n = faceNormal(d6.verts, f)
    const j = d6.faces.findIndex((g) => { const m = faceNormal(d6.verts, g); return n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < -0.99 })
    assert.equal(d6.values[i] + d6.values[j], 7)
  })
  // resting unrotated, each die reads a face whose normal points straight up (or a d4 vertex)
  const id = (v) => v
  const d20 = makeDie(20)
  const top = readTop(d20, id)
  assert.ok(top.value >= 1 && top.value <= 20)
})
