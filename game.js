/* Today Quest — a small 2D side-scroller that drives the todo list.
 *
 * Every open todo is a crystal floating over a platform. Reach it and the
 * todo is done. The list underneath stays the accessible way to do the same
 * thing, so nothing here is load-bearing for getting work marked off. */

(function () {
  const TAU = Math.PI * 2;

  // World layout (all values are CSS pixels; 1 world unit = 1 CSS pixel).
  const GROUND_INSET = 30; // ground surface, measured up from the canvas floor
  const PAD_INSET = 58; // extra clearance so the on-screen buttons never sit on the player
  const START_X = 150;
  const SPACING = 250;
  const TAIL = 230; // world kept past the final platform
  const END_PAD = 70; // the gate sits this far in from the world edge
  const PLATFORM_W = 130;
  const PLATFORM_H = 14;
  const HEIGHTS = [0.24, 0.52, 0.36, 0.62, 0.44]; // platform tops, as a fraction of the climbable band
  const HEAD_ROOM = 86; // space kept above the tallest platform for its crystal and label
  const CRYSTAL_FLOAT = 36; // crystal centre above the platform top
  const CRYSTAL_R = 15;

  // Player feel.
  const GRAVITY = 2100;
  const RUN_ACCEL = 2800;
  const RUN_MAX = 300;
  const GROUND_FRICTION = 3400;
  const AIR_FRICTION = 700;
  const JUMP_V = 780; // apex ≈ 145px; the climbable band is capped below that
  const JUMP_CUT = 0.42; // velocity kept when the jump key is released mid-rise
  const COYOTE = 0.1;
  const JUMP_BUFFER = 0.12;
  const MAX_FALL = 1400;

  const STEP = 1 / 120;
  const MAX_FRAME = 0.25;

  const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
  const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
  const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyK']);

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function mulberry32(seed) {
    return function random() {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function halo(ctx, x, y, radius, colour, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, colour);
    g.addColorStop(0.45, colour);
    g.addColorStop(1, 'transparent');
    const previous = ctx.globalAlpha;
    ctx.globalAlpha = previous * alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = previous;
  }

  function ellipsize(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return cut.trimEnd() + '…';
  }

  /** Theme colours, read straight off the stylesheet so the two stay in step. */
  function readPalette(root) {
    const style = getComputedStyle(root);
    const pick = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
    return {
      accent: pick('--accent', '#6d4aff'),
      accent2: pick('--accent-2', '#ff4fa3'),
      accent3: pick('--accent-3', '#00d4ff'),
      text: pick('--text', '#1a1430'),
      muted: pick('--muted', '#6b6489'),
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
    };
  }

  function create(options) {
    const canvas = options.canvas;
    const ctx = canvas.getContext('2d');
    const onComplete = options.onComplete || function () {};
    const calmQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const darkQuery = matchMedia('(prefers-color-scheme: dark)');
    const padQuery = matchMedia('(pointer: coarse)');

    let palette = readPalette(document.documentElement);
    let viewW = 480;
    let viewH = 300;
    let groundY = viewH - GROUND_INSET;
    let worldW = viewW;

    let entities = [];
    let particles = [];
    const collected = []; // ids finished during the current step
    let stars = [];
    let camera = 0;
    let shake = 0;
    let clock = 0;
    let running = false;
    let visible = true;
    let onScreen = true;
    let raf = 0;
    let last = 0;
    let accumulator = 0;

    const keys = { left: false, right: false, jump: false, jumpPressed: false, jumpHeld: false };

    const player = {
      x: 40,
      y: 0,
      w: 24,
      h: 28,
      vx: 0,
      vy: 0,
      grounded: true,
      facing: 1,
      coyote: 0,
      buffer: 0,
      squash: 0,
      blink: 2 + Math.random() * 3,
    };

    const calm = () => calmQuery.matches;

    /* ---------- sizing ---------- */

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewW = rect.width;
      viewH = rect.height;
      canvas.width = Math.round(viewW * dpr);
      canvas.height = Math.round(viewH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      groundY = viewH - GROUND_INSET - (padQuery.matches ? PAD_INSET : 0);
      buildStars();
      layout();
      player.y = clamp(player.y, -200, groundY - player.h);
      draw();
    }

    function buildStars() {
      const random = mulberry32(1337);
      const count = Math.round((viewW * viewH) / 5200);
      stars = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: random() * 2400,
          y: random() * (groundY - 40),
          r: 0.6 + random() * 1.4,
          phase: random() * TAU,
        });
      }
    }

    /* ---------- entities ---------- */

    function targetFor(index) {
      // Never ask for a platform the player cannot reach in one jump from the ground.
      const band = Math.min(groundY - HEAD_ROOM, 136);
      return {
        x: START_X + index * SPACING,
        height: Math.max(30, band * HEIGHTS[index % HEIGHTS.length]),
      };
    }

    function platformBox(entity) {
      return {
        x: entity.x - PLATFORM_W / 2,
        y: groundY - entity.height - PLATFORM_H,
        w: PLATFORM_W,
        h: PLATFORM_H,
      };
    }

    function crystalPos(entity) {
      const top = groundY - entity.height - PLATFORM_H;
      const bob = calm() ? 0 : Math.sin(clock * 2 + entity.seed) * 5;
      return { x: entity.x, y: top - CRYSTAL_FLOAT + bob };
    }

    function layout() {
      entities.forEach((entity, index) => {
        const target = targetFor(index);
        entity.targetX = target.x;
        entity.height = target.height;
      });
      const furthest = entities.length ? targetFor(entities.length - 1).x : START_X;
      worldW = Math.max(viewW, furthest + TAIL);
    }

    /** Reconcile the world with the todo list. Ids are the identity. */
    function sync(todos) {
      const seen = new Set();

      todos.forEach((todo, index) => {
        seen.add(todo.id);
        let entity = entities.find((e) => e.id === todo.id);
        const target = targetFor(index);

        if (!entity) {
          entity = {
            id: todo.id,
            title: todo.title,
            done: todo.done,
            x: target.x,
            targetX: target.x,
            height: target.height,
            seed: Math.random() * TAU,
            spawn: 0,
            dying: 0,
            pulse: 0,
          };
          entities.push(entity);
        }

        entity.title = todo.title;
        entity.targetX = target.x;
        entity.height = target.height;
        entity.dying = 0;

        if (todo.done && !entity.done) {
          // Completed from the list rather than by reaching it: shatter anyway.
          entity.done = true;
          entity.pulse = 1;
          shatter(entity);
        } else if (!todo.done && entity.done && !collected.includes(todo.id)) {
          // Un-ticked in the list, so the crystal reforms. Ids still queued from
          // this step are skipped: the store just has not heard about them yet.
          entity.done = false;
          entity.pulse = 1;
        }
      });

      for (const entity of entities) {
        // Just above zero: `dying > 0` means "on the way out", and step() takes
        // it to 1 over a third of a second before the entity is dropped.
        if (!seen.has(entity.id) && entity.dying === 0) entity.dying = 0.0001;
      }

      // Keep the array ordered like the list so index-based layout is stable.
      const order = new Map(todos.map((t, i) => [t.id, i]));
      entities.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
      layout();

      if (!running) draw();
    }

    /* ---------- particles ---------- */

    function shatter(entity) {
      const pos = crystalPos(entity);
      const colours = [palette.accent, palette.accent2, palette.accent3];
      const count = calm() ? 8 : 22;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * TAU + Math.random() * 0.4;
        const speed = 90 + Math.random() * 220;
        particles.push({
          x: pos.x,
          y: pos.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 120,
          life: 0.6 + Math.random() * 0.6,
          age: 0,
          size: 2 + Math.random() * 4,
          spin: (Math.random() - 0.5) * 12,
          angle: Math.random() * TAU,
          colour: colours[i % colours.length],
        });
      }
      if (!calm()) shake = Math.min(shake + 7, 12);
    }

    function dust(x, y, amount) {
      if (calm()) return;
      for (let i = 0; i < amount; i++) {
        particles.push({
          x: x + (Math.random() - 0.5) * 16,
          y,
          vx: (Math.random() - 0.5) * 90,
          vy: -Math.random() * 90,
          life: 0.3 + Math.random() * 0.3,
          age: 0,
          size: 1.5 + Math.random() * 2,
          spin: 0,
          angle: 0,
          colour: palette.muted,
        });
      }
    }

    /* ---------- simulation ---------- */

    function step(dt) {
      clock += dt;

      // Horizontal movement.
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (dir !== 0) {
        player.vx += dir * RUN_ACCEL * dt;
        player.facing = dir;
      } else {
        const friction = (player.grounded ? GROUND_FRICTION : AIR_FRICTION) * dt;
        if (Math.abs(player.vx) <= friction) player.vx = 0;
        else player.vx -= Math.sign(player.vx) * friction;
      }
      player.vx = clamp(player.vx, -RUN_MAX, RUN_MAX);

      // Jump with coyote time and an input buffer.
      player.coyote = player.grounded ? COYOTE : Math.max(0, player.coyote - dt);
      player.buffer = keys.jumpPressed ? JUMP_BUFFER : Math.max(0, player.buffer - dt);
      keys.jumpPressed = false;

      if (player.buffer > 0 && player.coyote > 0) {
        player.vy = -JUMP_V;
        player.grounded = false;
        player.coyote = 0;
        player.buffer = 0;
        player.squash = -0.35;
        dust(player.x + player.w / 2, player.y + player.h, 5);
      }
      // Releasing early clips the arc once, giving a short hop and a long jump.
      if (keys.jumpHeld && !keys.jump && player.vy < 0) player.vy *= JUMP_CUT;
      keys.jumpHeld = keys.jump;

      player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);

      // Platforms are one-way: you jump up through them and land on top. Solid
      // undersides would have you bonking your head on the very crystal you want.
      const platforms = entities.filter((e) => e.dying === 0).map(platformBox);

      player.x += player.vx * dt;
      player.x = clamp(player.x, 6, worldW - END_PAD + 20 - player.w);

      const fallSpeed = player.vy;
      const prevBottom = player.y + player.h;
      player.y += player.vy * dt;
      player.grounded = false;
      if (player.vy > 0) {
        for (const box of platforms) {
          if (!overlaps(player, box) || prevBottom > box.y + 1) continue;
          player.y = box.y - player.h;
          player.vy = 0;
          player.grounded = true;
          break;
        }
      }
      if (player.y + player.h >= groundY) {
        player.y = groundY - player.h;
        player.vy = 0;
        player.grounded = true;
      }
      if (player.grounded && fallSpeed > 500) {
        player.squash = Math.min(fallSpeed / 1400, 0.45);
        dust(player.x + player.w / 2, player.y + player.h, 6);
      }

      player.squash = lerp(player.squash, 0, 1 - Math.pow(0.0001, dt));
      player.blink -= dt;
      if (player.blink < -0.12) player.blink = 2 + Math.random() * 4;

      // Crystals.
      for (const entity of entities) {
        entity.x = lerp(entity.x, entity.targetX, 1 - Math.pow(0.0005, dt));
        entity.spawn = Math.min(1, entity.spawn + dt * 3);
        entity.pulse = Math.max(0, entity.pulse - dt * 2.2);
        if (entity.dying > 0) entity.dying = Math.min(1, entity.dying + dt * 3);

        if (entity.done || entity.dying > 0 || entity.spawn < 0.35) continue;
        const pos = crystalPos(entity);
        const box = { x: pos.x - CRYSTAL_R, y: pos.y - CRYSTAL_R, w: CRYSTAL_R * 2, h: CRYSTAL_R * 2 };
        if (overlaps(player, box)) {
          entity.done = true;
          entity.pulse = 1;
          shatter(entity);
          collected.push(entity.id);
        }
      }
      entities = entities.filter((e) => e.dying < 1);

      // Particles.
      for (const p of particles) {
        p.age += dt;
        p.vy += 900 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.spin * dt;
      }
      particles = particles.filter((p) => p.age < p.life);

      // Camera.
      const want = clamp(player.x + player.w / 2 - viewW * 0.42, 0, Math.max(0, worldW - viewW));
      camera = lerp(camera, want, 1 - Math.pow(0.0008, dt));
      shake = Math.max(0, shake - dt * 26);

      // Flushed last: onComplete re-enters through sync(), which reorders
      // `entities`, and that must not happen while the loops above are running.
      if (collected.length) {
        // Drained after the calls, not before: sync() reads this queue to tell
        // "the store has not heard yet" from "un-ticked in the list".
        for (const id of collected) onComplete(id);
        collected.length = 0;
      }
    }

    /* ---------- rendering ---------- */

    function draw() {
      const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
      const shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;
      const camX = camera + shakeX;

      drawSky();
      ctx.save();
      ctx.translate(-camX, shakeY);
      drawHills(camX);
      drawGround(camX);
      drawGate();
      for (const entity of entities) drawPlatform(entity);
      for (const entity of entities) drawCrystal(entity);
      drawParticles();
      drawPlayer();
      ctx.restore();
      drawEdgeHint();
    }

    function drawSky() {
      const sky = ctx.createLinearGradient(0, 0, 0, viewH);
      if (palette.dark) {
        sky.addColorStop(0, '#120a2b');
        sky.addColorStop(0.55, '#1b0f3c');
        sky.addColorStop(1, '#2a1150');
      } else {
        sky.addColorStop(0, '#cfd6ff');
        sky.addColorStop(0.55, '#e4d7ff');
        sky.addColorStop(1, '#ffd9ee');
      }
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, viewW, viewH);

      // Aurora smear, echoing the page backdrop.
      const glow = ctx.createRadialGradient(viewW * 0.3, viewH * 0.15, 0, viewW * 0.3, viewH * 0.15, viewW * 0.7);
      glow.addColorStop(0, palette.accent);
      glow.addColorStop(1, 'transparent');
      ctx.globalAlpha = palette.dark ? 0.3 : 0.22;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, viewW, viewH);

      const glow2 = ctx.createRadialGradient(viewW * 0.82, viewH * 0.3, 0, viewW * 0.82, viewH * 0.3, viewW * 0.6);
      glow2.addColorStop(0, palette.accent2);
      glow2.addColorStop(1, 'transparent');
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#ffffff';
      for (const star of stars) {
        const x = ((star.x - camera * 0.12) % 2400 + 2400) % 2400;
        if (x > viewW + 4) continue;
        const twinkle = calm() ? 0.5 : 0.35 + Math.abs(Math.sin(clock * 1.4 + star.phase)) * 0.45;
        ctx.globalAlpha = twinkle * (palette.dark ? 0.85 : 0.5);
        ctx.beginPath();
        ctx.arc(x, star.y, star.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawHills(camX) {
      const layers = [
        { factor: 0.25, height: 66, colour: palette.accent, alpha: palette.dark ? 0.26 : 0.2, wave: 300 },
        { factor: 0.5, height: 40, colour: palette.accent2, alpha: palette.dark ? 0.22 : 0.18, wave: 210 },
      ];
      for (const layer of layers) {
        // The canvas is already translated by -camX, so shifting back by
        // camX * (1 - factor) leaves each layer moving at `factor` of camera speed.
        ctx.save();
        ctx.translate(camX * (1 - layer.factor), 0);
        ctx.globalAlpha = layer.alpha;
        ctx.fillStyle = layer.colour;

        const base = camX * layer.factor;
        ctx.beginPath();
        ctx.moveTo(base - 40, groundY + 10);
        for (let x = base - 40; x <= base + viewW + 40; x += 8) {
          ctx.lineTo(x, groundY - layer.height - Math.sin(x / layer.wave) * layer.height * 0.45);
        }
        ctx.lineTo(base + viewW + 40, groundY + 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function drawGround(camX) {
      const g = ctx.createLinearGradient(0, groundY, 0, viewH);
      g.addColorStop(0, palette.dark ? 'rgba(120,80,220,0.5)' : 'rgba(140,105,255,0.55)');
      g.addColorStop(1, palette.dark ? 'rgba(8,4,20,0.95)' : 'rgba(78,44,170,0.6)');
      ctx.fillStyle = g;
      ctx.fillRect(camX - 20, groundY, viewW + 40, viewH - groundY + 20);

      ctx.strokeStyle = palette.accent3;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(camX - 20, groundY);
      ctx.lineTo(camX + viewW + 20, groundY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Ticks so the scroll speed reads.
      ctx.fillStyle = palette.dark ? 'rgba(255,255,255,0.22)' : 'rgba(26,20,48,0.2)';
      const first = Math.floor((camX - 20) / 24) * 24;
      for (let x = first; x < camX + viewW + 20; x += 24) {
        ctx.fillRect(x, groundY + 8, 8, 2);
      }
    }

    /** The far end of the world. It lights up when there is nothing left to reach. */
    function drawGate() {
      if (entities.length === 0) return;
      const x = worldW - END_PAD;
      if (x < camera - 60 || x > camera + viewW + 60) return;

      const lit = entities.every((e) => e.done || e.dying > 0);
      const height = 74;
      const colour = lit ? palette.accent3 : palette.muted;

      if (lit) halo(ctx, x, groundY - height, 70, palette.accent3, calm() ? 0.22 : 0.18 + Math.sin(clock * 2) * 0.06);

      ctx.save();
      ctx.globalAlpha = lit ? 0.95 : 0.45;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 26, groundY);
      ctx.lineTo(x - 26, groundY - height);
      ctx.lineTo(x + 26, groundY - height);
      ctx.lineTo(x + 26, groundY);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = lit ? 1 : 0.5;
      ctx.font = '700 10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colour;
      ctx.fillText('END OF DAY', x, groundY - height - 12);
      ctx.restore();
    }

    function drawPlatform(entity) {
      const box = platformBox(entity);
      const alpha = (1 - entity.dying) * Math.min(1, entity.spawn * 1.6);
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;

      const g = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
      if (entity.done) {
        g.addColorStop(0, palette.accent3);
        g.addColorStop(1, palette.accent);
      } else {
        g.addColorStop(0, palette.accent2);
        g.addColorStop(1, palette.accent);
      }
      ctx.fillStyle = g;
      roundRect(ctx, box.x, box.y, box.w, box.h, 7);
      ctx.fill();

      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = palette.accent;
      roundRect(ctx, box.x + 10, box.y + box.h, box.w - 20, 6, 3);
      ctx.fill();

      // Support pillar down to the ground.
      ctx.globalAlpha = alpha * 0.18;
      ctx.fillStyle = palette.accent;
      ctx.fillRect(entity.x - 3, box.y + box.h, 6, groundY - box.y - box.h);
      ctx.globalAlpha = 1;
    }

    function drawCrystal(entity) {
      const pos = crystalPos(entity);
      const alpha = (1 - entity.dying) * entity.spawn;
      if (alpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = alpha;
      const label = entity.title;

      if (entity.done) {
        // A lit beacon marks finished work.
        const y = groundY - entity.height - PLATFORM_H;
        const flicker = calm() ? 1 : 0.85 + Math.sin(clock * 6 + entity.seed) * 0.15;
        halo(ctx, entity.x, y - 20, 26 * flicker, palette.accent3, 0.3 * flicker);

        ctx.strokeStyle = palette.accent3;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(entity.x, y);
        ctx.lineTo(entity.x, y - 16);
        ctx.stroke();

        ctx.fillStyle = palette.accent3;
        ctx.beginPath();
        ctx.arc(entity.x, y - 20, 5, 0, TAU);
        ctx.fill();

        // A tick, so "done" reads at a glance.
        ctx.strokeStyle = palette.dark ? '#0b0716' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(entity.x - 2.5, y - 20);
        ctx.lineTo(entity.x - 0.5, y - 18);
        ctx.lineTo(entity.x + 2.5, y - 22.5);
        ctx.stroke();

        drawLabel(entity.x, y - 34, label, true, alpha);
        ctx.restore();
        return;
      }

      const scale = 1 + entity.pulse * 0.4;
      const spin = calm() ? 0 : clock * 1.1 + entity.seed;

      ctx.globalAlpha = alpha;
      halo(ctx, pos.x, pos.y, CRYSTAL_R * 2.6 * scale, palette.accent2, 0.3);

      ctx.translate(pos.x, pos.y);
      ctx.rotate(spin);
      ctx.scale(scale, scale);

      const g = ctx.createLinearGradient(-CRYSTAL_R, -CRYSTAL_R, CRYSTAL_R, CRYSTAL_R);
      g.addColorStop(0, palette.accent3);
      g.addColorStop(0.5, palette.accent);
      g.addColorStop(1, palette.accent2);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -CRYSTAL_R);
      ctx.lineTo(CRYSTAL_R * 0.72, 0);
      ctx.lineTo(0, CRYSTAL_R);
      ctx.lineTo(-CRYSTAL_R * 0.72, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(0, -CRYSTAL_R * 0.8);
      ctx.lineTo(CRYSTAL_R * 0.34, -CRYSTAL_R * 0.12);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha;
      drawLabel(pos.x, pos.y - CRYSTAL_R - 16, label, false, alpha);
      ctx.restore();
    }

    function drawLabel(x, cy, text, done, alpha) {
      const y = Math.max(cy, 30);
      ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = ellipsize(ctx, text, 150);
      const width = ctx.measureText(label).width + 18;

      ctx.globalAlpha = alpha * (done ? 0.45 : 0.85);
      ctx.fillStyle = palette.dark ? 'rgba(10,6,24,0.72)' : 'rgba(255,255,255,0.82)';
      roundRect(ctx, x - width / 2, y - 10, width, 20, 10);
      ctx.fill();

      ctx.globalAlpha = alpha * (done ? 0.55 : 1);
      ctx.fillStyle = done ? palette.muted : palette.text;
      ctx.fillText(label, x, y + 0.5);

      if (done) {
        ctx.strokeStyle = palette.muted;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x - width / 2 + 7, y + 0.5);
        ctx.lineTo(x + width / 2 - 7, y + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawParticles() {
      for (const p of particles) {
        const t = 1 - p.age / p.life;
        ctx.globalAlpha = Math.max(0, t);
        ctx.fillStyle = p.colour;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function drawPlayer() {
      const squash = player.squash;
      const w = player.w * (1 + squash * 0.5);
      const h = player.h * (1 - squash * 0.5);
      const cx = player.x + player.w / 2;
      const bottom = player.y + player.h;

      ctx.globalAlpha = 0.28;
      ctx.fillStyle = palette.dark ? '#000' : '#1a1430';
      ctx.beginPath();
      ctx.ellipse(cx, groundY + 2, 14, 4, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.shadowColor = palette.accent2;
      ctx.shadowBlur = calm() ? 0 : 18;
      const g = ctx.createLinearGradient(cx - w / 2, bottom - h, cx + w / 2, bottom);
      g.addColorStop(0, palette.accent3);
      g.addColorStop(1, palette.accent2);
      ctx.fillStyle = g;
      roundRect(ctx, cx - w / 2, bottom - h, w, h, 9);
      ctx.fill();
      ctx.restore();

      // Face.
      const open = player.blink > 0;
      const eyeY = bottom - h * 0.62;
      const eyeX = cx + player.facing * 3;
      ctx.fillStyle = palette.dark ? '#160c33' : '#ffffff';
      if (open) {
        ctx.beginPath();
        ctx.arc(eyeX - 4, eyeY, 2.4, 0, TAU);
        ctx.arc(eyeX + 4, eyeY, 2.4, 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = palette.dark ? '#160c33' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(eyeX - 6, eyeY);
        ctx.lineTo(eyeX - 2, eyeY);
        ctx.moveTo(eyeX + 2, eyeY);
        ctx.lineTo(eyeX + 6, eyeY);
        ctx.stroke();
      }
    }

    function drawEdgeHint() {
      const ahead = entities.filter((e) => !e.done && e.dying === 0 && e.x > camera + viewW - 30).length;
      if (ahead === 0) return;
      const x = viewW - 22;
      const y = viewH * 0.45;
      const nudge = calm() ? 0 : Math.sin(clock * 4) * 3;

      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = palette.dark ? 'rgba(10,6,24,0.66)' : 'rgba(255,255,255,0.8)';
      roundRect(ctx, x - 20, y - 15, 40, 30, 15);
      ctx.fill();
      ctx.strokeStyle = palette.accent2;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 4 + nudge, y - 6);
      ctx.lineTo(x + 3 + nudge, y);
      ctx.lineTo(x - 4 + nudge, y + 6);
      ctx.stroke();
      ctx.font = '700 10px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = palette.accent2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ahead), x - 12, y + 0.5);
      ctx.restore();
    }

    /* ---------- loop ---------- */

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, MAX_FRAME);
      last = now;
      accumulator += dt;
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
      }
      draw();
    }

    function start() {
      if (running || !visible || !onScreen) return;
      running = true;
      last = performance.now();
      accumulator = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
      releaseKeys();
    }

    function releaseKeys() {
      keys.left = keys.right = keys.jump = keys.jumpHeld = false;
    }

    /* ---------- input ---------- */

    /* The world takes the keyboard while it is on screen, but never out of
     * something else's hands: typing wins outright, and space stays with a
     * focused button because that is how a keyboard user presses one. */
    const TEXT_ENTRY = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
    const SPACE_ACTIVATES = 'button, a[href], summary, [role="button"]';

    function keysAreOurs(event) {
      if (!onScreen) return false;
      const el = document.activeElement;
      if (!el || !el.matches) return true;
      if (el.matches(TEXT_ENTRY)) return false;
      return !(event.code === 'Space' && el.matches(SPACE_ACTIVATES));
    }

    function onKeyDown(event) {
      if (!keysAreOurs(event) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (LEFT_KEYS.has(event.code)) keys.left = true;
      else if (RIGHT_KEYS.has(event.code)) keys.right = true;
      else if (JUMP_KEYS.has(event.code)) {
        if (!keys.jump) keys.jumpPressed = true;
        keys.jump = true;
      } else return;
      event.preventDefault();
    }

    function onKeyUp(event) {
      if (LEFT_KEYS.has(event.code)) keys.left = false;
      else if (RIGHT_KEYS.has(event.code)) keys.right = false;
      else if (JUMP_KEYS.has(event.code)) keys.jump = false;
    }

    function bindPad(element, name) {
      if (!element) return;
      const down = (event) => {
        event.preventDefault();
        if (name === 'jump' && !keys.jump) keys.jumpPressed = true;
        keys[name] = true;
        element.classList.add('held');
        if (element.setPointerCapture && event.pointerId !== undefined) {
          try {
            element.setPointerCapture(event.pointerId);
          } catch {
            /* capture is a nicety, not a requirement */
          }
        }
      };
      const up = (event) => {
        event.preventDefault();
        keys[name] = false;
        element.classList.remove('held');
      };
      element.addEventListener('pointerdown', down);
      element.addEventListener('pointerup', up);
      element.addEventListener('pointercancel', up);
      element.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /* ---------- lifecycle ---------- */

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const intersection = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) start();
      else stop();
    });
    intersection.observe(canvas);

    function onVisibility() {
      visible = !document.hidden;
      if (visible) start();
      else stop();
    }

    function onTheme() {
      palette = readPalette(document.documentElement);
      draw();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseKeys);
    document.addEventListener('visibilitychange', onVisibility);
    darkQuery.addEventListener('change', onTheme);
    padQuery.addEventListener('change', resize);
    calmQuery.addEventListener('change', draw);

    bindPad(options.padLeft, 'left');
    bindPad(options.padRight, 'right');
    bindPad(options.padJump, 'jump');

    resize();
    player.y = groundY - player.h;
    start();

    return {
      sync,
      celebrate() {
        if (calm()) return;
        shake = 14;
        for (let i = 0; i < 60; i++) {
          const angle = Math.random() * TAU;
          const speed = 120 + Math.random() * 260;
          particles.push({
            x: camera + viewW / 2,
            y: viewH * 0.4,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 200,
            life: 0.9 + Math.random() * 0.8,
            age: 0,
            size: 3 + Math.random() * 4,
            spin: (Math.random() - 0.5) * 14,
            angle: Math.random() * TAU,
            colour: [palette.accent, palette.accent2, palette.accent3][i % 3],
          });
        }
      },
      focusOn(id) {
        const entity = entities.find((e) => e.id === id);
        if (!entity) return;
        player.x = clamp(entity.targetX - 90, 6, worldW - END_PAD + 20 - player.w);
        player.y = groundY - player.h;
        player.vx = 0;
        player.vy = 0;
        camera = clamp(player.x - viewW * 0.42, 0, Math.max(0, worldW - viewW));
      },
      destroy() {
        stop();
        resizeObserver.disconnect();
        intersection.disconnect();
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', releaseKeys);
        document.removeEventListener('visibilitychange', onVisibility);
        darkQuery.removeEventListener('change', onTheme);
        padQuery.removeEventListener('change', resize);
        calmQuery.removeEventListener('change', draw);
      },
    };
  }

  window.TodoQuest = { create };
})();
