/* Headless tests for the arena logic. Run with: node test.cjs
   Stubs just enough DOM for game.js, then drives the frame loop by hand. */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const noop = () => {};
const listeners = { window: {}, canvas: {} };
const frames = [];

const ctx = new Proxy(
  {},
  {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return (text) => ({ width: String(text).length * 7 });
      return noop;
    },
  }
);

const canvas = {
  clientWidth: 600,
  clientHeight: 400,
  getContext: () => ctx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 400 }),
  addEventListener: (type, fn) => {
    (listeners.canvas[type] = listeners.canvas[type] || []).push(fn);
  },
};

global.window = global;
global.devicePixelRatio = 1;
global.document = { documentElement: {}, activeElement: null };
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.matchMedia = () => ({ addEventListener: noop });
global.requestAnimationFrame = (fn) => frames.push(fn);
global.addEventListener = (type, fn) => {
  (listeners.window[type] = listeners.window[type] || []).push(fn);
};

/* game.js is a browser script, not a module: run it against the stubs above. */
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8'), { filename: 'game.js' });

let clock = 0;
function step(ms) {
  clock += ms;
  for (const frame of frames.splice(0)) frame(clock);
}

function fire(where, type, event) {
  for (const fn of listeners[where][type] || []) fn(event);
}

function key(code) {
  fire('window', 'keydown', { code, preventDefault: noop });
  fire('window', 'keyup', { code, preventDefault: noop });
}

function pointAt(x, y) {
  fire('canvas', 'pointerdown', { clientX: x, clientY: y, preventDefault: noop });
}

const cleared = [];
let typing = false;
const game = window.QuestArena.create(canvas, {
  onClear: (id) => cleared.push(id),
  isTyping: () => typing,
});

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('one blob per unfinished todo', () => {
  game.sync([{ id: 'a', title: 'First' }, { id: 'b', title: 'Second' }]);
  assert.strictEqual(game.snapshot().blobs.length, 2);
  assert.deepStrictEqual(game.snapshot().blobs.map((b) => b.id).sort(), ['a', 'b']);
});

test('a todo finished elsewhere leaves the arena', () => {
  game.sync([{ id: 'a', title: 'First' }]);
  assert.deepStrictEqual(game.snapshot().blobs.map((b) => b.id), ['a']);
  game.sync([]);
  assert.strictEqual(game.snapshot().blobs.length, 0);
});

test('keys do nothing while the todo input has focus', () => {
  game.sync([]);
  const before = game.snapshot().player;
  typing = true;
  for (let i = 0; i < 30; i += 1) {
    fire('window', 'keydown', { code: 'KeyD', preventDefault: noop });
    step(16);
  }
  typing = false;
  fire('window', 'keyup', { code: 'KeyD', preventDefault: noop });
  const after = game.snapshot().player;
  assert.strictEqual(Math.round(before.x), Math.round(after.x));
  assert.strictEqual(Math.round(before.y), Math.round(after.y));
});

test('arrow keys move the player', () => {
  const before = game.snapshot().player;
  fire('window', 'keydown', { code: 'ArrowLeft', preventDefault: noop });
  for (let i = 0; i < 12; i += 1) step(16);
  fire('window', 'keyup', { code: 'ArrowLeft', preventDefault: noop });
  assert.ok(game.snapshot().player.x < before.x - 20, 'player should have moved left');
});

test('a chased blob can be caught and cleared', () => {
  cleared.length = 0;
  game.sync([{ id: 'quest', title: 'Catch me' }]);

  let ticks = 0;
  while (cleared.length === 0 && ticks < 900) {
    const state = game.snapshot();
    const blob = state.blobs[0];
    if (!blob) break;
    pointAt(blob.x, blob.y);
    if (Math.hypot(blob.x - state.player.x, blob.y - state.player.y) < 80) key('Space');
    step(16);
    ticks += 1;
  }

  assert.deepStrictEqual(cleared, ['quest'], 'chasing a blob should clear it');
  assert.ok(ticks < 500, `took ${ticks} frames (~${(ticks / 62.5).toFixed(1)}s) to clear one blob`);
  assert.strictEqual(game.snapshot().blobs.length, 0);
});

test('blobs stay inside the arena', () => {
  game.sync(Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, title: `Quest ${i}` })));
  for (let i = 0; i < 600; i += 1) step(16);
  for (const blob of game.snapshot().blobs) {
    assert.ok(blob.x >= 0 && blob.x <= 600, `x out of bounds: ${blob.x}`);
    assert.ok(blob.y >= 0 && blob.y <= 400, `y out of bounds: ${blob.y}`);
  }
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passing`);
process.exit(failed === 0 ? 0 : 1);
