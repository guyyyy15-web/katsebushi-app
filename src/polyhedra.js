// Dice shapes as convex polyhedra: vertices + faces (outward, counter-clockwise), found from the vertices
// alone, so every die is built the same way. Pure maths, tested in tests/.

const PHI = (1 + Math.sqrt(5)) / 2

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => { const l = len(a); return [a[0] / l, a[1] / l, a[2] / l] }

/** The faces of the convex hull of `verts` (each a polygon of vertex indices, CCW seen from outside). */
export function hullFaces(verts, eps = 1e-6) {
  const n = verts.length
  const faces = []
  const seen = new Set()
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    let nrm = cross(sub(verts[j], verts[i]), sub(verts[k], verts[i]))
    if (len(nrm) < eps) continue
    nrm = norm(nrm)
    const d = dot(nrm, verts[i])
    let above = 0, below = 0
    const on = []
    for (let m = 0; m < n; m++) {
      const s = dot(nrm, verts[m]) - d
      if (s > eps) above++
      else if (s < -eps) below++
      else on.push(m)
    }
    if (above && below) continue
    if (above) nrm = nrm.map((x) => -x) // point outward (away from the rest)
    const key = on.slice().sort((a, b) => a - b).join(',')
    if (seen.has(key)) continue
    seen.add(key)
    // order the face's vertices around its centre, counter-clockwise seen from outside
    const c = on.reduce((acc, m) => [acc[0] + verts[m][0] / on.length, acc[1] + verts[m][1] / on.length, acc[2] + verts[m][2] / on.length], [0, 0, 0])
    const u = norm(sub(verts[on[0]], c))
    const w = cross(nrm, u)
    on.sort((a, b) => {
      const pa = sub(verts[a], c), pb = sub(verts[b], c)
      return Math.atan2(dot(pa, w), dot(pa, u)) - Math.atan2(dot(pb, w), dot(pb, u))
    })
    faces.push(on)
  }
  return faces
}

function scaled(verts, radius) {
  const r = Math.max(...verts.map(len))
  return verts.map((v) => v.map((x) => (x / r) * radius))
}

const RAW = {
  4: () => [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]],
  6: () => { const v = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]); return v },
  8: () => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
  10: () => {
    // pentagonal trapezohedron: two apexes and a zig-zag ring; H keeps every kite flat
    const e = 0.1, c = Math.cos(Math.PI / 5), H = (e * (1 + c)) / (1 - c)
    const v = [[0, H, 0], [0, -H, 0]]
    for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5; v.push([Math.cos(a), i % 2 ? -e : e, Math.sin(a)]) }
    return v
  },
  12: () => {
    const v = []
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z])
    for (const a of [-1, 1]) for (const b of [-1, 1]) v.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI])
    return v
  },
  20: () => {
    const v = []
    for (const a of [-1, 1]) for (const b of [-1, 1]) v.push([0, a, b * PHI], [a, b * PHI, 0], [a * PHI, 0, b])
    return v
  },
}
// Similar sizes on the table (circumradius in table units).
const RADIUS = { 4: 1.05, 6: 0.95, 8: 0.95, 10: 0.95, 12: 0.95, 20: 1.0 }

/**
 * A die: { sides, verts, faces, values }. values[i] is the number on face i (for the d4: on vertex i, the
 * number read at the top). Opposite faces of a d6 add up to 7, as on a real one.
 */
export function makeDie(sides) {
  if (!RAW[sides]) throw new Error(`no d${sides}`)
  const verts = scaled(RAW[sides](), RADIUS[sides])
  const faces = hullFaces(verts)
  let values = faces.map((_, i) => i + 1)
  if (sides === 4) values = [1, 2, 3, 4]
  if (sides === 10) values = faces.map((_, i) => i) // 0–9; a 0 counts as 10
  if (sides === 6) {
    const nrm = faces.map((f) => faceNormal(verts, f))
    const vals = new Array(6)
    const used = new Set()
    let next = 1
    for (let i = 0; i < 6; i++) {
      if (used.has(i)) continue
      const opp = nrm.findIndex((n, j) => j !== i && dot(n, nrm[i]) < -0.99)
      vals[i] = next; vals[opp] = 7 - next; used.add(i); used.add(opp); next++
    }
    values = vals
  }
  return { sides, verts, faces, values }
}

export function faceNormal(verts, f) {
  return norm(cross(sub(verts[f[1]], verts[f[0]]), sub(verts[f[2]], verts[f[0]])))
}

/** Which number is up, given a function that rotates a local vector into the world (y is up). */
export function readTop(die, rotate) {
  if (die.sides === 4) {
    let best = -Infinity, at = 0
    die.verts.forEach((v, i) => { const y = rotate(v)[1]; if (y > best) { best = y; at = i } })
    return { value: die.values[at], flat: best / len(die.verts[at]) }
  }
  let best = -Infinity, at = 0
  die.faces.forEach((f, i) => { const y = rotate(faceNormal(die.verts, f))[1]; if (y > best) { best = y; at = i } })
  return { value: die.sides === 10 && die.values[at] === 0 ? 10 : die.values[at], flat: best }
}
