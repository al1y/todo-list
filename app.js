const STORAGE_KEY = 'todos.v1';

const form = document.getElementById('new-todo-form');
const input = document.getElementById('new-todo-input');
const list = document.getElementById('todo-list');
const count = document.getElementById('count');
const clearDone = document.getElementById('clear-done');
const filterButtons = document.querySelectorAll('.filters button');
const today = document.getElementById('today');
const tagline = document.getElementById('tagline');
const progress = document.getElementById('progress');
const progressFill = document.getElementById('progress-fill');
const confetti = document.getElementById('confetti');
const stage = document.querySelector('.stage-frame');
const stageStatus = document.getElementById('stage-status');
const stageBanner = document.getElementById('stage-banner');
const canvas = document.getElementById('quest');

const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
const CONFETTI_COLORS = ['#6d4aff', '#ff4fa3', '#00d4ff', '#ffd166', '#5ce1a0'];

let todos = load();
let filter = 'all';
let entrance = true;
let justDoneId = null;
let allDone = todos.length > 0 && todos.every((t) => t.done);

const game = window.TodoQuest.create({
  canvas,
  padLeft: document.getElementById('pad-left'),
  padRight: document.getElementById('pad-right'),
  padJump: document.getElementById('pad-jump'),
  onComplete: (id) => setDone(id, true, null),
});

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function addTodo(title) {
  todos.push({ id: crypto.randomUUID(), title, done: false });
  save();
  entrance = true;
  render();
}

/* Completion has two doors — the crystal in the world and the checkbox in the
 * list — so both funnel through here and the celebration only fires once. */
function setDone(id, done, origin) {
  const todo = todos.find((t) => t.id === id);
  if (!todo || todo.done === done) return;

  todo.done = done;
  if (done) justDoneId = id;
  save();

  const nowAllDone = todos.length > 0 && todos.every((t) => t.done);
  if (done && nowAllDone && !allDone) {
    burst(stage, 70);
    game.celebrate();
  } else if (done) {
    // A crystal reached in-game shatters on the canvas already; no origin, no confetti.
    burst(origin, 16);
  }

  render();
}

function removeTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  save();
  render();
}

function visibleTodos() {
  if (filter === 'active') return todos.filter((t) => !t.done);
  if (filter === 'done') return todos.filter((t) => t.done);
  return todos;
}

function burst(origin, pieces) {
  if (calm.matches || !origin) return;

  const { left, top, width, height } = origin.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;

  for (let i = 0; i < pieces; i++) {
    const piece = document.createElement('span');
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 220;
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance + 220}px`);
    piece.style.setProperty('--rot', `${360 + Math.random() * 720}deg`);
    piece.style.setProperty('--dur', `${1.1 + Math.random() * 0.9}s`);
    piece.addEventListener('animationend', () => piece.remove());
    confetti.append(piece);
  }
}

function taglineFor(remaining, total) {
  if (total === 0) return 'A clean slate. What is calling?';
  if (remaining === 0) return 'Everything done. Go and enjoy it.';
  if (remaining === 1) return 'One last thing. Almost there.';
  if (remaining <= 3) return `${remaining} to go. Easy work.`;
  return `${remaining} on the list. One at a time.`;
}

function render() {
  list.replaceChildren();

  const visible = visibleTodos();
  if (visible.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = todos.length === 0 ? 'Nothing here yet. Add the first one above.' : 'Nothing in this view.';
    list.append(empty);
  }

  visible.forEach((todo, index) => {
    const li = document.createElement('li');
    li.className = 'todo' + (todo.done ? ' done' : '') + (todo.id === justDoneId ? ' just-done' : '');
    li.style.setProperty('--i', entrance ? index : 0);
    if (!entrance && todo.id !== justDoneId) li.style.animation = 'none';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.done;
    checkbox.setAttribute('aria-label', `Mark "${todo.title}" ${todo.done ? 'not done' : 'done'}`);
    checkbox.addEventListener('change', () => setDone(todo.id, checkbox.checked, checkbox));

    const title = document.createElement(todo.done ? 'span' : 'button');
    title.className = 'title';
    title.textContent = todo.title;
    if (!todo.done) {
      title.type = 'button';
      title.setAttribute('aria-label', `Go to "${todo.title}" in the task world`);
      title.addEventListener('click', () => {
        game.focusOn(todo.id);
        stage.scrollIntoView({ block: 'nearest', behavior: calm.matches ? 'auto' : 'smooth' });
      });
    }

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Delete "${todo.title}"`);
    remove.addEventListener('click', () => removeTodo(todo.id));

    li.append(checkbox, title, remove);
    list.append(li);
  });

  const remaining = todos.filter((t) => !t.done).length;
  const percent = todos.length === 0 ? 0 : Math.round(((todos.length - remaining) / todos.length) * 100);

  count.textContent = `${remaining} item${remaining === 1 ? '' : 's'} left`;
  tagline.textContent = taglineFor(remaining, todos.length);
  progressFill.style.width = `${percent}%`;
  progress.setAttribute('aria-valuenow', percent);
  clearDone.hidden = todos.every((t) => !t.done);

  for (const button of filterButtons) {
    button.classList.toggle('active', button.dataset.filter === filter);
  }

  game.sync(todos);
  const crystals = `${remaining} crystal${remaining === 1 ? '' : 's'} left`;
  stageStatus.textContent = todos.length === 0 ? 'No crystals yet' : remaining === 0 ? 'All clear' : crystals;
  canvas.setAttribute(
    'aria-label',
    todos.length === 0
      ? 'An empty world. Add a todo to put the first crystal in it.'
      : `A side-scrolling world with ${crystals} to reach.`,
  );
  allDone = todos.length > 0 && remaining === 0;
  stageBanner.hidden = !allDone;

  entrance = false;
  justDoneId = null;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  addTodo(title);
  input.value = '';
  input.focus();
});

clearDone.addEventListener('click', () => {
  todos = todos.filter((t) => !t.done);
  save();
  render();
});

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    entrance = true;
    render();
  });
}

today.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

render();
