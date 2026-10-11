# Stickers

`deb/` holds the 28 stickers of Deb, PyArena's original mascot (a junior
developer in a cream hoodie), grouped into the 7 mascot moods in
`src/config/mascots.ts`. They are drawn from shapes in `scripts/deb/` and built
by `scripts/build-stickers.mjs`:

```bash
node scripts/build-stickers.mjs                         # rebuild the SVGs here
node scripts/build-stickers.mjs --png out/png --sheet out/sheet.png   # 1024 px PNGs + contact sheet
```

The art is original to this project; see the copyright note in
`src/config/mascots.ts`.
