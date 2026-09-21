const STORAGE_KEY = 'todos.v1';
const RING_CIRCUMFERENCE = 2 * Math.PI * 20;
const REMOVE_ANIMATION_MS = 220;

const form = document.getElementById('new-todo-form');
const input = document.getElementById('new-todo-input');
const list = document.getElementById('todo-list');
const count = document.getElementById('count');
const clearDone = document.getElementById('clear-done');
const filters = document.getElementById('filters');
const filterGlow = document.getElementById('filter-glow');
const filterButtons = filters.querySelectorAll('button');
const progress = document.querySelector('.progress');
const ringValue = document.getElementById('ring-value');
const progressPercent = document.getElementById('progress-percent');
const progressLabel = document.getElementById('progress-label');
const tagline = document.getElementById('tagline');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let todos = load();
let filter = 'all';

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
  render();
}

function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (todo) todo.done = !todo.done;
  save();
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

function taglineFor(total, remaining) {
  if (total === 0) return "A clean slate. What's first?";
  if (remaining === 0) return 'Everything done. Nice work.';
  if (remaining === 1) return 'One left. Almost there.';
  if (remaining === total) return "Let's make today count.";
  return 'Good momentum, keep going.';
}

function renderProgress() {
  const total = todos.length;
  const done = todos.filter((t) => t.done).length;
  const ratio = total === 0 ? 0 : done / total;
  const percent = Math.round(ratio * 100);

  ringValue.style.strokeDasharray = RING_CIRCUMFERENCE;
  ringValue.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - ratio);
  progressPercent.textContent = `${percent}%`;
  progressLabel.textContent = `${percent}% complete, ${done} of ${total} done`;
  progress.classList.toggle('complete', total > 0 && done === total);
  tagline.textContent = taglineFor(total, total - done);
}

function moveFilterGlow() {
  const active = filters.querySelector('button.active');
  if (!active) return;
  filterGlow.style.width = `${active.offsetWidth}px`;
  filterGlow.style.transform = `translateX(${active.offsetLeft - filters.clientLeft}px)`;
}

function removeIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  svg.append(path);
  return svg;
}

function animateRemoval(li, id) {
  if (reduceMotion.matches) {
    removeTodo(id);
    return;
  }
  li.classList.add('leaving');
  setTimeout(() => removeTodo(id), REMOVE_ANIMATION_MS);
}

function render() {
  list.replaceChildren();

  const visible = visibleTodos();
  if (visible.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';

    const icon = document.createElement('span');
    icon.className = 'empty-icon';
    icon.textContent = todos.length === 0 ? '🌱' : '🔍';
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = todos.length === 0 ? 'Nothing to do. Add something above.' : 'Nothing here.';

    empty.append(icon, text);
    list.append(empty);
  }

  visible.forEach((todo, index) => {
    const li = document.createElement('li');
    li.className = 'todo' + (todo.done ? ' done' : '');
    li.style.setProperty('--delay', `${Math.min(index, 12) * 35}ms`);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.done;
    checkbox.setAttribute('aria-label', `Mark "${todo.title}" ${todo.done ? 'not done' : 'done'}`);
    checkbox.addEventListener('change', () => toggleTodo(todo.id));

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = todo.title;

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.type = 'button';
    remove.append(removeIcon());
    remove.setAttribute('aria-label', `Delete "${todo.title}"`);
    remove.addEventListener('click', () => animateRemoval(li, todo.id));

    li.append(checkbox, title, remove);
    list.append(li);
  });

  const remaining = todos.filter((t) => !t.done).length;
  count.textContent = `${remaining} item${remaining === 1 ? '' : 's'} left`;
  clearDone.hidden = todos.every((t) => !t.done);

  for (const button of filterButtons) {
    button.classList.toggle('active', button.dataset.filter === filter);
  }

  renderProgress();
  moveFilterGlow();
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
    render();
  });
}

window.addEventListener('resize', moveFilterGlow);

render();
