# Today

A todo list with big vibes. Plain HTML, CSS and JavaScript, no build step, no dependencies.

- Add, complete and delete todos
- Filter by all / active / done
- Clear completed items
- Persists in `localStorage`
- Live progress bar and a tagline that reacts to what is left
- Confetti when you finish something, more of it when you finish everything
- Drifting aurora backdrop, glass card, gradient type
- Light and dark mode via `prefers-color-scheme`
- Honours `prefers-reduced-motion`: no drift, no confetti, no transitions

## Run

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Files

- `index.html` – markup
- `style.css` – styling, backdrop and motion
- `app.js` – state, rendering, persistence and celebration
