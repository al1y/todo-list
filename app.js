const STORAGE_KEY = 'todos.v1';
const PROGRESS_KEY = 'todos.progress.v1';
const XP_PER_CLEAR = 12;
const XP_PER_LEVEL = 60;

const form = document.getElementById('new-todo-form');
const input = document.getElementById('new-todo-input');
const list = document.getElementById('todo-list');
const count = document.getElementById('count');
const clearDone = document.getElementById('clear-done');
const filterButtons = document.querySelectorAll('.filters button');
const arena = document.getElementById('arena');
const strikeButton = document.getElementById('strike');
const levelLabel = document.getElementById('level-label');
const xpFill = document.getElementById('xp-fill');
const status = document.getElementById('game-status');

let todos = load(STORAGE_KEY, []);
let progress = load(PROGRESS_KEY, { xp: 0 });
let filter = 'all';

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function addTodo(title) {
  todos.push({ id: crypto.randomUUID(), title, done: false });
  save();
  render();
}

function setDone(id, done) {
  const todo = todos.find((t) => t.id === id);
  if (!todo || todo.done === done) return;
  todo.done = done;
  save();
  render();
}

function removeTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  save();
  render();
}

function levelOf(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

/* Called by the arena when a blob runs out of hit points. */
function clearQuest(id) {
  const before = levelOf(progress.xp);
  progress.xp += XP_PER_CLEAR;
  const after = levelOf(progress.xp);
  setDone(id, true);
  const todo = todos.find((t) => t.id === id);
  announce(after > before ? `Level ${after}!` : `Cleared: ${todo ? todo.title : 'quest'}`);
}

function announce(message) {
  status.textContent = message;
}

function visibleTodos() {
  if (filter === 'active') return todos.filter((t) => !t.done);
  if (filter === 'done') return todos.filter((t) => t.done);
  return todos;
}

function renderRoster() {
  list.replaceChildren();

  const visible = visibleTodos();
  if (visible.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = todos.length === 0 ? 'Nothing to do. Add something above.' : 'Nothing here.';
    list.append(empty);
  }

  for (const todo of visible) {
    const li = document.createElement('li');
    li.className = 'todo' + (todo.done ? ' done' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.done;
    checkbox.setAttribute('aria-label', `Mark "${todo.title}" ${todo.done ? 'not done' : 'done'}`);
    checkbox.addEventListener('change', () => setDone(todo.id, checkbox.checked));

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = todo.title;

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Delete "${todo.title}"`);
    remove.addEventListener('click', () => removeTodo(todo.id));

    li.append(checkbox, title, remove);
    list.append(li);
  }
}

function renderProgress() {
  const level = levelOf(progress.xp);
  const into = progress.xp % XP_PER_LEVEL;
  levelLabel.textContent = `Level ${level}`;
  xpFill.style.width = `${(into / XP_PER_LEVEL) * 100}%`;
  xpFill.parentElement.setAttribute('aria-valuenow', String(into));
  xpFill.parentElement.setAttribute('aria-valuetext', `${into} of ${XP_PER_LEVEL} XP to level ${level + 1}`);
}

function render() {
  renderRoster();
  renderProgress();

  const remaining = todos.filter((t) => !t.done).length;
  count.textContent = `${remaining} item${remaining === 1 ? '' : 's'} left`;
  clearDone.hidden = todos.every((t) => !t.done);
  arena.setAttribute(
    'aria-label',
    `Arena with ${remaining} unfinished ${remaining === 1 ? 'quest' : 'quests'}. The list below does the same job without the game.`
  );

  for (const button of filterButtons) {
    button.classList.toggle('active', button.dataset.filter === filter);
  }

  game.sync(todos.filter((t) => !t.done).map((t) => ({ id: t.id, title: t.title })));
}

const game = QuestArena.create(arena, {
  onClear: clearQuest,
  isTyping: () => document.activeElement === input,
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  addTodo(title);
  input.value = '';
  input.focus();
});

strikeButton.addEventListener('click', () => game.strike());

clearDone.addEventListener('click', () => {
  todos = todos.filter((t) => !t.done);
  save();
  render();
});

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    render();
  });
}

/* The arena is sized in CSS; a layout change needs a redraw at the new size. */
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(() => game.resize()).observe(arena);
}

render();
