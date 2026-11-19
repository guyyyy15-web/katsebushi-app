// Builds src/app.jsx (+ React) into one minified app.js, so the page needs no CDN and no in-browser Babel.
// app.js is committed: GitHub Pages serves this repo as it is (no build on the server).
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const common = { bundle: true, minify: true, write: false, format: 'iife', target: 'safari15', define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'none' }

/** app.js: the sheet (React included). */
export async function bundle() {
  const r = await build({ ...common, entryPoints: ['src/app.jsx'], jsx: 'transform' })
  return r.outputFiles[0].text
}
/** dice3d.js: the dice thrown on screen (three.js + cannon-es), loaded the first time dice are thrown. */
export async function bundle3d() {
  const r = await build({ ...common, entryPoints: ['src/dice3d.js'], globalName: 'KDice3D' })
  return r.outputFiles[0].text
}

if (process.argv[1].endsWith('build.mjs')) {
  const js = await bundle()
  writeFileSync('app.js', js)
  const js3d = await bundle3d()
  writeFileSync('dice3d.js', js3d)
  // The service worker's cache name follows the content, so every release replaces the old files on the phone.
  const files = ['index.html', 'app.js', 'dice3d.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png']
  const hash = createHash('sha256')
  for (const f of files) hash.update(readFileSync(f))
  const sw = readFileSync('sw.js', 'utf8').replace(/const VERSION = '[^']*'/, `const VERSION = 'k-${hash.digest('hex').slice(0, 10)}'`)
  writeFileSync('sw.js', sw)
  console.log(`app.js ${(js.length / 1024).toFixed(0)} KB, dice3d.js ${(js3d.length / 1024).toFixed(0)} KB`)
}
