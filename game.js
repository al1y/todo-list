/* Canvas arena for the quest board. No dependencies, no build step.
   app.js owns the todos; this file only knows about blobs and pixels. */
(function (global) {
  'use strict';

  const PLAYER_RADIUS = 15;
  const PLAYER_SPEED = 245;
  const BLOB_RADIUS = 21;
  const BLOB_SPEED = 40;
  const STRIKE_RANGE = 76;
  const STRIKE_ARC = Math.PI * 0.9;
  const STRIKE_TIME = 0.16;
  const STRIKE_COOLDOWN = 0.3;
  const HITS_TO_CLEAR = 3;
  const LABEL_GAP = 28;
  const FLEE_RANGE = 70;
  const MAX_STEP = 0.05;
  const MOVE_KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

  function angleDelta(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function truncate(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return cut.trimEnd() + '…';
  }

  function readTheme() {
    const style = getComputedStyle(document.documentElement);
    const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    return {
      floor: read('--arena-floor', '#eef1f5'),
      grid: read('--arena-grid', '#dde3ea'),
      player: read('--accent', '#0969da'),
      blob: read('--blob', '#8250df'),
      blobHurt: read('--danger', '#cf222e'),
      label: read('--card', '#ffffff'),
      text: read('--text', '#1f2328'),
      muted: read('--muted', '#6e7781'),
    };
  }

  function createGame(canvas, options) {
    const ctx = canvas.getContext('2d');
    const onClear = options.onClear;
    const isTyping = options.isTyping || (() => false);

    const held = new Set();
    const blobs = [];
    const particles = [];
    const player = { x: 0, y: 0, facing: -Math.PI / 2, strike: 0, cooldown: 0 };

    let width = 0;
    let height = 0;
    let moveTarget = null;
    let shake = 0;
    let elapsed = 0;
    let previous = 0;
    let theme = readTheme();

    function resize() {
      const ratio = global.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (player.x === 0 && player.y === 0) {
        player.x = width / 2;
        player.y = height / 2;
      }
      player.x = clamp(player.x, PLAYER_RADIUS, Math.max(PLAYER_RADIUS, width - PLAYER_RADIUS));
      player.y = clamp(player.y, PLAYER_RADIUS, Math.max(PLAYER_RADIUS, height - PLAYER_RADIUS));
      for (const blob of blobs) {
        blob.x = clamp(blob.x, BLOB_RADIUS, Math.max(BLOB_RADIUS, width - BLOB_RADIUS));
        blob.y = clamp(blob.y, BLOB_RADIUS, Math.max(BLOB_RADIUS, floorY()));
      }
    }

    /* Blobs stay a label's height off the bottom so their titles stay readable. */
    function floorY() {
      return height - BLOB_RADIUS - LABEL_GAP;
    }

    function spawnPoint() {
      let best = { x: width / 2, y: height / 2, distance: -1 };
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const x = rand(BLOB_RADIUS + 8, Math.max(BLOB_RADIUS + 9, width - BLOB_RADIUS - 8));
        const y = rand(BLOB_RADIUS + 8, Math.max(BLOB_RADIUS + 9, floorY()));
        const distance = Math.hypot(x - player.x, y - player.y);
        if (distance > 140) return { x, y };
        if (distance > best.distance) best = { x, y, distance };
      }
      return best;
    }

    /* Mirror the active todos into the arena: one blob per unfinished item. */
    function sync(items) {
      const wanted = new Map(items.map((item) => [item.id, item.title]));

      for (let i = blobs.length - 1; i >= 0; i -= 1) {
        if (wanted.has(blobs[i].id)) {
          blobs[i].title = wanted.get(blobs[i].id);
        } else {
          blobs.splice(i, 1);
        }
      }

      const present = new Set(blobs.map((blob) => blob.id));
      for (const [id, title] of wanted) {
        if (present.has(id)) continue;
        const spot = spawnPoint();
        blobs.push({
          id,
          title,
          x: spot.x,
          y: spot.y,
          heading: rand(0, Math.PI * 2),
          hp: HITS_TO_CLEAR,
          hurt: 0,
          knockX: 0,
          knockY: 0,
          phase: rand(0, Math.PI * 2),
          born: elapsed,
        });
      }
    }

    function burst(x, y, color, amount) {
      for (let i = 0; i < amount; i += 1) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(50, 210);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.3, 0.7),
          age: 0,
          size: rand(2, 5),
          color,
        });
      }
    }

    function damage(blob) {
      blob.hp -= 1;
      blob.hurt = 0.22;
      const angle = Math.atan2(blob.y - player.y, blob.x - player.x);
      blob.knockX = Math.cos(angle) * 240;
      blob.knockY = Math.sin(angle) * 240;
      shake = Math.max(shake, 5);

      if (blob.hp > 0) {
        burst(blob.x, blob.y, theme.blobHurt, 7);
        return;
      }

      burst(blob.x, blob.y, theme.blob, 26);
      shake = 11;
      blobs.splice(blobs.indexOf(blob), 1);
      onClear(blob.id);
    }

    function strike() {
      if (player.cooldown > 0) return;
      player.cooldown = STRIKE_COOLDOWN;
      player.strike = STRIKE_TIME;

      for (const blob of blobs.slice()) {
        const dx = blob.x - player.x;
        const dy = blob.y - player.y;
        if (Math.hypot(dx, dy) > STRIKE_RANGE + BLOB_RADIUS) continue;
        if (Math.abs(angleDelta(Math.atan2(dy, dx), player.facing)) > STRIKE_ARC / 2) continue;
        damage(blob);
      }
    }

    function movePlayer(dt) {
      let dx = 0;
      let dy = 0;
      if (held.has('left')) dx -= 1;
      if (held.has('right')) dx += 1;
      if (held.has('up')) dy -= 1;
      if (held.has('down')) dy += 1;

      if (dx !== 0 || dy !== 0) {
        moveTarget = null;
      } else if (moveTarget) {
        const tx = moveTarget.x - player.x;
        const ty = moveTarget.y - player.y;
        if (Math.hypot(tx, ty) < 6) {
          moveTarget = null;
        } else {
          dx = tx;
          dy = ty;
        }
      }

      const length = Math.hypot(dx, dy);
      if (length === 0) return;

      player.facing = Math.atan2(dy, dx);
      player.x = clamp(player.x + (dx / length) * PLAYER_SPEED * dt, PLAYER_RADIUS, width - PLAYER_RADIUS);
      player.y = clamp(player.y + (dy / length) * PLAYER_SPEED * dt, PLAYER_RADIUS, height - PLAYER_RADIUS);
    }

    function moveBlob(blob, dt) {
      blob.heading += rand(-1.6, 1.6) * dt;
      let vx = Math.cos(blob.heading) * BLOB_SPEED;
      let vy = Math.sin(blob.heading) * BLOB_SPEED;

      /* Skittish up close, but slower than the player: chasing one always wins.
         An earlier, stronger flee (110px, 2.4x) started outside strike range and
         made blobs effectively unhittable. */
      const dx = blob.x - player.x;
      const dy = blob.y - player.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < FLEE_RANGE) {
        const flee = (1 - distance / FLEE_RANGE) * BLOB_SPEED * 1.1;
        vx += (dx / distance) * flee;
        vy += (dy / distance) * flee;
      }

      for (const other of blobs) {
        if (other === blob) continue;
        const ox = blob.x - other.x;
        const oy = blob.y - other.y;
        const gap = Math.hypot(ox, oy) || 1;
        if (gap < BLOB_RADIUS * 2.4) {
          vx += (ox / gap) * 60;
          vy += (oy / gap) * 60;
        }
      }

      blob.x += (vx + blob.knockX) * dt;
      blob.y += (vy + blob.knockY) * dt;
      blob.knockX *= Math.pow(0.0015, dt);
      blob.knockY *= Math.pow(0.0015, dt);

      if (blob.x < BLOB_RADIUS || blob.x > width - BLOB_RADIUS) {
        blob.heading = Math.PI - blob.heading;
        blob.knockX *= -0.4;
      }
      if (blob.y < BLOB_RADIUS || blob.y > floorY()) {
        blob.heading = -blob.heading;
        blob.knockY *= -0.4;
      }
      blob.x = clamp(blob.x, BLOB_RADIUS, Math.max(BLOB_RADIUS, width - BLOB_RADIUS));
      blob.y = clamp(blob.y, BLOB_RADIUS, Math.max(BLOB_RADIUS, floorY()));
      if (blob.hurt > 0) blob.hurt -= dt;
    }

    function update(dt) {
      elapsed += dt;
      player.strike = Math.max(0, player.strike - dt);
      player.cooldown = Math.max(0, player.cooldown - dt);
      shake = Math.max(0, shake - dt * 30);

      movePlayer(dt);
      for (const blob of blobs) moveBlob(blob, dt);

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        particle.age += dt;
        if (particle.age >= particle.life) {
          particles.splice(i, 1);
          continue;
        }
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= Math.pow(0.05, dt);
        particle.vy *= Math.pow(0.05, dt);
      }
    }

    function drawFloor() {
      ctx.fillStyle = theme.floor;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 32; x < width; x += 32) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, height);
      }
      for (let y = 32; y < height; y += 32) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
      }
      ctx.stroke();
    }

    function drawBlob(blob) {
      const age = Math.min(1, (elapsed - blob.born) * 3);
      const wobble = Math.sin(elapsed * 4 + blob.phase) * 2;
      const radius = Math.max(0.5, (BLOB_RADIUS + wobble) * age);
      const minor = Math.max(0.5, radius - wobble * age);

      ctx.save();
      ctx.translate(blob.x, blob.y);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.95, radius * 0.8, radius * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = blob.hurt > 0 ? theme.blobHurt : theme.blob;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, minor, 0, 0, Math.PI * 2);
      ctx.fill();

      const look = clamp((player.x - blob.x) / 60, -1, 1) * 3;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-radius * 0.34 + look, -radius * 0.18, radius * 0.22, 0, Math.PI * 2);
      ctx.arc(radius * 0.34 + look, -radius * 0.18, radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10121a';
      ctx.beginPath();
      ctx.arc(-radius * 0.34 + look * 1.6, -radius * 0.16, radius * 0.1, 0, Math.PI * 2);
      ctx.arc(radius * 0.34 + look * 1.6, -radius * 0.16, radius * 0.1, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < HITS_TO_CLEAR; i += 1) {
        ctx.fillStyle = i < blob.hp ? theme.blobHurt : theme.grid;
        ctx.fillRect(-11 + i * 8, -radius - 12, 6, 3);
      }
      ctx.restore();
    }

    function drawLabel(blob) {
      ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = truncate(ctx, blob.title, Math.min(160, width - 24));
      const boxWidth = ctx.measureText(label).width + 12;
      const boxX = clamp(blob.x - boxWidth / 2, 4, Math.max(4, width - boxWidth - 4));
      const boxY = blob.y + BLOB_RADIUS + 6;
      ctx.globalAlpha = Math.min(1, (elapsed - blob.born) * 3);
      ctx.fillStyle = theme.label;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, 18, 9);
      ctx.fill();
      ctx.fillStyle = theme.text;
      ctx.fillText(label, boxX + boxWidth / 2, boxY + 9);
      ctx.globalAlpha = 1;
    }

    function drawPlayer() {
      if (player.strike > 0) {
        const progress = 1 - player.strike / STRIKE_TIME;
        ctx.save();
        ctx.globalAlpha = 0.65 * (1 - progress);
        ctx.strokeStyle = theme.player;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(
          player.x,
          player.y,
          STRIKE_RANGE * 0.8,
          player.facing - STRIKE_ARC / 2,
          player.facing - STRIKE_ARC / 2 + STRIKE_ARC * progress
        );
        ctx.stroke();
        ctx.restore();
      }

      const bob = Math.sin(elapsed * 6) * 1.2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      ctx.beginPath();
      ctx.ellipse(player.x, player.y + PLAYER_RADIUS, PLAYER_RADIUS * 0.8, PLAYER_RADIUS * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = theme.player;
      ctx.beginPath();
      ctx.arc(player.x, player.y + bob, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(
        player.x + Math.cos(player.facing) * 5 - 4,
        player.y + bob + Math.sin(player.facing) * 5 - 2,
        3,
        0,
        Math.PI * 2
      );
      ctx.arc(
        player.x + Math.cos(player.facing) * 5 + 4,
        player.y + bob + Math.sin(player.facing) * 5 - 2,
        3,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    function drawEmptyState() {
      ctx.fillStyle = theme.muted;
      ctx.font = '600 15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Arena clear. Add a quest above.', width / 2, height / 2 - 44);
    }

    function draw() {
      ctx.save();
      drawFloor();
      if (shake > 0) {
        ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
      }
      if (blobs.length === 0) drawEmptyState();
      for (const blob of blobs) drawBlob(blob);
      drawPlayer();
      for (const blob of blobs) drawLabel(blob);
      for (const particle of particles) {
        ctx.globalAlpha = 1 - particle.age / particle.life;
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function frame(now) {
      const dt = previous === 0 ? 0 : Math.min(MAX_STEP, (now - previous) / 1000);
      previous = now;
      update(dt);
      draw();
      global.requestAnimationFrame(frame);
    }

    function pointerTo(event) {
      const bounds = canvas.getBoundingClientRect();
      moveTarget = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    global.addEventListener('keydown', (event) => {
      if (isTyping()) return;
      const direction = MOVE_KEYS[event.code];
      if (direction) {
        held.add(direction);
        event.preventDefault();
        return;
      }
      if (event.code === 'Space' || event.code === 'Enter') {
        strike();
        event.preventDefault();
      }
    });

    global.addEventListener('keyup', (event) => {
      const direction = MOVE_KEYS[event.code];
      if (direction) held.delete(direction);
    });

    global.addEventListener('blur', () => held.clear());
    global.addEventListener('resize', resize);

    canvas.addEventListener('pointerdown', (event) => {
      pointerTo(event);
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons === 1) pointerTo(event);
    });

    resize();
    global.requestAnimationFrame(frame);

    if (global.matchMedia) {
      global.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        theme = readTheme();
      });
    }

    /* snapshot() is the seam test.js drives the arena through. */
    function snapshot() {
      return {
        player: { x: player.x, y: player.y },
        blobs: blobs.map((blob) => ({ id: blob.id, x: blob.x, y: blob.y, hp: blob.hp })),
        bounds: { width, height },
      };
    }

    return { sync, strike, resize, snapshot };
  }

  global.QuestArena = { create: createGame, hitsToClear: HITS_TO_CLEAR };
})(window);
