# Today

A todo list you can play. Plain HTML, CSS and JavaScript, no build step, no dependencies.

Every open todo is a crystal floating over a platform in a small side-scrolling
world. Run and jump into a crystal and the todo is done; it shatters and leaves a
lit beacon behind. Finish the lot and the gate at the end of the day lights up.

- Add, complete and delete todos — in the world, or in the list
- 2D platformer stage: run, jump, coyote time, variable jump height, one-way platforms
- Crystals appear as you add todos and reorder themselves as you delete
- Click a todo's title to walk the character over to its crystal
- Filter by all / active / done, and clear completed items
- Persists in `localStorage`
- Live progress bar and a tagline that reacts to what is left
- Confetti and a shower of shards when the last crystal goes
- Drifting aurora backdrop, glass card, gradient type
- Light and dark mode via `prefers-color-scheme` — the canvas reads its colours from the stylesheet
- Honours `prefers-reduced-motion`: no drift, no screen shake, no bobbing, minimal particles

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | `←` `→` or `A` `D` | on-screen arrows |
| Jump | `space`, `↑`, `W` or `K` | on-screen **jump** |

Keys are ignored while you are typing in the input. On coarse-pointer devices the
on-screen pad replaces the keyboard hint and the ground rises to clear the buttons.

The list below the stage does everything the world does. Nothing is only reachable
by jumping, so the game is a way to work the list, not a gate in front of it.

## Run

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Files

- `index.html` – markup
- `style.css` – styling, backdrop, stage chrome and motion
- `game.js` – the 2D world: physics, camera, particles and rendering
- `app.js` – state, list rendering, persistence and celebration
