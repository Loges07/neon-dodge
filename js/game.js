/* Neon Dodge — game engine.
 * Plain script (no modules) so the game runs straight from index.html with no server.
 */
(() => {
  'use strict';

  // =====================================================================
  // Utilities
  // =====================================================================
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hyp = Math.hypot;

  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return hyp(px - (ax + t * dx), py - (ay + t * dy));
  }

  function angDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function weighted(entries) {
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = Math.random() * total;
    for (const [v, w] of entries) {
      r -= w;
      if (r <= 0) return v;
    }
    return entries[entries.length - 1][0];
  }

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('neondodge.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('neondodge.' + key, JSON.stringify(value));
      } catch (e) {
        /* storage unavailable: progress just isn't saved */
      }
    },
  };

  // =====================================================================
  // Config
  // =====================================================================
  const CFG = {
    playerR: 9,
    maxSpeed: 560,
    dashSpeed: 1500,
    dashTime: 0.17,
    dashCd: 1.1,
    levelTime: 20,
    nearDist: 22,
    maxHazards: 140,
    maxParticles: 1200,
    maxMult: 10,
    slowFactor: 0.42,
    slowTime: 5.5,
    shieldClear: 170,
  };

  const COLORS = {
    bg: '#05010f',
    player: '#3ff8ff',
    drifter: '#ff2bd6',
    bouncer: '#ff8a1f',
    seeker: '#ff3b5c',
    laser: '#ff2bd6',
    ring: '#b06bff',
    burster: '#ffe94d',
    bullet: '#ffe94d',
    wall: '#ff5ce1',
    shard: '#6dff8a',
    shield: '#3ff8ff',
    slow: '#b06bff',
    nova: '#ffe94d',
  };

  const LEVEL_INTRO = {
    1: 'DODGE EVERYTHING',
    2: 'LASERS + SEEKERS',
    3: 'BOUNCERS + BURSTERS',
    4: 'SHOCK RINGS',
    5: 'WALLS INCOMING',
    6: 'OVERDRIVE',
  };

  const RANKS = [
    [0, 'Spark'],
    [500, 'Glow Runner'],
    [1500, 'Grid Drifter'],
    [3500, 'Neon Phantom'],
    [7000, 'Laser Dancer'],
    [12000, 'Chrome Ghost'],
    [20000, 'Voltage Legend'],
  ];

  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const settings = Object.assign({ sound: true, music: true, shake: !reducedMotion }, store.get('settings', {}));

  // =====================================================================
  // DOM
  // =====================================================================
  const $ = (id) => document.getElementById(id);
  const el = {
    body: document.body,
    hud: $('hud'),
    score: $('score'),
    hudBest: $('hud-best'),
    level: $('level'),
    mult: $('mult'),
    chainFill: $('chain-fill'),
    dashFill: $('dash-fill'),
    dashMeter: $('dash-meter'),
    powerups: $('powerups'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    menu: $('menu'),
    pause: $('pause'),
    over: $('gameover'),
    menuBest: $('menu-best'),
    playBtn: $('play-btn'),
    resumeBtn: $('resume-btn'),
    quitBtn: $('quit-btn'),
    retryBtn: $('retry-btn'),
    menuBtn: $('menu-btn'),
    pauseBtn: $('pause-btn'),
    touchDash: $('touch-dash'),
    overScore: $('over-score'),
    overRank: $('over-rank'),
    overBest: $('over-best'),
    newBest: $('new-best'),
    statTime: $('stat-time'),
    statLevel: $('stat-level'),
    statGrazes: $('stat-grazes'),
    statMult: $('stat-mult'),
    statShards: $('stat-shards'),
  };

  // =====================================================================
  // Canvas
  // =====================================================================
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let DPR = 1;
  let S = 1; // speed scale so small screens aren't brutally fast
  let lowQ = false; // adaptive quality: drops shadow glow if frames are slow
  let slowFrames = 0;

  const player = {
    x: 0, y: 0, vx: 0, vy: 0, r: CFG.playerR,
    dirX: 0, dirY: -1, dashT: 0, dashCd: 0, dvx: 0, dvy: 0,
    invuln: 0, shield: false, trail: [],
  };

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    S = clamp(Math.min(W, H) / 720, 0.7, 1.15);
    player.x = clamp(player.x, player.r, W - player.r);
    player.y = clamp(player.y, player.r, H - player.r);
  }

  function glow(color, blur = 14) {
    if (lowQ) {
      ctx.shadowBlur = 0;
      return;
    }
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }

  function poly(c, n, r, rot = 0) {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  }

  function offscreen(x, y, m) {
    return x < -m || x > W + m || y < -m || y > H + m;
  }

  // =====================================================================
  // Game state
  // =====================================================================
  const game = {
    state: 'menu', // menu | playing | paused | dying | over
    time: 0,
    score: 0,
    level: 1,
    chain: 0,
    chainTimer: 0,
    decayAcc: 0,
    mult: 1,
    maxMult: 1,
    grazes: 0,
    shards: 0,
    slowT: 0,
    shake: 0,
    flash: 0,
    dyingT: 0,
    best: store.get('best', 0),
    hazards: [],
    spawnQ: [],
    pickups: [],
    particles: [],
    waves: [],
    texts: [],
    timers: {},
    shardT: 0,
    powerT: 0,
    ambientT: 0,
    gridOffset: 0,
    overAt: 0,
  };

  const input = {
    keys: new Set(),
    mode: 'mouse', // mouse | keys | touch
    mouse: { x: 0, y: 0 },
    touch: { id: null, x: 0, y: 0, dx: 0, dy: 0, lastTap: 0 },
    dashQueued: false,
  };

  const speedMul = () => (1 + Math.min(1.4, (game.level - 1) * 0.09)) * S;

  function addShake(n) {
    if (settings.shake) game.shake = Math.max(game.shake, n);
  }

  function addHazard(h) {
    game.spawnQ.push(h);
  }

  // =====================================================================
  // Effects: particles, shockwaves, floating text
  // =====================================================================
  function burst(x, y, color, n, speed, life = 0.6, size = 2.5) {
    for (let i = 0; i < n; i++) {
      if (game.particles.length >= CFG.maxParticles) return;
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random() * 0.7);
      const l = life * (0.5 + Math.random() * 0.5);
      game.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: l, max: l, color, size: size * (0.6 + Math.random() * 0.8),
      });
    }
  }

  function wave(x, y, color, maxR, life = 0.5, width = 3) {
    game.waves.push({ x, y, r: 0, maxR, life, max: life, color, width });
  }

  function floatText(x, y, text, color, size = 14, life = 0.9) {
    game.texts.push({ x, y, text, color, size, life, max: life });
  }

  function showBanner(title, sub) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub || '';
    el.banner.classList.remove('show');
    void el.banner.offsetWidth; // restart the CSS animation
    el.banner.classList.add('show');
  }

  // =====================================================================
  // Hazards
  // =====================================================================
  class Drifter {
    constructor(x, y, vx, vy, size, shape, color) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.size = size;
      this.shape = shape;
      this.color = color;
      this.rot = rand(0, TAU);
      this.spin = shape === 'dot' ? 0 : rand(-3, 3);
      this.age = 0;
      this.entered = !offscreen(x, y, 0);
      this.dead = false;
      this.grazed = false;
      this.clearable = true;
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += this.spin * dt;
      this.age += dt;
      const out = offscreen(this.x, this.y, this.size + 10);
      if (!out) this.entered = true;
      if ((this.entered && out) || this.age > 25) this.dead = true;
    }

    gap(p) {
      return hyp(p.x - this.x, p.y - this.y) - this.size * (this.shape === 'dot' ? 1 : 0.82) - p.r;
    }

    draw(c) {
      c.save();
      c.translate(this.x, this.y);
      c.rotate(this.rot);
      const s = this.size;
      if (this.shape === 'dot') {
        c.beginPath();
        c.arc(0, 0, s, 0, TAU);
        glow(this.color, 10);
        c.fillStyle = this.color;
        c.fill();
        c.shadowBlur = 0;
        c.beginPath();
        c.arc(0, 0, s * 0.45, 0, TAU);
        c.fillStyle = '#fff';
        c.fill();
      } else {
        if (this.shape === 'tri') poly(c, 3, s * 1.15);
        else if (this.shape === 'hex') poly(c, 6, s);
        else {
          c.beginPath();
          c.rect(-s, -s, s * 2, s * 2);
        }
        glow(this.color, 16);
        c.lineWidth = 2.5;
        c.strokeStyle = this.color;
        c.stroke();
        c.shadowBlur = 0;
        c.globalAlpha = 0.18;
        c.fillStyle = this.color;
        c.fill();
      }
      c.restore();
    }
  }

  class Bouncer extends Drifter {
    constructor(x, y, vx, vy) {
      super(x, y, vx, vy, 13, 'hex', COLORS.bouncer);
      this.bounces = 3;
    }

    update(dt) {
      super.update(dt);
      if (!this.entered || this.bounces <= 0) return;
      const s = this.size;
      let hit = false;
      if (this.x < s && this.vx < 0) { this.vx = -this.vx; hit = true; }
      if (this.x > W - s && this.vx > 0) { this.vx = -this.vx; hit = true; }
      if (this.y < s && this.vy < 0) { this.vy = -this.vy; hit = true; }
      if (this.y > H - s && this.vy > 0) { this.vy = -this.vy; hit = true; }
      if (hit) {
        this.bounces--;
        burst(this.x, this.y, this.color, 8, 160, 0.35);
        if (game.state === 'playing') Sound.sfx.bounce();
      }
    }

    draw(c) {
      super.draw(c);
      // Remaining bounces shown as pips in the centre.
      c.save();
      c.translate(this.x, this.y);
      c.fillStyle = this.color;
      for (let i = 0; i < this.bounces; i++) {
        const a = this.rot + (i / 3) * TAU;
        c.beginPath();
        c.arc(Math.cos(a) * 5, Math.sin(a) * 5, 1.8, 0, TAU);
        c.fill();
      }
      c.restore();
    }
  }

  class Seeker {
    constructor(x, y, speed) {
      this.x = x;
      this.y = y;
      this.a = Math.atan2(player.y - y, player.x - x);
      this.speed = speed;
      this.maxSpeed = speed * 1.6;
      this.turn = 2.1;
      this.life = rand(5.5, 7);
      this.age = 0;
      this.color = COLORS.seeker;
      this.dead = false;
      this.grazed = false;
      this.clearable = true;
    }

    update(dt) {
      this.age += dt;
      if (this.age < this.life) {
        const desired = Math.atan2(player.y - this.y, player.x - this.x);
        this.a += clamp(angDiff(this.a, desired), -this.turn * dt, this.turn * dt);
        this.speed = Math.min(this.maxSpeed, this.speed + 22 * dt);
      } else {
        this.dead = true;
        burst(this.x, this.y, this.color, 16, 140, 0.5);
        return;
      }
      this.x += Math.cos(this.a) * this.speed * dt;
      this.y += Math.sin(this.a) * this.speed * dt;
      if (Math.random() < 0.6) {
        game.particles.push({
          x: this.x - Math.cos(this.a) * 9, y: this.y - Math.sin(this.a) * 9,
          vx: rand(-20, 20), vy: rand(-20, 20), life: 0.35, max: 0.35, color: this.color, size: 2,
        });
      }
    }

    gap(p) {
      return hyp(p.x - this.x, p.y - this.y) - 8 - p.r;
    }

    draw(c) {
      const fading = this.life - this.age < 1;
      c.save();
      c.translate(this.x, this.y);
      c.rotate(this.a);
      if (fading && Math.floor(this.age * 16) % 2) c.globalAlpha = 0.4;
      c.beginPath();
      c.moveTo(13, 0);
      c.lineTo(-8, 8);
      c.lineTo(-4, 0);
      c.lineTo(-8, -8);
      c.closePath();
      glow(this.color, 16);
      c.lineWidth = 2.5;
      c.strokeStyle = this.color;
      c.stroke();
      c.shadowBlur = 0;
      c.globalAlpha *= 0.3;
      c.fillStyle = this.color;
      c.fill();
      c.restore();
    }
  }

  class Laser {
    constructor(cx, cy, ang, warn) {
      this.cx = cx;
      this.cy = cy;
      this.ang = ang;
      this.warn = warn;
      this.fire = 0.34;
      this.fade = 0.25;
      this.t = 0;
      this.width = 16;
      const L = hyp(W, H) + 100;
      this.ax = cx - Math.cos(ang) * L;
      this.ay = cy - Math.sin(ang) * L;
      this.bx = cx + Math.cos(ang) * L;
      this.by = cy + Math.sin(ang) * L;
      this.fired = false;
      this.color = COLORS.laser;
      this.dead = false;
      this.grazed = false;
      this.clearable = false;
      if (game.state === 'playing') Sound.sfx.laserCharge(warn);
    }

    update(dt) {
      this.t += dt;
      if (!this.fired && this.t >= this.warn) {
        this.fired = true;
        if (game.state === 'playing') {
          Sound.sfx.laserFire();
          addShake(5);
        }
        for (let i = 0; i < 24; i++) {
          const k = Math.random();
          const x = this.ax + (this.bx - this.ax) * k;
          const y = this.ay + (this.by - this.ay) * k;
          if (!offscreen(x, y, 0)) burst(x, y, this.color, 2, 220, 0.4);
        }
      }
      if (this.t > this.warn + this.fire + this.fade) this.dead = true;
    }

    gap(p) {
      if (this.t < this.warn || this.t > this.warn + this.fire) return Infinity;
      return segDist(p.x, p.y, this.ax, this.ay, this.bx, this.by) - this.width / 2 - p.r;
    }

    draw(c) {
      c.save();
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(this.ax, this.ay);
      c.lineTo(this.bx, this.by);
      if (this.t < this.warn) {
        const k = this.t / this.warn;
        // Faint danger band showing the exact width that will be hit.
        c.globalAlpha = 0.05 + 0.1 * k;
        c.strokeStyle = this.color;
        c.lineWidth = this.width;
        c.stroke();
        c.globalAlpha = (0.3 + 0.6 * k) * (0.65 + 0.35 * Math.sin(this.t * 40));
        c.setLineDash([14, 10]);
        c.lineDashOffset = -this.t * 120;
        c.lineWidth = 1.5 + k * 1.5;
        c.stroke();
      } else {
        const ft = this.t - this.warn;
        const k = ft < this.fire ? 1 : 1 - (ft - this.fire) / this.fade;
        glow(this.color, 30);
        c.strokeStyle = this.color;
        c.lineWidth = this.width * (0.6 + 0.4 * k) * (ft < 0.05 ? 1.6 : 1);
        c.globalAlpha = k;
        c.stroke();
        c.shadowBlur = 0;
        c.strokeStyle = '#fff';
        c.lineWidth = this.width * 0.35 * k;
        c.stroke();
      }
      c.restore();
    }
  }

  class Ring {
    constructor(cx, cy, speed) {
      this.cx = cx;
      this.cy = cy;
      this.speed = speed;
      this.r = 0;
      this.warn = 0.9;
      this.t = 0;
      this.thick = 9;
      this.gapA = rand(0, TAU);
      this.gapSpin = rand(-0.5, 0.5);
      this.maxR = Math.max(hyp(cx, cy), hyp(W - cx, cy), hyp(cx, H - cy), hyp(W - cx, H - cy)) + 30;
      this.started = false;
      this.color = COLORS.ring;
      this.dead = false;
      this.grazed = false;
      this.clearable = false;
    }

    halfGap() {
      return clamp(56 / Math.max(this.r, 1), 0.2, 1.4);
    }

    update(dt) {
      this.t += dt;
      this.gapA += this.gapSpin * dt;
      if (this.t > this.warn) {
        if (!this.started) {
          this.started = true;
          if (game.state === 'playing') Sound.sfx.ring();
        }
        this.r += this.speed * dt;
        if (this.r > this.maxR) this.dead = true;
      }
    }

    gap(p) {
      if (this.t < this.warn) return Infinity;
      const dx = p.x - this.cx;
      const dy = p.y - this.cy;
      const hg = this.halfGap();
      if (Math.abs(angDiff(this.gapA, Math.atan2(dy, dx))) < hg) {
        // Inside the opening: only the two tips of the arc can touch you.
        const a1 = this.gapA - hg;
        const a2 = this.gapA + hg;
        const d1 = hyp(p.x - (this.cx + Math.cos(a1) * this.r), p.y - (this.cy + Math.sin(a1) * this.r));
        const d2 = hyp(p.x - (this.cx + Math.cos(a2) * this.r), p.y - (this.cy + Math.sin(a2) * this.r));
        return Math.min(d1, d2) - this.thick / 2 - p.r;
      }
      return Math.abs(hyp(dx, dy) - this.r) - this.thick / 2 - p.r;
    }

    draw(c) {
      c.save();
      c.strokeStyle = this.color;
      if (this.t < this.warn) {
        const k = this.t / this.warn;
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 30);
        c.globalAlpha = 0.4 + 0.5 * pulse;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(this.cx, this.cy, 6 + k * 14, 0, TAU);
        c.stroke();
        // Preview of where the opening will be.
        c.lineWidth = 3;
        c.beginPath();
        c.arc(this.cx, this.cy, 30, this.gapA + 0.5, this.gapA - 0.5 + TAU);
        c.globalAlpha = 0.25 + 0.4 * k;
        c.stroke();
        c.fillStyle = this.color;
        c.beginPath();
        c.arc(this.cx + Math.cos(this.gapA) * 30, this.cy + Math.sin(this.gapA) * 30, 3, 0, TAU);
        c.fill();
      } else {
        const hg = this.halfGap();
        c.globalAlpha = clamp(1.2 - this.r / this.maxR, 0.35, 1);
        glow(this.color, 18);
        c.lineWidth = this.thick;
        c.lineCap = 'round';
        c.beginPath();
        c.arc(this.cx, this.cy, this.r, this.gapA + hg, this.gapA - hg + TAU);
        c.stroke();
        c.shadowBlur = 0;
        c.strokeStyle = '#fff';
        c.lineWidth = 2;
        c.stroke();
      }
      c.restore();
    }
  }

  class Burster {
    constructor(x, y, vx, vy) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.r = 17;
      this.fuse = rand(1.6, 2.4);
      this.fuseMax = this.fuse;
      this.entered = false;
      this.t = 0;
      this.color = COLORS.burster;
      this.dead = false;
      this.grazed = false;
      this.clearable = true;
    }

    update(dt) {
      this.t += dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (!this.entered && !offscreen(this.x, this.y, -(this.r + 30))) this.entered = true;
      if (this.entered) {
        this.fuse -= dt;
        if (this.fuse <= 0) this.explode();
      } else if (this.t > 10) {
        this.dead = true;
      }
    }

    explode() {
      this.dead = true;
      const n = 8 + Math.min(10, game.level);
      const off = rand(0, TAU);
      const sp = 165 * speedMul();
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * TAU;
        addHazard(new Drifter(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 5, 'dot', COLORS.bullet));
      }
      burst(this.x, this.y, this.color, 30, 260, 0.5);
      wave(this.x, this.y, this.color, 60, 0.3, 3);
      if (game.state === 'playing') {
        Sound.sfx.burst();
        addShake(4);
      }
    }

    gap(p) {
      return hyp(p.x - this.x, p.y - this.y) - this.r - p.r;
    }

    draw(c) {
      const k = this.entered ? 1 - this.fuse / this.fuseMax : 0;
      const blink = this.entered && Math.sin(this.t * (8 + k * 40)) > 0;
      c.save();
      c.translate(this.x, this.y);
      glow(this.color, 18);
      c.lineWidth = 2.5;
      c.strokeStyle = this.color;
      c.beginPath();
      c.arc(0, 0, this.r, 0, TAU);
      c.stroke();
      c.shadowBlur = 0;
      c.fillStyle = blink ? '#fff' : this.color;
      c.globalAlpha = blink ? 0.9 : 0.35;
      c.beginPath();
      c.arc(0, 0, this.r * (0.35 + 0.3 * k), 0, TAU);
      c.fill();
      // Fuse arc counting down.
      c.globalAlpha = 0.9;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, this.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k));
      c.stroke();
      c.restore();
    }
  }

  // =====================================================================
  // Spawning
  // =====================================================================
  function edgePoint(margin) {
    switch (randInt(0, 3)) {
      case 0: return { x: rand(0, W), y: -margin };
      case 1: return { x: W + margin, y: rand(0, H) };
      case 2: return { x: rand(0, W), y: H + margin };
      default: return { x: -margin, y: rand(0, H) };
    }
  }

  function aimFrom(pt, spread) {
    const tx = rand(W * 0.2, W * 0.8);
    const ty = rand(H * 0.2, H * 0.8);
    return Math.atan2(ty - pt.y, tx - pt.x) + rand(-spread, spread);
  }

  function spawnDrifter(ambient) {
    const size = rand(8, 17);
    const pt = edgePoint(size + 20);
    const a = aimFrom(pt, 0.25);
    const sp = (ambient ? rand(50, 110) * S : rand(150, 230) * speedMul());
    const shape = Math.random() < 0.7 ? 'square' : 'tri';
    addHazard(new Drifter(pt.x, pt.y, Math.cos(a) * sp, Math.sin(a) * sp, size, shape, COLORS.drifter));
  }

  function spawnBouncer() {
    const pt = edgePoint(30);
    const a = aimFrom(pt, 0.4);
    const sp = rand(170, 220) * speedMul();
    addHazard(new Bouncer(pt.x, pt.y, Math.cos(a) * sp, Math.sin(a) * sp));
  }

  function spawnSeeker() {
    const pt = edgePoint(20);
    addHazard(new Seeker(pt.x, pt.y, 120 * speedMul()));
  }

  function spawnBurster() {
    const pt = edgePoint(30);
    const a = aimFrom(pt, 0.15);
    const sp = rand(60, 85) * S;
    addHazard(new Burster(pt.x, pt.y, Math.cos(a) * sp, Math.sin(a) * sp));
  }

  function spawnLaser() {
    const warn = Math.max(0.7, 1.2 - game.level * 0.04);
    const cx = clamp(player.x + rand(-90, 90), 20, W - 20);
    const cy = clamp(player.y + rand(-90, 90), 20, H - 20);
    let ang;
    const r = Math.random();
    if (game.level < 4 || r < 0.35) ang = 0;
    else if (r < 0.7) ang = Math.PI / 2;
    else ang = rand(0, Math.PI);
    if (game.level < 4 && Math.random() < 0.5) ang = Math.PI / 2;
    addHazard(new Laser(cx, cy, ang, warn));
    // From level 7, lasers sometimes arrive as a crossing pair.
    if (game.level >= 7 && Math.random() < 0.35) {
      addHazard(new Laser(cx + rand(-60, 60), cy + rand(-60, 60), ang + Math.PI / 2, warn + 0.25));
    }
  }

  function spawnRing() {
    // Pick a centre that isn't right on top of the player.
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < 12; i++) {
      cx = rand(W * 0.1, W * 0.9);
      cy = rand(H * 0.1, H * 0.9);
      if (hyp(cx - player.x, cy - player.y) > 180 * S) break;
    }
    addHazard(new Ring(cx, cy, (170 + game.level * 8) * S));
  }

  function spawnWall() {
    const spacing = 30;
    const gapHalf = 72 * Math.max(S, 0.9);
    const sp = 140 * speedMul();
    const fromStart = Math.random() < 0.5;
    if (Math.random() < 0.5) {
      // Vertical column sweeping horizontally.
      const gapC = rand(gapHalf + 20, H - gapHalf - 20);
      const x = fromStart ? -20 : W + 20;
      for (let y = spacing / 2; y < H; y += spacing) {
        if (Math.abs(y - gapC) < gapHalf) continue;
        addHazard(new Drifter(x, y, fromStart ? sp : -sp, 0, 6, 'dot', COLORS.wall));
      }
    } else {
      const gapC = rand(gapHalf + 20, W - gapHalf - 20);
      const y = fromStart ? -20 : H + 20;
      for (let x = spacing / 2; x < W; x += spacing) {
        if (Math.abs(x - gapC) < gapHalf) continue;
        addHazard(new Drifter(x, y, 0, fromStart ? sp : -sp, 6, 'dot', COLORS.wall));
      }
    }
  }

  const SPAWNS = [
    { key: 'drifter', unlock: 1, base: 0.85, fn: () => spawnDrifter(false) },
    { key: 'seeker', unlock: 2, base: 7.5, fn: spawnSeeker },
    { key: 'laser', unlock: 2, base: 5.5, fn: spawnLaser },
    { key: 'bouncer', unlock: 3, base: 6.5, fn: spawnBouncer },
    { key: 'burster', unlock: 3, base: 8.5, fn: spawnBurster },
    { key: 'ring', unlock: 4, base: 10, fn: spawnRing },
    { key: 'wall', unlock: 5, base: 14, fn: spawnWall },
  ];

  function updateDirector(dt) {
    const newLevel = 1 + Math.floor(game.time / CFG.levelTime);
    if (newLevel > game.level) {
      game.level = newLevel;
      for (const s of SPAWNS) if (s.unlock === newLevel) game.timers[s.key] = 1.2;
      showBanner('LEVEL ' + newLevel, LEVEL_INTRO[newLevel] || 'FASTER');
      Sound.sfx.levelUp();
      Sound.setIntensity(Math.min(4, newLevel));
      wave(player.x, player.y, COLORS.player, Math.max(W, H), 0.9, 2);
    }
    for (const s of SPAWNS) {
      if (game.level < s.unlock) continue;
      game.timers[s.key] -= dt;
      if (game.timers[s.key] <= 0) {
        if (game.hazards.length < CFG.maxHazards) s.fn();
        const ramp = 1 + 0.14 * (game.level - s.unlock);
        game.timers[s.key] = (s.base / ramp) * rand(0.75, 1.25);
      }
    }
  }

  // =====================================================================
  // Pickups
  // =====================================================================
  class Pickup {
    constructor(type, x, y) {
      this.type = type;
      this.x = x;
      this.y = y;
      this.r = type === 'shard' ? 7 : 12;
      this.life = type === 'shard' ? 7 : 9;
      this.age = 0;
      this.color = COLORS[type];
      this.dead = false;
    }

    update(dt) {
      this.age += dt;
      if (this.age > this.life) this.dead = true;
    }

    draw(c) {
      const remaining = this.life - this.age;
      if (remaining < 2 && Math.floor(this.age * 10) % 2) return;
      const intro = Math.min(1, this.age * 4);
      const bob = Math.sin(this.age * 4) * 2;
      c.save();
      c.translate(this.x, this.y + bob);
      c.scale(intro, intro);
      c.strokeStyle = this.color;
      c.fillStyle = this.color;
      glow(this.color, 14);
      c.lineWidth = 2;
      if (this.type === 'shard') {
        c.rotate(this.age * 2);
        poly(c, 4, this.r);
        c.stroke();
        c.globalAlpha = 0.4;
        c.fill();
      } else {
        // Rotating dashed halo shared by all power-ups.
        c.save();
        c.rotate(this.age * 1.5);
        c.setLineDash([6, 5]);
        c.beginPath();
        c.arc(0, 0, this.r + 5, 0, TAU);
        c.stroke();
        c.restore();
        c.beginPath();
        c.arc(0, 0, this.r, 0, TAU);
        c.globalAlpha = 0.15;
        c.fill();
        c.globalAlpha = 1;
        c.stroke();
        c.shadowBlur = 0;
        c.lineWidth = 2;
        c.beginPath();
        if (this.type === 'shield') {
          c.moveTo(0, -6);
          c.lineTo(5.5, -3.5);
          c.lineTo(4.5, 2.5);
          c.lineTo(0, 6.5);
          c.lineTo(-4.5, 2.5);
          c.lineTo(-5.5, -3.5);
          c.closePath();
          c.stroke();
        } else if (this.type === 'slow') {
          c.moveTo(-5, -6);
          c.lineTo(5, -6);
          c.lineTo(-5, 6);
          c.lineTo(5, 6);
          c.closePath();
          c.stroke();
        } else if (this.type === 'nova') {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            const r1 = i % 2 ? 2.5 : 3;
            const r2 = i % 2 ? 5 : 7.5;
            c.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
            c.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
          }
          c.stroke();
        }
      }
      c.restore();
    }
  }

  function spawnPickup(type) {
    let x = W / 2;
    let y = H / 2;
    const m = 60;
    for (let i = 0; i < 15; i++) {
      x = rand(m, Math.max(m + 1, W - m));
      y = rand(m + 30, Math.max(m + 31, H - m));
      if (hyp(x - player.x, y - player.y) > 140 * S) break;
    }
    game.pickups.push(new Pickup(type, x, y));
  }

  function collect(pu) {
    pu.dead = true;
    const p = player;
    burst(pu.x, pu.y, pu.color, pu.type === 'shard' ? 12 : 30, 200, 0.5);
    switch (pu.type) {
      case 'shard': {
        const pts = 50 * game.mult;
        game.score += pts;
        game.shards++;
        floatText(pu.x, pu.y - 14, '+' + pts, COLORS.shard, 13);
        Sound.sfx.shard();
        break;
      }
      case 'shield':
        p.shield = true;
        floatText(pu.x, pu.y - 18, 'SHIELD', COLORS.shield, 16);
        wave(p.x, p.y, COLORS.shield, 60, 0.4);
        Sound.sfx.power();
        break;
      case 'slow':
        game.slowT = CFG.slowTime;
        floatText(pu.x, pu.y - 18, 'SLOW-MO', COLORS.slow, 16);
        wave(p.x, p.y, COLORS.slow, Math.max(W, H), 1.0, 4);
        Sound.sfx.slow();
        Sound.setSlow(true);
        break;
      case 'nova':
        nova();
        break;
      default:
        break;
    }
  }

  function explodeHazard(h) {
    h.dead = true;
    if (h instanceof Laser) {
      for (let i = 0; i < 10; i++) {
        const k = Math.random();
        burst(h.ax + (h.bx - h.ax) * k, h.ay + (h.by - h.ay) * k, h.color, 2, 150, 0.4);
      }
    } else if (h instanceof Ring) {
      burst(h.cx, h.cy, h.color, 14, 200, 0.5);
    } else {
      burst(h.x, h.y, h.color, 14, 220, 0.55);
    }
  }

  function nova() {
    let count = 0;
    for (const h of game.hazards) {
      if (h.dead) continue;
      explodeHazard(h);
      count++;
    }
    const pts = count * 20 * game.mult;
    game.score += pts;
    wave(player.x, player.y, COLORS.nova, Math.max(W, H) * 1.2, 0.8, 6);
    game.flash = 0.6;
    addShake(12);
    floatText(player.x, player.y - 26, 'NOVA +' + pts, COLORS.nova, 18, 1.2);
    Sound.sfx.nova();
  }

  // =====================================================================
  // Player
  // =====================================================================
  function heldDir() {
    const k = input.keys;
    const kx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const ky = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
    return [kx, ky];
  }

  function tryDash() {
    const p = player;
    if (p.dashCd > 0 || p.dashT > 0) return;
    let dx = p.dirX;
    let dy = p.dirY;
    const speed = CFG.dashSpeed * S;
    let dur = CFG.dashTime;
    if (input.mode === 'mouse') {
      const mx = input.mouse.x - p.x;
      const my = input.mouse.y - p.y;
      const d = hyp(mx, my);
      if (d > 24) {
        dx = mx / d;
        dy = my / d;
        dur = Math.min(dur, d / speed);
      }
    } else if (input.mode === 'keys') {
      const [kx, ky] = heldDir();
      if (kx || ky) {
        const l = hyp(kx, ky);
        dx = kx / l;
        dy = ky / l;
      }
    }
    p.dvx = dx * speed;
    p.dvy = dy * speed;
    p.dashT = dur;
    p.dashCd = CFG.dashCd;
    p.invuln = Math.max(p.invuln, Math.max(dur, 0.12) + 0.06);
    wave(p.x, p.y, COLORS.player, 40, 0.3, 2);
    burst(p.x, p.y, COLORS.player, 10, 120, 0.3);
    Sound.sfx.dash();
  }

  function updatePlayer(dt) {
    const p = player;
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (input.dashQueued) {
      input.dashQueued = false;
      tryDash();
    }
    const ox = p.x;
    const oy = p.y;
    const MAX = CFG.maxSpeed * S;

    if (p.dashT > 0) {
      const st = Math.min(dt, p.dashT);
      p.dashT -= dt;
      p.x += p.dvx * st;
      p.y += p.dvy * st;
      game.particles.push({
        x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, color: COLORS.player, size: p.r * 0.9,
      });
    } else {
      const [kx, ky] = heldDir();
      if (kx || ky) {
        input.mode = 'keys';
        const l = hyp(kx, ky);
        const tvx = (kx / l) * MAX;
        const tvy = (ky / l) * MAX;
        const k = Math.min(1, dt * 16);
        p.vx += (tvx - p.vx) * k;
        p.vy += (tvy - p.vy) * k;
      } else if (input.mode === 'mouse') {
        let tvx = (input.mouse.x - p.x) * 12;
        let tvy = (input.mouse.y - p.y) * 12;
        const s = hyp(tvx, tvy);
        if (s > MAX) {
          tvx *= MAX / s;
          tvy *= MAX / s;
        }
        const k = Math.min(1, dt * 20);
        p.vx += (tvx - p.vx) * k;
        p.vy += (tvy - p.vy) * k;
      } else {
        const f = Math.exp(-dt * 12);
        p.vx *= f;
        p.vy *= f;
      }
      if (input.mode !== 'touch') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    if (input.mode === 'touch') {
      p.x += input.touch.dx;
      p.y += input.touch.dy;
      input.touch.dx = 0;
      input.touch.dy = 0;
    }

    p.x = clamp(p.x, p.r, W - p.r);
    p.y = clamp(p.y, p.r, H - p.r);

    const mvx = (p.x - ox) / dt;
    const mvy = (p.y - oy) / dt;
    const sp = hyp(mvx, mvy);
    if (sp > 40 && p.dashT <= 0) {
      p.dirX = mvx / sp;
      p.dirY = mvy / sp;
    }
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 18) p.trail.shift();
  }

  // =====================================================================
  // Scoring
  // =====================================================================
  function recomputeMult() {
    const m = Math.min(CFG.maxMult, 1 + Math.floor(game.chain / 3));
    if (m > game.mult) {
      floatText(player.x, player.y - 34, 'x' + m + '!', '#fff', 20, 1.0);
      Sound.sfx.multUp();
    }
    game.mult = m;
    game.maxMult = Math.max(game.maxMult, m);
  }

  function graze(h) {
    game.chain++;
    game.chainTimer = 0;
    game.decayAcc = 0;
    game.grazes++;
    recomputeMult();
    const pts = 25 * game.mult;
    game.score += pts;
    const hx = h.x !== undefined ? h.x : player.x;
    const hy = h.y !== undefined ? h.y : player.y;
    const mx = (player.x + hx) / 2;
    const my = (player.y + hy) / 2;
    burst(mx, my, '#fff', 6, 140, 0.3, 2);
    floatText(player.x + rand(-10, 10), player.y - 18, '+' + pts, '#ffffffcc', 12, 0.7);
    Sound.sfx.graze(game.chain);
  }

  function breakShield() {
    const p = player;
    p.shield = false;
    p.invuln = 1.2;
    const R = CFG.shieldClear * S;
    for (const h of game.hazards) {
      if (h.dead || !h.clearable) continue;
      if (hyp(h.x - p.x, h.y - p.y) < R) explodeHazard(h);
    }
    wave(p.x, p.y, COLORS.shield, R, 0.45, 5);
    burst(p.x, p.y, COLORS.shield, 30, 260, 0.6);
    addShake(10);
    game.flash = 0.3;
    floatText(p.x, p.y - 24, 'SHIELD BROKEN', COLORS.shield, 14);
    Sound.sfx.shieldBreak();
  }

  function die() {
    const p = player;
    game.state = 'dying';
    game.dyingT = 0;
    burst(p.x, p.y, COLORS.player, 90, 420, 1.1, 3);
    burst(p.x, p.y, '#ffffff', 40, 300, 0.8, 2);
    burst(p.x, p.y, COLORS.drifter, 40, 360, 1.0, 3);
    wave(p.x, p.y, COLORS.player, 260, 0.7, 6);
    wave(p.x, p.y, COLORS.drifter, 160, 0.5, 3);
    for (const pu of game.pickups) burst(pu.x, pu.y, pu.color, 8, 120, 0.4);
    game.pickups = [];
    addShake(22);
    game.flash = 0.8;
    Sound.sfx.death();
    Sound.setSlow(false);
    Sound.setIntensity(1);
  }

  function checkCollisions() {
    const p = player;
    for (const h of game.hazards) {
      if (h.dead) continue;
      const g = h.gap(p);
      if (g === Infinity) continue;
      if (g < 0) {
        if (p.invuln > 0) continue;
        if (p.shield) {
          breakShield();
          continue;
        }
        die();
        return;
      }
      if (g < CFG.nearDist && !h.grazed && p.invuln <= 0) {
        h.grazed = true;
        graze(h);
      }
    }
    for (const pu of game.pickups) {
      if (!pu.dead && hyp(pu.x - p.x, pu.y - p.y) < pu.r + p.r + 6) collect(pu);
    }
  }

  // =====================================================================
  // Flow
  // =====================================================================
  function resetRun() {
    game.time = 0;
    game.score = 0;
    game.level = 1;
    game.chain = 0;
    game.chainTimer = 0;
    game.decayAcc = 0;
    game.mult = 1;
    game.maxMult = 1;
    game.grazes = 0;
    game.shards = 0;
    game.slowT = 0;
    game.flash = 0;
    game.hazards = [];
    game.spawnQ = [];
    game.pickups = [];
    game.texts = [];
    game.waves = [];
    game.shardT = 1.5;
    game.powerT = 8;
    for (const s of SPAWNS) game.timers[s.key] = s.unlock === 1 ? 0.6 : s.base * 0.5;
    const p = player;
    p.x = W / 2;
    p.y = H / 2;
    p.vx = 0;
    p.vy = 0;
    p.dashT = 0;
    p.dashCd = 0;
    p.invuln = 1.0; // brief spawn protection
    p.shield = false;
    p.trail = [];
    input.dashQueued = false;
    input.touch.dx = 0;
    input.touch.dy = 0;
  }

  function startGame() {
    Sound.ensure();
    Sound.sfx.start();
    Sound.setIntensity(1);
    Sound.setSlow(false);
    Sound.setPaused(false);
    resetRun();
    game.state = 'playing';
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    el.menu.classList.add('hidden');
    el.over.classList.add('hidden');
    el.pause.classList.add('hidden');
    el.hud.classList.remove('hidden');
    el.body.classList.add('playing');
    showBanner('LEVEL 1', LEVEL_INTRO[1]);
    updateHud(true);
  }

  function pauseGame() {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    el.pause.classList.remove('hidden');
    el.body.classList.remove('playing');
    Sound.setPaused(true);
  }

  function resumeGame() {
    if (game.state !== 'paused') return;
    game.state = 'playing';
    el.pause.classList.add('hidden');
    el.body.classList.add('playing');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    Sound.ensure();
    Sound.setPaused(false);
    input.keys.clear();
  }

  function toMenu() {
    game.state = 'menu';
    el.pause.classList.add('hidden');
    el.over.classList.add('hidden');
    el.hud.classList.add('hidden');
    el.menu.classList.remove('hidden');
    el.body.classList.remove('playing');
    el.menuBest.textContent = Math.floor(game.best).toLocaleString();
    Sound.setPaused(false);
    Sound.setSlow(false);
    Sound.setIntensity(1);
    el.playBtn.focus({ preventScroll: true });
  }

  function gameOver() {
    game.state = 'over';
    game.overAt = performance.now();
    const score = Math.floor(game.score);
    const isBest = score > game.best;
    if (isBest) {
      game.best = score;
      store.set('best', score);
    }
    let rank = RANKS[0][1];
    for (const [min, name] of RANKS) if (score >= min) rank = name;
    el.overScore.textContent = score.toLocaleString();
    el.overRank.textContent = rank;
    el.overBest.textContent = Math.floor(game.best).toLocaleString();
    el.newBest.classList.toggle('hidden', !isBest);
    const t = game.time;
    el.statTime.textContent = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    el.statLevel.textContent = game.level;
    el.statGrazes.textContent = game.grazes;
    el.statMult.textContent = 'x' + game.maxMult;
    el.statShards.textContent = game.shards;
    el.hud.classList.add('hidden');
    el.body.classList.remove('playing');
    el.over.classList.remove('hidden');
    el.retryBtn.focus({ preventScroll: true });
  }

  // =====================================================================
  // HUD
  // =====================================================================
  const hudCache = {};
  function setText(node, key, value) {
    if (hudCache[key] !== value) {
      hudCache[key] = value;
      node.textContent = value;
    }
  }

  function updateHud(force) {
    if (force) for (const k of Object.keys(hudCache)) delete hudCache[k];
    setText(el.score, 'score', Math.floor(game.score).toLocaleString());
    setText(el.hudBest, 'best', Math.floor(Math.max(game.best, game.score)).toLocaleString());
    setText(el.level, 'level', 'LEVEL ' + game.level);
    setText(el.mult, 'mult', 'x' + game.mult);
    const chainPct = game.mult >= CFG.maxMult ? 100 : Math.round(((game.chain % 3) / 3) * 100);
    if (hudCache.chain !== chainPct) {
      hudCache.chain = chainPct;
      el.chainFill.style.width = chainPct + '%';
    }
    const dashPct = Math.round((1 - player.dashCd / CFG.dashCd) * 100);
    if (hudCache.dash !== dashPct) {
      hudCache.dash = dashPct;
      el.dashFill.style.width = dashPct + '%';
      el.dashMeter.classList.toggle('ready', dashPct >= 100);
    }
    let pu = '';
    if (player.shield) pu += '<span class="pill shield">SHIELD</span>';
    if (game.slowT > 0) pu += '<span class="pill slow">SLOW ' + game.slowT.toFixed(1) + 's</span>';
    if (hudCache.pu !== pu) {
      hudCache.pu = pu;
      el.powerups.innerHTML = pu;
    }
  }

  // =====================================================================
  // Update
  // =====================================================================
  function updateEffects(dt) {
    const ps = game.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      const drag = Math.exp(-3 * dt);
      q.vx *= drag;
      q.vy *= drag;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    for (const w of game.waves) {
      w.life -= dt;
      w.r = w.maxR * (1 - Math.pow(w.life / w.max, 2));
    }
    game.waves = game.waves.filter((w) => w.life > 0);
    for (const t of game.texts) {
      t.life -= dt;
      t.y -= 28 * dt;
    }
    game.texts = game.texts.filter((t) => t.life > 0);
    game.shake *= Math.exp(-dt * 9);
    if (game.shake < 0.2) game.shake = 0;
    game.flash = Math.max(0, game.flash - dt * 2.2);
  }

  function updateHazards(dt) {
    for (const h of game.hazards) if (!h.dead) h.update(dt);
    if (game.spawnQ.length) {
      for (const h of game.spawnQ) game.hazards.push(h);
      game.spawnQ.length = 0;
    }
    game.hazards = game.hazards.filter((h) => !h.dead);
  }

  function update(dt) {
    const st = game.state;
    if (st === 'paused') return;

    if (st === 'playing') {
      game.time += dt;
      if (game.slowT > 0) {
        game.slowT -= dt;
        if (game.slowT <= 0) {
          game.slowT = 0;
          Sound.setSlow(false);
        }
      }
      const hdt = game.slowT > 0 ? dt * CFG.slowFactor : dt;
      updatePlayer(dt);
      updateDirector(hdt);
      updateHazards(hdt);

      for (const pu of game.pickups) pu.update(dt);
      game.pickups = game.pickups.filter((pu) => !pu.dead);
      game.shardT -= dt;
      if (game.shardT <= 0) {
        game.shardT = rand(1.8, 2.8);
        if (game.pickups.filter((pu) => pu.type === 'shard').length < 4) spawnPickup('shard');
      }
      game.powerT -= dt;
      if (game.powerT <= 0) {
        game.powerT = rand(9, 13);
        spawnPickup(weighted([['shield', player.shield ? 1 : 3], ['slow', 3], ['nova', 2]]));
      }

      checkCollisions();

      if (game.state === 'playing') {
        game.score += 10 * game.mult * dt;
        game.chainTimer += dt;
        if (game.chainTimer > 3 && game.chain > 0) {
          game.decayAcc += dt;
          if (game.decayAcc >= 0.45) {
            game.decayAcc = 0;
            game.chain--;
            game.mult = Math.min(CFG.maxMult, 1 + Math.floor(game.chain / 3));
          }
        }
      }
      updateHud(false);
    } else if (st === 'dying') {
      game.dyingT += dt;
      updateHazards(dt * 0.25);
      if (game.dyingT > 1.3) gameOver();
    } else {
      // Menu / game over: ambient hazards drift by in the background.
      updateHazards(dt);
      game.ambientT -= dt;
      if (game.ambientT <= 0) {
        game.ambientT = rand(0.35, 0.7);
        if (game.hazards.length < 40) spawnDrifter(true);
      }
    }

    updateEffects(st === 'dying' ? dt * 0.6 : dt);
  }

  // =====================================================================
  // Render
  // =====================================================================
  function drawBackground(dt) {
    const c = ctx;
    c.fillStyle = COLORS.bg;
    c.fillRect(0, 0, W, H);

    const slow = game.slowT > 0;
    game.gridOffset = (game.gridOffset + dt * (slow ? 8 : 26) * (game.state === 'paused' ? 0 : 1)) % 48;
    const sp = 48;
    c.beginPath();
    for (let x = (W / 2) % sp; x < W; x += sp) {
      c.moveTo(x + 0.5, 0);
      c.lineTo(x + 0.5, H);
    }
    for (let y = game.gridOffset - sp; y < H; y += sp) {
      c.moveTo(0, y + 0.5);
      c.lineTo(W, y + 0.5);
    }
    c.strokeStyle = slow ? 'rgba(176,107,255,0.11)' : 'rgba(120,70,255,0.08)';
    c.lineWidth = 1;
    c.stroke();

    const g = c.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, 'rgba(255,43,214,0)');
    g.addColorStop(1, 'rgba(255,43,214,0.09)');
    c.fillStyle = g;
    c.fillRect(0, H * 0.55, W, H * 0.45);
  }

  function drawPlayer() {
    const c = ctx;
    const p = player;
    if (p.trail.length > 1) {
      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      for (let i = 1; i < p.trail.length; i++) {
        const k = i / p.trail.length;
        c.globalAlpha = k * 0.5;
        c.strokeStyle = COLORS.player;
        c.lineWidth = p.r * 1.3 * k;
        c.beginPath();
        c.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
        c.lineTo(p.trail[i].x, p.trail[i].y);
        c.stroke();
      }
      c.restore();
    }

    const flicker = p.invuln > 0 && p.dashT <= 0 && Math.floor(p.invuln * 20) % 2 === 0;
    c.save();
    c.translate(p.x, p.y);
    c.globalAlpha = flicker ? 0.35 : 1;
    glow(COLORS.player, 22);
    c.fillStyle = COLORS.player;
    c.beginPath();
    c.arc(0, 0, p.r, 0, TAU);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(0, 0, p.r * 0.5, 0, TAU);
    c.fill();

    // Dash-ready ring.
    if (p.dashCd <= 0) {
      c.globalAlpha *= 0.5;
      c.strokeStyle = COLORS.player;
      c.lineWidth = 1;
      c.beginPath();
      c.arc(0, 0, p.r + 5, 0, TAU);
      c.stroke();
      c.globalAlpha = flicker ? 0.35 : 1;
    }

    if (p.shield) {
      const t = performance.now() / 1000;
      glow(COLORS.shield, 12);
      c.strokeStyle = COLORS.shield;
      c.lineWidth = 2;
      c.globalAlpha = 0.7 + 0.3 * Math.sin(t * 6);
      poly(c, 6, p.r + 10, t * 1.2);
      c.stroke();
    }
    c.restore();
  }

  function drawEffects() {
    const c = ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const q of game.particles) {
      c.globalAlpha = q.life / q.max;
      c.fillStyle = q.color;
      const s = q.size;
      c.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    for (const w of game.waves) {
      c.globalAlpha = (w.life / w.max) * 0.8;
      c.strokeStyle = w.color;
      c.lineWidth = w.width;
      c.beginPath();
      c.arc(w.x, w.y, Math.max(0, w.r), 0, TAU);
      c.stroke();
    }
    c.restore();

    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const t of game.texts) {
      c.globalAlpha = Math.min(1, (t.life / t.max) * 2);
      c.font = '700 ' + t.size + 'px Orbitron, "Segoe UI", sans-serif';
      c.fillStyle = t.color;
      c.fillText(t.text, t.x, t.y);
    }
    c.restore();
  }

  function render(dt) {
    const c = ctx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground(dt);

    c.save();
    if (game.shake > 0) {
      c.translate(rand(-game.shake, game.shake), rand(-game.shake, game.shake));
    }

    const ambient = game.state === 'menu' || game.state === 'over';
    if (ambient) c.globalAlpha = 0.5;
    for (const pu of game.pickups) pu.draw(c);
    for (const h of game.hazards) h.draw(c);
    c.globalAlpha = 1;

    if (game.state === 'playing' || game.state === 'paused') drawPlayer();
    drawEffects();
    c.restore();

    if (game.slowT > 0) {
      c.fillStyle = 'rgba(176,107,255,' + (0.06 + 0.04 * Math.min(1, game.slowT)) + ')';
      c.fillRect(0, 0, W, H);
    }
    if (game.flash > 0) {
      c.fillStyle = 'rgba(255,255,255,' + Math.min(0.5, game.flash * 0.5) + ')';
      c.fillRect(0, 0, W, H);
    }
  }

  // =====================================================================
  // Main loop
  // =====================================================================
  let last = performance.now();
  function frame(now) {
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(raw, 1 / 30);
    if (game.state === 'playing' && raw < 0.1) {
      slowFrames = raw > 0.026 ? slowFrames + 1 : Math.max(0, slowFrames - 0.5);
      if (!lowQ && slowFrames > 90) lowQ = true;
    }
    update(dt);
    render(dt);
    requestAnimationFrame(frame);
  }

  // =====================================================================
  // Input
  // =====================================================================
  const MOVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);

  window.addEventListener('keydown', (e) => {
    const code = e.code;
    const onButton = e.target && e.target.tagName === 'BUTTON';

    if (code === 'KeyM' && !e.repeat) {
      setSetting('music', !settings.music);
      return;
    }

    if (game.state === 'playing') {
      if (MOVE_KEYS.has(code)) {
        input.keys.add(code);
        e.preventDefault();
      } else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyJ' || code === 'KeyK') {
        if (!e.repeat) input.dashQueued = true;
        e.preventDefault();
      } else if (code === 'Escape' || code === 'KeyP') {
        pauseGame();
        e.preventDefault();
      }
      return;
    }

    if (game.state === 'paused') {
      if (code === 'Escape' || code === 'KeyP' || ((code === 'Space' || code === 'Enter') && !onButton)) {
        resumeGame();
        e.preventDefault();
      }
      return;
    }

    if ((game.state === 'menu' || game.state === 'over') && (code === 'Space' || code === 'Enter') && !onButton) {
      if (game.state === 'over' && performance.now() - game.overAt < 600) return;
      e.preventDefault();
      startGame();
    } else if (game.state === 'over' && code === 'Escape') {
      toMenu();
    }
  });

  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
  });

  window.addEventListener('mousemove', (e) => {
    input.mouse.x = e.clientX;
    input.mouse.y = e.clientY;
    if (input.mode !== 'mouse' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 2)) input.mode = 'mouse';
  });

  canvas.addEventListener('mousedown', (e) => {
    if (game.state === 'playing' && e.button === 0) {
      input.mode = 'mouse';
      input.dashQueued = true;
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (game.state !== 'playing') return;
    input.mode = 'touch';
    for (const t of e.changedTouches) {
      if (input.touch.id === null) {
        input.touch.id = t.identifier;
        input.touch.x = t.clientX;
        input.touch.y = t.clientY;
        const now = performance.now();
        if (now - input.touch.lastTap < 260) input.dashQueued = true; // double-tap
        input.touch.lastTap = now;
      } else {
        input.dashQueued = true; // second finger
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== input.touch.id) continue;
      const sens = 1.35;
      input.touch.dx += (t.clientX - input.touch.x) * sens;
      input.touch.dy += (t.clientY - input.touch.y) * sens;
      input.touch.x = t.clientX;
      input.touch.y = t.clientY;
    }
  }, { passive: false });

  const endTouch = (e) => {
    for (const t of e.changedTouches) if (t.identifier === input.touch.id) input.touch.id = null;
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  el.touchDash.addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (game.state === 'playing') input.dashQueued = true;
  }, { passive: false });

  window.addEventListener('blur', () => {
    input.keys.clear();
    pauseGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });
  window.addEventListener('resize', resize);

  // Buttons
  const click = (node, fn) => node.addEventListener('click', () => {
    Sound.ensure();
    Sound.sfx.click();
    fn();
  });
  click(el.playBtn, startGame);
  click(el.retryBtn, startGame);
  click(el.resumeBtn, resumeGame);
  click(el.quitBtn, toMenu);
  click(el.menuBtn, toMenu);
  el.pauseBtn.addEventListener('click', () => {
    if (game.state === 'playing') pauseGame();
    else if (game.state === 'paused') resumeGame();
  });

  // Settings toggles (there are copies in the menu and pause screens).
  function setSetting(key, value) {
    settings[key] = value;
    store.set('settings', settings);
    applySettings();
  }

  function applySettings() {
    Sound.setSfx(settings.sound);
    Sound.setMusic(settings.music);
    document.querySelectorAll('[data-setting]').forEach((btn) => {
      const on = !!settings[btn.dataset.setting];
      btn.setAttribute('aria-pressed', String(on));
      btn.querySelector('.state').textContent = on ? 'ON' : 'OFF';
    });
  }

  document.querySelectorAll('[data-setting]').forEach((btn) => {
    btn.addEventListener('click', () => {
      Sound.ensure();
      setSetting(btn.dataset.setting, !settings[btn.dataset.setting]);
      Sound.sfx.click();
    });
  });

  // Start music on the first interaction anywhere (browsers block audio until then).
  const unlockAudio = () => {
    Sound.ensure();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // =====================================================================
  // Boot
  // =====================================================================
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    el.body.classList.add('touch');
    input.mode = 'touch';
  }
  resize();
  player.x = W / 2;
  player.y = H / 2;
  input.mouse.x = W / 2;
  input.mouse.y = H / 2;
  applySettings();
  el.menuBest.textContent = Math.floor(game.best).toLocaleString();
  for (let i = 0; i < 12; i++) spawnDrifter(true);
  requestAnimationFrame((t) => {
    last = t;
    requestAnimationFrame(frame);
  });

  // Small debugging / testing handle.
  window.NeonDodge = { game, player, settings, start: startGame, pause: pauseGame, resume: resumeGame, menu: toMenu };
})();
