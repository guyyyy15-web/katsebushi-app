// Real dice on the screen: three.js draws them, cannon-es throws them. Each die starts from the bottom edge
// with a random push and spin (crypto random), bounces off the screen's edges and each other, and its result
// is the face that ends up on top. Built into dice3d.js, loaded only when dice are first thrown.
import {
  WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight, Mesh, PlaneGeometry, ShadowMaterial,
  BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, CanvasTexture, SRGBColorSpace, PCFSoftShadowMap,
} from 'three'
import { World, Body, Vec3, Plane, ConvexPolyhedron, Material, ContactMaterial } from 'cannon-es'
import { makeDie, faceNormal, readTop } from './polyhedra.js'

const GOLD = '#d9b56a', INK = '#1b1418'
const COLORS = { 4: '#5b2a2f', 6: '#2f3b4f', 8: '#3f4b37', 10: '#4a3557', 12: '#57452a', 20: '#7a2f2a', 100: '#4a3557' }

const rand = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32 }
const between = (a, b) => a + rand() * (b - a)

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l) }

/** A number drawn on a square canvas (underlined 6 and 9). For the d4: three numbers, one at each corner. */
function faceTexture(label, color, corners = null) {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.fillStyle = color
  g.fillRect(0, 0, s, s)
  g.fillStyle = GOLD
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const draw = (text, x, y, size, angle) => {
    g.save(); g.translate(x, y); g.rotate(angle)
    g.font = `700 ${size}px Georgia, 'Times New Roman', serif`
    g.fillText(text, 0, 0)
    if (text === '6' || text === '9') g.fillRect(-size * 0.22, size * 0.42, size * 0.44, size * 0.07)
    g.restore()
  }
  if (corners) {
    for (const { text, x, y } of corners) {
      const px = x * s, py = (1 - y) * s
      const ang = Math.atan2(px - s / 2, -(py - s / 2)) // top of the number points to its corner
      draw(text, s / 2 + (px - s / 2) * 0.62, s / 2 + (py - s / 2) * 0.62, 62, ang)
    }
  } else draw(label, s / 2, s / 2, label.length > 2 ? 78 : label.length > 1 ? 96 : 116, 0)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** three.js geometry with one material group per face, and UVs that put each face's number in its middle. */
function dieMesh(die, label, color) {
  const pos = [], uv = [], nrm = []
  const mats = []
  let start = 0
  die.faces.forEach((f, fi) => {
    const P = f.map((i) => die.verts[i])
    const c = P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length, a[2] + p[2] / P.length], [0, 0, 0])
    const n = faceNormal(die.verts, f)
    const R = Math.max(...P.map((p) => Math.hypot(...sub(p, c))))
    // "up" on the face: toward the first vertex for triangles and kites, so numbers sit upright
    const up = norm(sub(die.sides === 10 ? P[0] : P[0], c))
    const right = cross(up, n)
    const toUV = (p) => { const d = sub(p, c); return [0.5 + dot(d, right) / (2.1 * R), 0.5 + dot(d, up) / (2.1 * R)] }
    for (let k = 1; k < P.length - 1; k++) {
      for (const p of [P[0], P[k], P[k + 1]]) { pos.push(...p); nrm.push(...n); uv.push(...toUV(p)) }
    }
    const count = (P.length - 2) * 3
    mats.push({ start, count, fi, corners: die.sides === 4 ? f.map((vi) => { const [x, y] = toUV(die.verts[vi]); return { text: String(die.values[vi]), x, y } }) : null })
    start += count
  })
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new Float32BufferAttribute(nrm, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  const materials = mats.map((m, i) => {
    geo.addGroup(m.start, m.count, i)
    const v = die.values[m.fi]
    const text = label ? label(v) : String(v)
    return new MeshStandardMaterial({ map: faceTexture(text, color, m.corners), roughness: 0.45, metalness: 0.1, flatShading: true })
  })
  const mesh = new Mesh(geo, materials)
  mesh.castShadow = true
  return mesh
}

function dieBody(die, mat) {
  const shape = new ConvexPolyhedron({ vertices: die.verts.map((v) => new Vec3(...v)), faces: die.faces })
  const body = new Body({ mass: 1, material: mat, allowSleep: true, sleepSpeedLimit: 0.25, sleepTimeLimit: 0.35, linearDamping: 0.08, angularDamping: 0.08 })
  body.addShape(shape)
  return body
}

let stage = null // reused between throws: one WebGL context for the whole visit

function makeStage() {
  const el = document.createElement('div')
  el.className = 'dice3d'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', 'Dice')
  Object.assign(el.style, { position: 'fixed', inset: '0', zIndex: '50', background: 'rgba(10,8,12,.74)', touchAction: 'none', display: 'none' })
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
  el.appendChild(renderer.domElement)
  const banner = document.createElement('div')
  Object.assign(banner.style, {
    position: 'absolute', left: '50%', bottom: 'calc(40px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', minWidth: '200px',
    maxWidth: 'calc(100% - 32px)', textAlign: 'center', padding: '10px 18px', borderRadius: '14px', background: '#17151a', border: `1px solid ${GOLD}`,
    color: '#e9e2d0', fontFamily: "'Shippori Mincho', Georgia, serif", opacity: '0', transition: 'opacity .25s', pointerEvents: 'none',
  })
  el.appendChild(banner)
  const hint = document.createElement('div')
  Object.assign(hint.style, { position: 'absolute', left: 0, right: 0, bottom: 'calc(14px + env(safe-area-inset-bottom))', textAlign: 'center', color: '#9c9284', font: '12px sans-serif', pointerEvents: 'none' })
  el.appendChild(hint)
  document.body.appendChild(el)

  const scene = new Scene()
  const camera = new PerspectiveCamera(32, 1, 0.1, 200)
  scene.add(new AmbientLight(0xffffff, 0.75))
  const sun = new DirectionalLight(0xfff1d6, 2.1)
  sun.position.set(-6, 24, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 })
  scene.add(sun)
  const floor = new Mesh(new PlaneGeometry(80, 80), new ShadowMaterial({ opacity: 0.35 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  return { el, renderer, scene, camera, banner, hint, view: { w: 6, h: 10 } }
}

/** Sizes the camera so the screen shows a table of view.w × view.h units. */
function fit(st) {
  const w = window.innerWidth, h = window.innerHeight
  st.renderer.setSize(w, h)
  st.camera.aspect = w / h
  const height = 24
  st.camera.position.set(0, height, 2.2)
  st.camera.lookAt(0, 0, 0)
  st.camera.updateProjectionMatrix()
  const vh = 2 * height * Math.tan((st.camera.fov * Math.PI) / 360)
  st.view = { w: (vh * w) / h, h: vh }
}

/**
 * Throws dice and resolves with each die's number once they all rest: specs are sides (4, 6, 8, 10, 12, 20, 100).
 * A d100 is two d10s (tens and units). The overlay stays until close() (or a tap after showResult).
 */
export function throwDice(specs, { reducedMotion = false } = {}) {
  if (!stage) stage = makeStage()
  const st = stage
  st.el.style.display = 'block'
  st.banner.style.opacity = '0'
  st.hint.textContent = 'Tap to skip'
  fit(st)
  const { w, h } = st.view

  const world = new World({ gravity: new Vec3(0, -42, 0), allowSleep: true })
  world.defaultContactMaterial.friction = 0.3
  const diceMat = new Material('dice'), wallMat = new Material('wall')
  world.addContactMaterial(new ContactMaterial(diceMat, wallMat, { friction: 0.35, restitution: 0.45 }))
  world.addContactMaterial(new ContactMaterial(diceMat, diceMat, { friction: 0.2, restitution: 0.35 }))
  // floor and the four screen edges
  const walls = [
    [new Vec3(0, 0, 0), new Vec3(-Math.PI / 2, 0, 0)],
    [new Vec3(-w / 2 + 0.3, 0, 0), new Vec3(0, Math.PI / 2, 0)],
    [new Vec3(w / 2 - 0.3, 0, 0), new Vec3(0, -Math.PI / 2, 0)],
    [new Vec3(0, 0, -h / 2 + 0.6), new Vec3(0, 0, 0)],
    [new Vec3(0, 0, h / 2 - 2.6), new Vec3(0, Math.PI, 0)],
  ]
  for (const [p, e] of walls) {
    const b = new Body({ mass: 0, material: wallMat, shape: new Plane() })
    b.position.copy(p)
    b.quaternion.setFromEuler(e.x, e.y, e.z)
    world.addBody(b)
  }

  // one physical die per d4…d20; a d100 is a tens d10 + a units d10
  const items = []
  for (const sides of specs) {
    if (sides === 100) items.push({ spec: 100, parts: [{ sides: 10, label: (v) => (v === 0 ? '00' : `${v}0`) }, { sides: 10 }] })
    else items.push({ spec: sides, parts: [{ sides }] })
  }
  const dice = []
  items.forEach((it) => it.parts.forEach((part) => {
    const die = makeDie(part.sides)
    const mesh = dieMesh(die, part.label, COLORS[it.spec] || COLORS[20])
    const body = dieBody(die, diceMat)
    const i = dice.length
    const n = items.reduce((a, x) => a + x.parts.length, 0)
    // from the bottom edge, spread across, thrown up the screen with a random push and spin
    body.position.set(((i + 0.5) / n - 0.5) * (w - 2) + between(-0.3, 0.3), between(2.5, 4), h / 2 - 3.6)
    body.quaternion.setFromEuler(between(0, 6.3), between(0, 6.3), between(0, 6.3))
    body.velocity.set(between(-5, 5), between(2, 6), -between(9, 16))
    body.angularVelocity.set(between(-25, 25), between(-25, 25), between(-25, 25))
    world.addBody(body)
    st.scene.add(mesh)
    dice.push({ die, mesh, body, item: it, part })
  }))

  const rotate = (q) => (v) => { const r = q.vmult(new Vec3(...v)); return [r.x, r.y, r.z] }
  const allRest = () => dice.every((d) => d.body.sleepState === Body.SLEEPING || (d.body.velocity.length() < 0.05 && d.body.angularVelocity.length() < 0.05))
  let nudges = 0
  const settle = () => {
    // a die leaning on another or on a wall: give it a small knock and let it fall flat
    const cocked = dice.filter((d) => readTop(d.die, rotate(d.body.quaternion)).flat < 0.92)
    if (cocked.length && nudges < 4) {
      nudges++
      for (const d of cocked) { d.body.wakeUp(); d.body.velocity.set(between(-3, 3), 6, between(-3, 3)); d.body.angularVelocity.set(between(-10, 10), between(-10, 10), between(-10, 10)) }
      return false
    }
    return true
  }
  const sync = () => { for (const d of dice) { d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion) } }

  return new Promise((resolve) => {
    let t = 0, skip = reducedMotion, last = performance.now(), done = false
    const finish = () => {
      done = true
      sync()
      st.renderer.render(st.scene, st.camera)
      const values = []
      for (const it of items) {
        const ds = dice.filter((d) => d.item === it)
        const tops = ds.map((d) => readTop(d.die, rotate(d.body.quaternion)).value)
        if (it.spec === 100) { const tens = tops[0] % 10, units = tops[1] % 10; values.push(tens * 10 + units || 100) } else values.push(tops[0])
      }
      st.hint.textContent = 'Tap to close'
      resolve(values)
    }
    st.el.onclick = () => { if (!done) skip = true; else close() }
    const step = (now) => {
      if (done) return
      if (skip) {
        // tap to skip: finish the same throw without drawing it
        for (let k = 0; k < 1200 && !(t > 0.6 && allRest() && settle()); k++) { world.step(1 / 60); t += 1 / 60 }
        return finish()
      }
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      world.step(1 / 60, dt, 4)
      t += dt
      sync()
      st.renderer.render(st.scene, st.camera)
      if ((t > 0.6 && allRest() && settle()) || t > 9) return finish()
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }).finally(() => { st.cleanup = () => { for (const d of dice) { st.scene.remove(d.mesh); d.mesh.geometry.dispose(); for (const m of d.mesh.material) { m.map.dispose(); m.dispose() } } } })
}

/** The total on top of the dice: title, big number, a short line. */
export function showResult({ title = '', total = '', detail = '', tone = GOLD }) {
  if (!stage) return
  stage.banner.innerHTML = ''
  const a = document.createElement('div'); a.textContent = title; Object.assign(a.style, { fontSize: '12px', color: '#9c9284', fontFamily: 'sans-serif' })
  const b = document.createElement('div'); b.textContent = total; Object.assign(b.style, { fontSize: '40px', lineHeight: '1.1', color: tone })
  const c = document.createElement('div'); c.textContent = detail; Object.assign(c.style, { fontSize: '11px', color: '#9c9284', fontFamily: 'monospace' })
  stage.banner.append(a, b, c)
  stage.banner.style.opacity = '1'
}

export function close() {
  if (!stage) return
  stage.el.style.display = 'none'
  stage.banner.style.opacity = '0'
  stage.cleanup?.()
  stage.cleanup = null
  stage.onClose?.()
}

export function onClose(fn) { if (!stage) stage = makeStage(); stage.onClose = fn }

export const ready = true
