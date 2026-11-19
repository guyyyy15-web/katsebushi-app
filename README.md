# Katsebushi

A character sheet for **Katsebushi**, a D&D 2024 Monk (Warrior of the Open Hand),
built to use on a phone at the table.

**Live:** https://guyyyy15-web.github.io/katsebushi-app/ — on the iPhone: Share → **Add to Home Screen**.

## What's inside

- Monk class features by level, from Martial Arts up to Body and Mind, including the Open Hand subclass
- Current and max HP, Focus points, and buttons for Uncanny Metabolism, Deflect Attacks and Wholeness of Body
- Feats and Ability Score Improvements, plus an Epic Boon
- Named save slots: save, load, copy and delete characters
- **Dice from any screen** (🎲): pick dice and a bonus, and they are thrown on the screen with real physics
  (the result is the face that lands on top). The Dice screen rolls straight from the sheet: to hit, damage,
  crits, saves, initiative, advantage and disadvantage. "Throw on screen" can be turned off for instant numbers.
- **Backup file**: Save States → Export all (share to Files, iCloud or WhatsApp) and Import file on any device.
- **Works offline** once opened, and installs to the home screen.

## Saves

Saves live in the browser's `localStorage`, on that device and in that browser only. Safari can clear them when
a site isn't opened for a while, and the home-screen app has its own storage, separate from Safari. Export a
backup file now and then (the home screen reminds you after 14 days).

## Run it

```bash
npm install
npm run build   # src/ → app.js and dice3d.js (committed: GitHub Pages serves the repo as it is)
npm test        # dice maths, dice shapes, backups, and that app.js / dice3d.js match src/
npm run smoke   # iPhone-sized browser test incl. a 3D throw, offline and backup round trip
```

## Layout

```
index.html          the page (no CDN scripts, no Babel in the browser)
src/app.jsx         the React app: sheet, level up, saves, dice tray and screen
src/dice.js         dice and backup logic (pure, tested)
src/polyhedra.js    d4–d20 shapes and reading the top face (pure, tested)
src/dice3d.js       dice thrown on screen: three.js + cannon-es, loaded the first time dice are thrown
app.js dice3d.js    built bundles
sw.js               offline cache (VERSION is set by the build)
icons/              icon.svg → PNGs (node scripts/icons.cjs)
```
