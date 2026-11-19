// Dice and backups: pure functions (no DOM), tested in tests/.

/** "1d8+3+2", "2d6", "d20-1", "1d10+3+6" → { dice: [{n, sides}], bonus } or null. */
export function parseDice(expr) {
  const s = String(expr || '').replace(/\s+/g, '').toLowerCase()
  if (!s || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) return null
  const dice = []
  let bonus = 0
  for (const m of s.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const sign = m[1] === '-' ? -1 : 1
    if (m[2].includes('d')) {
      const [n, sides] = m[2].split('d').map((x) => (x === '' ? 1 : Number(x)))
      if (n < 1 || n > 100 || sides < 2 || sides > 1000) return null
      dice.push({ n: n * sign, sides })
    } else bonus += sign * Number(m[2])
  }
  return { dice, bonus }
}

const die = (sides, rng) => Math.floor(rng() * sides) + 1

/**
 * Where the faces come from: `faces` (numbers already rolled, e.g. by the dice thrown on screen, used in
 * order) or else the random generator.
 */
const source = (rng, faces) => {
  const q = faces ? [...faces] : null
  return (sides) => (q && q.length ? q.shift() : die(sides, rng))
}

/** The dice an expression needs, in the order they are read (so a throw on screen can roll them). */
export function diceNeeded(expr, { crit = false } = {}) {
  const p = parseDice(expr)
  if (!p) return []
  return p.dice.flatMap(({ n, sides }) => Array(Math.abs(n) * (crit ? 2 : 1)).fill(sides))
}
export const d20Needed = (mode = 'normal') => (mode === 'normal' ? [20] : [20, 20])

/**
 * Rolls an expression. `crit` doubles the dice (not the bonus), as on a critical hit.
 * Returns { total, rolls: [[...faces] per dice group], bonus, expr }.
 */
export function rollDice(expr, { rng = Math.random, crit = false, faces: given = null } = {}) {
  const p = parseDice(expr)
  if (!p) return null
  const next = source(rng, given)
  const rolls = p.dice.map(({ n, sides }) => {
    const count = Math.abs(n) * (crit ? 2 : 1)
    const faces = Array.from({ length: count }, () => next(sides))
    return { sides, sign: Math.sign(n), faces }
  })
  const total = rolls.reduce((t, r) => t + r.sign * r.faces.reduce((a, b) => a + b, 0), 0) + p.bonus
  return { total, rolls, bonus: p.bonus, expr }
}

/**
 * A d20 test (attack, save, check): mode 'normal' | 'adv' | 'dis'. Returns the kept face, both faces,
 * the total, and whether it is a natural 20 / natural 1.
 */
export function rollD20(bonus = 0, mode = 'normal', rng = Math.random, given = null) {
  const next = source(rng, given)
  const a = next(20)
  const b = mode === 'normal' ? null : next(20)
  const kept = b === null ? a : mode === 'adv' ? Math.max(a, b) : Math.min(a, b)
  return { faces: b === null ? [a] : [a, b], kept, bonus, total: kept + bonus, nat20: kept === 20, nat1: kept === 1, mode }
}

/** A handful of dice from the tray: { 20: 1, 6: 2 } + modifier → { total, groups, text }. */
export function rollPool(pool, modifier = 0, { rng = Math.random, faces = null } = {}) {
  const next = source(rng, faces)
  const groups = poolSides(pool).reduce((acc, sides) => {
    const g = acc.find((x) => x.sides === sides) || (acc.push({ sides, faces: [] }), acc.at(-1))
    g.faces.push(next(sides))
    return acc
  }, [])
  const total = groups.reduce((t, g) => t + g.faces.reduce((a, b) => a + b, 0), 0) + modifier
  const text = `${groups.map((g) => `d${g.sides}[${g.faces.join(', ')}]`).join(' ')}${modifier ? ` ${signed(modifier)}` : ''}`
  return { total, groups, text }
}
/** The dice of a pool, biggest first: { 6: 2, 20: 1 } → [20, 6, 6]. */
export const poolSides = (pool) => Object.entries(pool).map(([s, n]) => [Number(s), n]).sort((a, b) => b[0] - a[0]).flatMap(([s, n]) => Array(n).fill(s))
/** "2d6 + d20 + 3" */
export const poolLabel = (pool, modifier = 0) => {
  const parts = Object.entries(pool).filter(([, n]) => n > 0).map(([s, n]) => [Number(s), n]).sort((a, b) => b[0] - a[0]).map(([s, n]) => `${n > 1 ? n : ''}d${s}`)
  return parts.length ? `${parts.join(' + ')}${modifier ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : ''}` : ''
}

export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`)

// ---------- Backups (a file with every save state) ----------

export const BACKUP_KIND = 'katsebushi-backup'

/** saves: [{ name, level, updatedAt, data }] → the file's text. */
export function makeBackup(saves, now = Date.now()) {
  return JSON.stringify({ kind: BACKUP_KIND, v: 1, exportedAt: new Date(now).toISOString(), saves }, null, 1)
}

const isCharacter = (c) =>
  c && typeof c === 'object' && Number.isInteger(c.level) && c.level >= 1 && c.level <= 20 &&
  c.scores && ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].every((k) => Number.isFinite(c.scores[k])) &&
  c.hp && Number.isFinite(c.hp.current) && Number.isFinite(c.hp.max)

/** A backup file's text → [{ name, data }] (only valid characters), or throws a readable error. */
export function parseBackup(text) {
  let j
  try {
    j = JSON.parse(text)
  } catch {
    throw new Error("This file isn't a Katsebushi backup.")
  }
  if (j?.kind !== BACKUP_KIND || !Array.isArray(j.saves)) throw new Error("This file isn't a Katsebushi backup.")
  const saves = j.saves
    .filter((s) => isCharacter(s?.data))
    .map((s) => ({ name: String(s.name || 'Imported').slice(0, 60), data: s.data }))
  if (!saves.length) throw new Error('No characters found in this backup.')
  return saves
}

/** The file name: katsebushi-2026-11-19.json */
export const backupName = (now = Date.now()) => `katsebushi-${new Date(now).toISOString().slice(0, 10)}.json`
