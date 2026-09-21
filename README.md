# Todo Quest

A todo list you play. Every unfinished todo is a blob wandering a 2D arena; three
hits clears it and marks it done. Plain HTML, CSS, canvas and JavaScript, no build
step, no dependencies.

- Add todos, then clear them in the arena or tick them off in the roster below it
- Move with `WASD` / arrow keys, or drag in the arena. `Space` (or the Strike button) swings
- Blobs are skittish up close, but slower than you
- XP and levels for every quest cleared
- Filter by all / active / done, clear completed items
- Persists in `localStorage`
- Light and dark mode via `prefers-color-scheme`

The arena is the fun part, not the only part: the roster underneath is a plain,
keyboard- and screen-reader-accessible todo list, and the two stay in sync.

## Run

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Test

```bash
node test.cjs
```

The tests stub the DOM and drive the frame loop by hand, so they cover the real
game logic (spawning, input, catching a blob) without a browser.

## Files

- `index.html` – markup
- `style.css` – styling
- `game.js` – the 2D arena: entities, input, physics, canvas rendering
- `app.js` – todo state, XP, roster rendering and persistence
- `test.cjs` – headless tests for the arena
