# Katsebushi

A character sheet for **Katsebushi**, a D&D 2024 Monk (Warrior of the Open Hand),
built to use on a phone at the table.

**Live:** https://guyyyy15-web.github.io/katsebushi-app/

## Run it

Open `index.html` in any browser. No build and no install. React and Babel load
from a CDN, so the first load needs an internet connection.

## What's inside

- Monk class features by level, from Martial Arts up to Body and Mind, including the Open Hand subclass
- Current and max HP, Focus points, and buttons for Uncanny Metabolism, Deflect Attacks and Wholeness of Body
- Feats and Ability Score Improvements, plus an Epic Boon
- Named save slots: save, load, copy and delete characters

## Saves

Saves are kept in the browser's `localStorage`. They stay on that device and in
that browser only, and clearing site data deletes them.

## Layout

Everything is in `index.html`: styles, data and the React app, which is compiled
in the browser by Babel.
