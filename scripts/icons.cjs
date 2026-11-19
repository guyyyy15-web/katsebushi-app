// icons/icon.svg → PNGs (run once after changing the SVG; check them by eye)
const { chromium } = require('playwright')
const fs = require('fs')
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage()
  const svg = fs.readFileSync('icons/icon.svg', 'utf8')
  for (const [name, size] of [['icon-512', 512], ['icon-192', 192], ['apple-touch-icon', 180]]) {
    await p.setViewportSize({ width: size, height: size })
    await p.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
    await p.screenshot({ path: `icons/${name}.png` })
  }
  await b.close()
})()
