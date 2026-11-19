# Katsebushi: rules for Claude sessions

D&D 2024 Monk character sheet for Guy, a phone web app on GitHub Pages (served from `main`, repo root, no CI build).

- Edit `src/`, then `npm run build`: `app.js` and `dice3d.js` are committed and must match `src/` (a test checks).
  The build also sets `VERSION` in `sw.js` from the files' content, so phones pick up each release.
- New files the page needs go in `FILES` in `sw.js` (a test checks the main ones). No CDN scripts: it must work offline.
- Saves are `localStorage` keys `katsebushiStandalone:*`. Never change their shape without reading old saves too:
  a player's character is in there. Backups (`makeBackup`/`parseBackup`) must keep importing older files.
- Dice thrown on screen take their result from the physics (`readTop` in `src/polyhedra.js`), never from a separate
  random number. Randomness for the throw comes from `crypto.getRandomValues`.
- Before pushing: `npm test` and `npm run smoke` (check screenshots/ by eye after UI changes).
- Rules text is a simplified summary; the PHB wins. Guy writes in Hebrew: answer in Hebrew; the app's UI is English.
