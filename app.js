const STORAGE_KEY = 'todos.v1';
const THEME_KEY = 'theme';

const themeToggle = document.getElementById('theme-toggle');
const form = document.getElementById('new-todo-form');
const input = document.getElementById('new-todo-input');
const list = document.getElementById('todo-list');
const count = document.getElementById('count');
const clearDone = document.getElementById('clear-done');
const filterButtons = document.querySelectorAll('.filters button');

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

function render() {
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
    checkbox.addEventListener('change', () => toggleTodo(todo.id));

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

  const remaining = todos.filter((t) => !t.done).length;
  count.textContent = `${remaining} item${remaining === 1 ? '' : 's'} left`;
  clearDone.hidden = todos.every((t) => !t.done);

  for (const button of filterButtons) {
    button.classList.toggle('active', button.dataset.filter === filter);
  }
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

function currentTheme() {
  const saved = document.documentElement.getAttribute('data-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
}

themeToggle.addEventListener('click', () => {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
});

applyTheme(currentTheme());
render();
