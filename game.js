/* =========================================================
   NEON TANKS — a small arcade tank game
   Vanilla canvas / no dependencies
   ========================================================= */

(() => {
  'use strict';

  /* ---------------------------------------------------------
     DOM
     --------------------------------------------------------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const panel = document.getElementById('panel');
  const toastEl = document.getElementById('toast');
  const buffsEl = document.getElementById('buffs');
  const hudScore = document.getElementById('hudScore');
  const hudLevel = document.getElementById('hudLevel');
  const hudLives = document.getElementById('hudLives');
  const hudRemaining = document.getElementById('hudRemaining');
  const soundBtn = document.getElementById('soundBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const fireBtn = document.getElementById('fireBtn');
  const touchPause = document.getElementById('touchPause');

  /* ---------------------------------------------------------
     Constants
     --------------------------------------------------------- */

  const W = 680;
  const H = 600;
  const TILE = 40;
  const COLS = 17;
  const ROWS = 15;
  const TAU = Math.PI * 2;

  const T = Object.freeze({
    EMPTY: 0,
    BRICK: 1,
    STEEL: 2,
    WATER: 3,
    TREE: 4,
    BASE: 5,
  });

  const BRICK = T.BRICK;
  const STEEL = T.STEEL;
  const WATER = T.WATER;
  const TREE = T.TREE;
  const BASE = T.BASE;

  const DIRS = Object.freeze([
    { x: 0, y: -1 }, // up
    { x: 1, y: 0 },  // right
    { x: 0, y: 1 },  // down
    { x: -1, y: 0 }, // left
  ]);

  const PLAYER_SPAWN = { x: 140, y: 580 };
  const BASE_CENTER = { x: 320, y: 560 };
  const BASE_RECT = { x: 280, y: 520, w: 80, h: 80 };
  const SPAWN_POINTS = [
    { x: 60, y: 20 },
    { x: 340, y: 20 },
    { x: 620, y: 20 },
  ];

  const MAX_LEVEL = 5;

  const ENEMY_DEFS = {
    grunt: {
      hp: 1, speed: 58, fireDelay: 1.7, score: 100,
      body: '#7c3e14', accent: '#fbbf24', track: '#35210f',
    },
    scout: {
      hp: 1, speed: 96, fireDelay: 1.9, score: 150,
      body: '#78620d', accent: '#fde047', track: '#332b0a',
    },
    gunner: {
      hp: 2, speed: 67, fireDelay: 1.15, score: 250,
      body: '#74192c', accent: '#fb7185', track: '#310b12',
    },
    heavy: {
      hp: 3, speed: 50, fireDelay: 1.95, score: 400,
      body: '#44217d', accent: '#c4b5fd', track: '#1e1136',
    },
  };

  const POWERUP_DEFS = {
    shield: { color: '#5eead4', glyph: 'S', label: '护盾' },
    rapid: { color: '#fbbf24', glyph: '»', label: '连发' },
    life: { color: '#fb7185', glyph: '+', label: '生命' },
    freeze: { color: '#c4b5fd', glyph: 'F', label: '冻结' },
  };

  const PLAYER_COLORS = {
    body: '#0f766e',
    accent: '#5eead4',
    track: '#092d2b',
  };

  /* ---------------------------------------------------------
     Small helpers
     --------------------------------------------------------- */

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rand = (min, max) => min + Math.random() * (max - min);
  const pad = (n, len) => String(Math.max(0, n)).padStart(len, '0');
  const nearestLane = (v) => Math.round((v - TILE / 2) / TILE) * TILE + TILE / 2;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundRectPath(c, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + radius, y);
    c.arcTo(x + w, y, x + w, y + h, radius);
    c.arcTo(x + w, y + h, x, y + h, radius);
    c.arcTo(x, y + h, x, y, radius);
    c.arcTo(x, y, x + w, y, radius);
    c.closePath();
  }

  function circleRectHit(cx, cy, radius, rx, ry, half) {
    const nx = clamp(cx, rx - half, rx + half);
    const ny = clamp(cy, ry - half, ry + half);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy <= radius * radius;
  }

  function loadNumber(key, fallback = 0) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function saveNumber(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* storage can be unavailable in private mode */
    }
  }

  /* ---------------------------------------------------------
     Sound
     --------------------------------------------------------- */

  const sfx = {
    ctx: null,
    master: null,
    noiseBuffer: null,
    enabled: loadNumber('neon-tanks-muted', 0) !== 1,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      try {
        this.ctx = new AudioCtor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);

        const length = Math.floor(this.ctx.sampleRate * 0.45);
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buffer;
      } catch {
        this.ctx = null;
      }
    },

    setEnabled(on) {
      this.enabled = on;
      if (on) this.init();
    },

    tone(freq, endFreq, duration, type = 'square', volume = 0.04, delay = 0) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), now);
      if (endFreq && endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    },

    noise(duration, volume = 0.08, frequency = 900, delay = 0, q = 1) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.master || !this.noiseBuffer) return;
      const now = this.ctx.currentTime + delay;
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(frequency, now);
      filter.Q.value = q;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
      source.stop(now + duration + 0.02);
    },

    play(name) {
      if (!this.enabled) return;
      switch (name) {
        case 'click':
          this.tone(480, 620, 0.05, 'square', 0.02);
          break;
        case 'shoot':
          this.tone(660, 180, 0.08, 'square', 0.035);
          this.noise(0.05, 0.025, 1800);
          break;
        case 'enemyShoot':
          this.tone(240, 120, 0.1, 'sawtooth', 0.014);
          break;
        case 'brick':
          this.noise(0.09, 0.055, 1500);
          this.tone(150, 90, 0.08, 'triangle', 0.02);
          break;
        case 'steel':
          this.tone(1300, 700, 0.08, 'triangle', 0.02);
          break;
        case 'hit':
          this.tone(780, 320, 0.07, 'square', 0.025);
          break;
        case 'explode':
          this.noise(0.34, 0.12, 800);
          this.tone(120, 38, 0.38, 'sine', 0.075);
          this.noise(0.18, 0.06, 2200, 0.02);
          break;
        case 'playerDeath':
          this.noise(0.5, 0.13, 950);
          this.tone(220, 42, 0.7, 'sawtooth', 0.06);
          break;
        case 'powerup':
          this.tone(523, 523, 0.1, 'triangle', 0.035);
          this.tone(659, 659, 0.1, 'triangle', 0.035, 0.09);
          this.tone(880, 880, 0.18, 'triangle', 0.04, 0.18);
          break;
        case 'wave':
          this.tone(196, 196, 0.16, 'triangle', 0.04);
          this.tone(294, 294, 0.16, 'triangle', 0.04, 0.12);
          this.tone(392, 392, 0.28, 'triangle', 0.045, 0.24);
          break;
        case 'clear':
          this.tone(523, 523, 0.12, 'square', 0.03);
          this.tone(659, 659, 0.12, 'square', 0.03, 0.1);
          this.tone(784, 784, 0.12, 'square', 0.03, 0.2);
          this.tone(1046, 1046, 0.3, 'square', 0.032, 0.3);
          break;
        case 'gameover':
          this.tone(300, 280, 0.2, 'sawtooth', 0.038);
          this.tone(220, 210, 0.24, 'sawtooth', 0.04, 0.2);
          this.tone(140, 90, 0.65, 'sawtooth', 0.045, 0.44);
          break;
        case 'victory':
          [392, 523, 659, 784, 1046].forEach((f, i) => {
            this.tone(f, f, 0.24, 'triangle', 0.04, i * 0.13);
          });
          break;
        default:
          break;
      }
    },
  };

  /* ---------------------------------------------------------
     Persistent + mutable game state
     --------------------------------------------------------- */

  let dpr = 1;
  let best = loadNumber('neon-tanks-best', 0);
  let isTouch = false;

  let state = 'title';
  let visualTime = 0;
  let gameTime = 0;
  let level = 1;
  let score = 0;
  let lives = 3;
  let map = [];
  let player = null;
  let enemies = [];
  let bullets = [];
  let particles = [];
  let powerups = [];
  let baseAlive = true;
  let baseFlash = 0;
  let freezeTimer = 0;
  let spawned = 0;
  let totalEnemies = 0;
  let remainingToKill = 0;
  let spawnTimer = 0;
  let spawnCursor = 0;
  let ending = null;
  let stageTimer = 0;
  let lastEndReason = null;
  let shake = 0;
  let flash = 0;
  let toastTimeout = 0;
  let buffSignature = '';
  let lastFrame = 0;
  let pauseReturnFocus = null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const input = {
    dirPresses: [],
    keyboardFire: false,
    firePointers: new Set(),
  };

  /* ---------------------------------------------------------
     Map generation
     --------------------------------------------------------- */

  function isProtected(x, y) {
    // base + player spawn apron
    if (y >= 11 && x >= 2 && x <= 10) return true;
    // three enemy gates
    if (y <= 2 && (x <= 2 || (x >= 6 && x <= 10) || x >= 14)) return true;
    return false;
  }

  function generateMap(levelNumber) {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(T.EMPTY));
    const rng = mulberry32(0x51ed + levelNumber * 7919);

    const paint = (x, y, type) => {
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
      if (isProtected(x, y)) return;
      grid[y][x] = type;
    };

    const paintSym = (x, y, type) => {
      paint(x, y, type);
      paint(COLS - 1 - x, y, type);
    };

    // A symmetric, loose maze. Enough gaps for a 30px-wide tank to slip through.
    for (let y = 2; y <= 10; y += 1) {
      for (let x = 1; x <= 7; x += 1) {
        if ((x + y) % 2 !== 0) continue;
        if (isProtected(x, y) || isProtected(COLS - 1 - x, y)) continue;
        if (rng() > 0.35) continue;

        const steelChance = 0.13 + levelNumber * 0.025;
        const type = rng() < steelChance ? STEEL : BRICK;
        const shape = rng();

        if (shape < 0.44) {
          paintSym(x, y, type);
          paintSym(x + 1, y, type);
        } else if (shape < 0.78) {
          paintSym(x, y, type);
          paintSym(x, y + 1, type);
        } else {
          paintSym(x, y, type);
          paintSym(x + 1, y, type);
          paintSym(x, y + 1, type);
        }
      }
    }

    // Shallow ponds. They split the field and create natural choke points.
    if (levelNumber >= 2) {
      const ponds = [
        [2, 5], [3, 5], [2, 6], [3, 6],
      ];
      for (const [x, y] of ponds) {
        if (!isProtected(x, y)) grid[y][x] = WATER;
        const mx = COLS - 1 - x;
        if (!isProtected(mx, y)) grid[y][mx] = WATER;
      }
    }

    // A few steel anvils for higher waves.
    if (levelNumber >= 3) {
      for (const [x, y] of [[4, 8], [12, 8], [6, 3], [10, 3]]) {
        if (!isProtected(x, y)) grid[y][x] = STEEL;
      }
    }

    // Trees only replace open ground, and only near the edges.
    const treeSpots = [
      [0, 2], [1, 2], [0, 3], [1, 3],
      [15, 7], [16, 7], [15, 8], [16, 8],
      [0, 8], [1, 9], [15, 2], [16, 3],
    ];
    for (const [x, y] of treeSpots) {
      if (rng() < 0.7 && grid[y][x] === T.EMPTY) grid[y][x] = TREE;
    }

    // Make absolutely sure the lanes out of every spawn are open.
    const clear = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          if (x >= 0 && x < COLS && y >= 0 && y < ROWS) grid[y][x] = T.EMPTY;
        }
      }
    };
    clear(0, 0, 2, 1);
    clear(6, 0, 10, 1);
    clear(14, 0, 16, 1);
    clear(2, 12, 4, 14);
    clear(5, 11, 10, 14);

    // The eagle's brick igloo.
    for (let x = 6; x <= 9; x += 1) grid[12][x] = BRICK;
    for (let y = 13; y <= 14; y += 1) {
      grid[y][6] = BRICK;
      grid[y][9] = BRICK;
      grid[y][7] = BASE;
      grid[y][8] = BASE;
    }

    return grid;
  }

  function tileAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return STEEL;
    return map[ty][tx];
  }

  function isSolidTile(tile) {
    return tile === BRICK || tile === STEEL || tile === WATER || tile === BASE;
  }

  /* ---------------------------------------------------------
     Physics helpers
     --------------------------------------------------------- */

  function tankCollides(tank, x, y, skipSpawn = true) {
    const half = tank.size / 2;

    if (x - half < 3 || x + half > W - 3 || y - half < 3 || y + half > H - 3) {
      return true;
    }

    const x0 = Math.floor((x - half) / TILE);
    const x1 = Math.floor((x + half - 0.01) / TILE);
    const y0 = Math.floor((y - half) / TILE);
    const y1 = Math.floor((y + half - 0.01) / TILE);

    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return true;
        if (isSolidTile(map[ty][tx])) return true;
      }
    }

    const others = player && tank !== player ? [player, ...enemies] : enemies;
    for (const other of others) {
      if (!other || other === tank || other.dead || !other.alive) continue;
      if (skipSpawn && other.spawnTimer > 0) continue;
      if (
        Math.abs(x - other.x) < (tank.size + other.size) / 2 - 2 &&
        Math.abs(y - other.y) < (tank.size + other.size) / 2 - 2
      ) {
        return true;
      }
    }

    return false;
  }

  function faceDirection(tank, dir) {
    if (tank.dir === dir) return;
    const turning = (tank.dir % 2) !== (dir % 2);

    if (turning) {
      if (dir === 1 || dir === 3) {
        const targetY = nearestLane(tank.y);
        if (Math.abs(targetY - tank.y) <= 12 && !tankCollides(tank, tank.x, targetY)) {
          tank.y = targetY;
        }
      } else {
        const targetX = nearestLane(tank.x);
        if (Math.abs(targetX - tank.x) <= 12 && !tankCollides(tank, targetX, tank.y)) {
          tank.x = targetX;
        }
      }
    }

    tank.dir = dir;
  }

  function moveTank(tank, dt) {
    const direction = DIRS[tank.dir];
    const distance = tank.speed * dt;
    const nx = tank.x + direction.x * distance;
    const ny = tank.y + direction.y * distance;

    if (tankCollides(tank, nx, ny)) return false;

    tank.x = nx;
    tank.y = ny;
    tank.tread += distance;
    return true;
  }

  /* ---------------------------------------------------------
     Entity factories
     --------------------------------------------------------- */

  function createPlayer() {
    return {
      isPlayer: true,
      x: PLAYER_SPAWN.x,
      y: PLAYER_SPAWN.y,
      dir: 0,
      size: 30,
      speed: 148,
      colors: PLAYER_COLORS,
      alive: true,
      cooldown: 0.35,
      invuln: 2.5,
      shield: 0,
      rapid: 0,
      respawn: 0,
      tread: 0,
      flash: 0,
    };
  }

  function pickEnemyType() {
    const tables = {
      1: [['grunt', 0.7], ['scout', 0.3]],
      2: [['grunt', 0.46], ['scout', 0.28], ['gunner', 0.26]],
      3: [['grunt', 0.34], ['scout', 0.24], ['gunner', 0.3], ['heavy', 0.12]],
      4: [['grunt', 0.27], ['scout', 0.2], ['gunner', 0.34], ['heavy', 0.19]],
      5: [['grunt', 0.2], ['scout', 0.17], ['gunner', 0.4], ['heavy', 0.23]],
    };
    const table = tables[clamp(level, 1, 5)];
    const roll = Math.random();
    let cursor = 0;
    for (const [name, weight] of table) {
      cursor += weight;
      if (roll <= cursor) return name;
    }
    return table[table.length - 1][0];
  }

  function createEnemy(x, y) {
    const type = pickEnemyType();
    const def = ENEMY_DEFS[type];
    return {
      isPlayer: false,
      alive: true,
      type,
      x,
      y,
      dir: 2,
      size: 30,
      speed: def.speed + (level - 1) * 3,
      hp: def.hp,
      maxHp: def.hp,
      scoreValue: def.score,
      colors: { body: def.body, accent: def.accent, track: def.track },
      cooldown: rand(0.8, 1.4),
      fireDelay: Math.max(0.7, def.fireDelay - (level - 1) * 0.08),
      spawnTimer: 0.85,
      invuln: 0.9,
      aiTimer: rand(0.2, 0.7),
      stuck: 0,
      targetMode: Math.random() < 0.72 ? 'base' : 'player',
      flash: 0,
      tread: 0,
      seed: Math.random() * 1000,
    };
  }

  /* ---------------------------------------------------------
     Level lifecycle
     --------------------------------------------------------- */

  function buildLevel(levelNumber) {
    level = levelNumber;
    map = generateMap(levelNumber);
    enemies = [];
    bullets = [];
    particles = [];
    powerups = [];
    baseAlive = true;
    baseFlash = 0;
    freezeTimer = 0;
    ending = null;
    stageTimer = 0;
    shake = 0;
    flash = 0;
    totalEnemies = 9 + levelNumber * 2;
    remainingToKill = totalEnemies;
    spawned = 0;
    spawnCursor = 0;
    spawnTimer = 0.75;
    gameTime = 0;
    player = createPlayer();
    buffSignature = '';
    buffsEl.innerHTML = '';
    updateHUD();
  }

  function startNewGame() {
    sfx.init();
    sfx.play('click');
    clearInputs();
    score = 0;
    lives = 3;
    lastEndReason = null;
    buildLevel(1);
    state = 'playing';
    document.body.classList.remove('is-paused');
    hideOverlay();
    hideToast();
    updateHUD();
    showToast('第 1 波 · 敌军来袭', '', 1700);
    sfx.play('wave');
    canvas.focus({ preventScroll: true });
  }

  function returnToTitle() {
    clearInputs();
    saveBest();
    score = 0;
    lives = 3;
    lastEndReason = null;
    buildLevel(1);
    state = 'title';
    document.body.classList.remove('is-paused');
    buffsEl.innerHTML = '';
    buffSignature = '';
    hideToast();
    showTitle();
    updateHUD();
  }

  function beginLevelClear() {
    if (state !== 'playing' || ending) return;
    state = 'levelclear';
    stageTimer = 2.65;
    const bonus = 250 * level;
    score += bonus;
    updateHUD();
    showToast(`第 ${level} 波清除 · 奖励 +${bonus}`, 'amber', 2200);
    sfx.play('clear');
    celebrate();
    clearInputs();
  }

  function advanceLevel() {
    if (level >= MAX_LEVEL) {
      finishVictory();
      return;
    }
    level += 1;
    buildLevel(level);
    state = 'playing';
    clearInputs();
    hideOverlay();
    hideToast();
    updateHUD();
    showToast(`第 ${level} 波 · 敌军来袭`, '', 1600);
    sfx.play('wave');
    canvas.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------
     Ending / overlay
     --------------------------------------------------------- */

  function saveBest() {
    if (score > best) {
      best = score;
      saveNumber('neon-tanks-best', best);
    }
  }

  function triggerGameOver(reason) {
    if (ending) return;
    lastEndReason = reason;
    ending = {
      timer: reason === 'base' ? 1.9 : 1.35,
      reason,
    };
    clearInputs();
  }

  function finishGameOver() {
    const previousBest = best;
    saveBest();
    const newBest = score > previousBest && score > 0;
    state = 'gameover';
    ending = null;
    clearInputs();
    document.body.classList.remove('is-paused');
    sfx.play('gameover');
    showGameOver(newBest);
  }

  function finishVictory() {
    const previousBest = best;
    saveBest();
    const newBest = score > previousBest && score > 0;
    state = 'victory';
    clearInputs();
    sfx.play('victory');
    showVictory(newBest);
  }

  /* ---------------------------------------------------------
     Spawning + AI
     --------------------------------------------------------- */

  function spawnPointFree(point) {
    const tanks = [player, ...enemies].filter(Boolean);
    for (const tank of tanks) {
      if (!tank.alive) continue;
      if (Math.abs(tank.x - point.x) < 38 && Math.abs(tank.y - point.y) < 38) {
        return false;
      }
    }
    return true;
  }

  function trySpawnEnemy() {
    for (let attempt = 0; attempt < SPAWN_POINTS.length; attempt += 1) {
      const point = SPAWN_POINTS[spawnCursor % SPAWN_POINTS.length];
      spawnCursor += 1;
      if (!spawnPointFree(point)) continue;
      enemies.push(createEnemy(point.x, point.y));
      spawned += 1;
      sfx.tone(150, 280, 0.25, 'sine', 0.014);
      return true;
    }
    return false;
  }

  function updateSpawning(dt) {
    if (spawned >= totalEnemies) return;
    const maxAlive = 3 + Math.min(2, Math.floor((level - 1) / 2));
    if (enemies.length >= maxAlive) return;

    spawnTimer -= dt;
    if (spawnTimer > 0) return;

    if (trySpawnEnemy()) {
      spawnTimer = Math.max(0.85, 2.25 - level * 0.12) + rand(0.1, 1.0);
    } else {
      spawnTimer = 0.35;
    }
  }

  function chooseEnemyDirection(enemy) {
    const target = (
      enemy.targetMode === 'player' && player && player.alive
        ? player
        : BASE_CENTER
    );
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;

    const open = [];
    for (let dir = 0; dir < 4; dir += 1) {
      const d = DIRS[dir];
      if (!tankCollides(enemy, enemy.x + d.x * 16, enemy.y + d.y * 16)) {
        open.push(dir);
      }
    }
    const options = open.length ? open : [0, 1, 2, 3];

    let bestDir = options[0];
    let bestScore = -Infinity;
    for (const dir of options) {
      const d = DIRS[dir];
      let points = ((d.x * dx + d.y * dy) / length) * 2.2;
      if (dir === enemy.dir) points += 0.32;
      if (dir === (enemy.dir + 2) % 4) points -= 0.9;
      points += Math.random() * 1.35;
      if (points > bestScore) {
        bestScore = points;
        bestDir = dir;
      }
    }

    faceDirection(enemy, bestDir);
    enemy.aiTimer = rand(0.52, 1.45);
  }

  function enemyAlignedWith(enemy, target) {
    const d = DIRS[enemy.dir];
    if (d.x !== 0) {
      const sameSide = Math.sign(target.x - enemy.x) === d.x;
      return sameSide && Math.abs(enemy.y - target.y) < 26;
    }
    const sameSide = Math.sign(target.y - enemy.y) === d.y;
    return sameSide && Math.abs(enemy.x - target.x) < 26;
  }

  function tryEnemyFire(enemy) {
    const active = bullets.filter((b) => !b.dead && b.owner === enemy).length;
    if (active >= 2) return false;
    fireBullet(enemy);
    enemy.cooldown = enemy.fireDelay + rand(0, 0.35);
    return true;
  }

  function updateEnemies(dt) {
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);

      if (enemy.spawnTimer > 0) {
        enemy.spawnTimer -= dt;
        enemy.invuln = Math.max(enemy.invuln, enemy.spawnTimer);
        if (enemy.spawnTimer <= 0) enemy.invuln = 0.35;
        continue;
      }

      if (freezeTimer > 0) {
        enemy.cooldown = Math.max(enemy.cooldown, 0.25);
        continue;
      }

      enemy.cooldown -= dt;
      enemy.aiTimer -= dt;

      if (enemy.aiTimer <= 0) {
        chooseEnemyDirection(enemy);
      }

      const moved = moveTank(enemy, dt);
      if (!moved) {
        enemy.stuck += dt;
        if (enemy.stuck > 0.08) {
          chooseEnemyDirection(enemy);
          enemy.stuck = 0;
        }
      } else {
        enemy.stuck = 0;
      }

      if (enemy.cooldown <= 0) {
        const target = (
          enemy.targetMode === 'player' && player && player.alive
            ? player
            : BASE_CENTER
        );
        if (enemyAlignedWith(enemy, target) || Math.random() < dt * 0.22) {
          tryEnemyFire(enemy);
        }
      }
    }
  }

  /* ---------------------------------------------------------
     Shooting / damage
     --------------------------------------------------------- */

  function fireBullet(tank) {
    const d = DIRS[tank.dir];
    const muzzle = tank.size / 2 + 8;
    const fromPlayer = Boolean(tank.isPlayer);

    if (fromPlayer) {
      const active = bullets.filter((b) => !b.dead && b.fromPlayer).length;
      const maxBullets = tank.rapid > 0 ? 4 : 3;
      if (active >= maxBullets) return false;
    }

    const color = fromPlayer ? (tank.rapid > 0 ? '#fbbf24' : '#5eead4') : '#fb7185';
    const speed = fromPlayer ? 410 : 240 + (level - 1) * 12;

    bullets.push({
      x: tank.x + d.x * muzzle,
      y: tank.y + d.y * muzzle,
      prevX: tank.x,
      prevY: tank.y,
      dir: tank.dir,
      speed,
      fromPlayer,
      owner: tank,
      radius: 3.2,
      color,
      dead: false,
    });

    // muzzle flash
    const mx = tank.x + d.x * (muzzle + 2);
    const my = tank.y + d.y * (muzzle + 2);
    addParticle({
      type: 'spark',
      x: mx, y: my,
      vx: d.x * rand(20, 80) + rand(-30, 30),
      vy: d.y * rand(20, 80) + rand(-30, 30),
      life: 0.12, maxLife: 0.12, size: 2.5,
      color: fromPlayer ? '#d9fffa' : '#ffd4da',
      drag: 0.82,
    });

    sfx.play(fromPlayer ? 'shoot' : 'enemyShoot');
    return true;
  }

  function destroyBrick(tx, ty, color = '#c2764e') {
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return;
    if (map[ty][tx] !== BRICK) return;
    map[ty][tx] = T.EMPTY;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    for (let i = 0; i < 7; i += 1) {
      addParticle({
        type: 'debris',
        x: cx + rand(-13, 13),
        y: cy + rand(-13, 13),
        vx: rand(-90, 90),
        vy: rand(-110, 35),
        life: rand(0.25, 0.55),
        maxLife: 0.55,
        size: rand(2, 5),
        color: i % 2 ? color : '#6e3422',
        gravity: 280,
        drag: 0.9,
        rot: rand(0, TAU),
        vr: rand(-7, 7),
      });
    }
    sfx.play('brick');
  }

  function hitBase() {
    if (!baseAlive || ending) return;
    baseAlive = false;
    baseFlash = 1;
    shake = Math.min(18, shake + 14);
    flash = Math.max(flash, 0.75);
    explode(BASE_CENTER.x, BASE_CENTER.y, '#fbbf24', 2.4);
    for (let i = 0; i < 6; i += 1) {
      setTimeout(() => {
        if (state === 'playing' && ending) {
          addParticle({
            type: 'smoke',
            x: BASE_CENTER.x + rand(-28, 28),
            y: BASE_CENTER.y + rand(-25, 15),
            vx: rand(-15, 15),
            vy: rand(-55, -20),
            life: rand(0.7, 1.3),
            maxLife: 1.3,
            size: rand(10, 24),
            color: '#4a3e3a',
            gravity: -8,
            drag: 0.96,
          });
        }
      }, i * 130);
    }
    showToast('基地告急 · 防线崩溃', 'coral', 1800);
    triggerGameOver('base');
  }

  function damageEnemy(enemy, bullet) {
    enemy.hp -= 1;
    enemy.flash = 0.1;

    if (enemy.hp > 0) {
      sfx.play('hit');
      for (let i = 0; i < 5; i += 1) {
        addParticle({
          type: 'spark',
          x: enemy.x + rand(-6, 6),
          y: enemy.y + rand(-6, 6),
          vx: rand(-90, 90),
          vy: rand(-90, 90),
          life: rand(0.12, 0.3),
          maxLife: 0.3,
          size: rand(1.4, 3),
          color: enemy.colors.accent,
          drag: 0.87,
        });
      }
      return;
    }

    enemy.dead = true;
    remainingToKill = Math.max(0, remainingToKill - 1);
    score += enemy.scoreValue;
    explode(enemy.x, enemy.y, enemy.colors.accent, 1.15);
    addScoreText(enemy.x, enemy.y, enemy.scoreValue);
    sfx.play('explode');
    shake = Math.min(12, shake + 3.2);
    updateHUD();

    const dropChance = 0.17 + level * 0.008;
    if (Math.random() < dropChance && powerups.length < 2) {
      spawnPowerup(enemy.x, enemy.y);
    }
  }

  function hitPlayer() {
    if (!player || !player.alive) return;
    if (player.invuln > 0 || player.shield > 0) {
      sfx.play('steel');
      for (let i = 0; i < 4; i += 1) {
        addParticle({
          type: 'spark',
          x: player.x + rand(-12, 12),
          y: player.y + rand(-12, 12),
          vx: rand(-70, 70),
          vy: rand(-70, 70),
          life: 0.2, maxLife: 0.2, size: 2,
          color: player.shield > 0 ? '#5eead4' : '#d9fffa',
          drag: 0.88,
        });
      }
      return;
    }

    explode(player.x, player.y, '#5eead4', 1.5);
    sfx.play('playerDeath');
    shake = Math.min(16, shake + 9);
    player.alive = false;
    player.shield = 0;
    player.rapid = 0;
    player.respawn = 1.55;
    lives -= 1;
    updateHUD();

    if (lives <= 0) {
      showToast('装甲耗尽', 'coral', 1500);
      triggerGameOver('lives');
    } else {
      showToast(`装甲损毁 · 剩余 ${lives} 辆`, 'coral', 1300);
    }
  }

  function respawnPlayer() {
    player.alive = true;
    player.x = PLAYER_SPAWN.x;
    player.y = PLAYER_SPAWN.y;
    player.dir = 0;
    player.cooldown = 0.4;
    player.invuln = 2.6;
    player.flash = 0;
    player.tread = 0;
    player.respawn = 0;
    for (let i = 0; i < 12; i += 1) {
      addParticle({
        type: 'spark',
        x: PLAYER_SPAWN.x + rand(-20, 20),
        y: PLAYER_SPAWN.y + rand(-20, 20),
        vx: rand(-50, 50),
        vy: rand(-80, 20),
        life: rand(0.2, 0.5),
        maxLife: 0.5,
        size: rand(1.5, 3),
        color: '#5eead4',
        drag: 0.9,
      });
    }
  }

  /* ---------------------------------------------------------
     Bullets
     --------------------------------------------------------- */

  function updateBullets(dt) {
    for (const bullet of bullets) {
      if (bullet.dead) continue;
      bullet.prevX = bullet.x;
      bullet.prevY = bullet.y;

      const d = DIRS[bullet.dir];
      bullet.x += d.x * bullet.speed * dt;
      bullet.y += d.y * bullet.speed * dt;

      if (
        bullet.x < 2 || bullet.x > W - 2 ||
        bullet.y < 2 || bullet.y > H - 2
      ) {
        bullet.dead = true;
        sparkAt(bullet.x, bullet.y, bullet.color);
        continue;
      }

      const tile = tileAt(bullet.x, bullet.y);
      if (tile === BRICK) {
        destroyBrick(
          Math.floor(bullet.x / TILE),
          Math.floor(bullet.y / TILE),
          bullet.fromPlayer ? '#c2764e' : '#a65b3d',
        );
        bullet.dead = true;
        sparkAt(bullet.x, bullet.y, '#ffd4a8');
        continue;
      }

      if (tile === STEEL) {
        bullet.dead = true;
        sparkAt(bullet.x, bullet.y, '#d8f6ff');
        sfx.play('steel');
        continue;
      }

      if (tile === BASE) {
        bullet.dead = true;
        if (bullet.fromPlayer) {
          sparkAt(bullet.x, bullet.y, '#fbbf24');
        } else {
          hitBase();
        }
        continue;
      }

      if (bullet.fromPlayer) {
        for (const enemy of enemies) {
          if (enemy.dead || enemy.spawnTimer > 0) continue;
          if (circleRectHit(bullet.x, bullet.y, bullet.radius, enemy.x, enemy.y, enemy.size / 2)) {
            bullet.dead = true;
            damageEnemy(enemy, bullet);
            break;
          }
        }
      } else if (
        player && player.alive &&
        circleRectHit(bullet.x, bullet.y, bullet.radius, player.x, player.y, player.size / 2)
      ) {
        bullet.dead = true;
        hitPlayer();
      }

      if (ending) break;
    }

    // Bullets cancel each other out when they meet head-on.
    for (let i = 0; i < bullets.length; i += 1) {
      const a = bullets[i];
      if (a.dead || !a.fromPlayer) continue;
      for (let j = 0; j < bullets.length; j += 1) {
        const b = bullets[j];
        if (b.dead || b.fromPlayer) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < 9) {
          a.dead = true;
          b.dead = true;
          sparkAt((a.x + b.x) / 2, (a.y + b.y) / 2, '#fff3cf');
          break;
        }
      }
    }

    bullets = bullets.filter((b) => !b.dead);
    enemies = enemies.filter((e) => !e.dead);
  }

  /* ---------------------------------------------------------
     Powerups
     --------------------------------------------------------- */

  function spawnPowerup(x, y) {
    const roll = Math.random();
    let type = 'shield';
    if (roll > 0.34 && roll <= 0.64) type = 'rapid';
    else if (roll > 0.64 && roll <= 0.8) type = 'life';
    else if (roll > 0.8) type = 'freeze';

    powerups.push({
      x: clamp(x, 24, W - 24),
      y: clamp(y, 24, H - 24),
      type,
      life: 15,
      maxLife: 15,
      seed: Math.random() * TAU,
      dead: false,
    });
  }

  function applyPowerup(powerup) {
    const def = POWERUP_DEFS[powerup.type];
    switch (powerup.type) {
      case 'shield':
        player.shield = Math.max(player.shield, 8);
        break;
      case 'rapid':
        player.rapid = Math.max(player.rapid, 9);
        break;
      case 'life':
        lives = Math.min(9, lives + 1);
        break;
      case 'freeze':
        freezeTimer = 6;
        break;
      default:
        break;
    }
    updateHUD();
    sfx.play('powerup');
    showToast(`${def.label}已激活`, 'amber', 1100);
    for (let i = 0; i < 14; i += 1) {
      addParticle({
        type: 'spark',
        x: powerup.x,
        y: powerup.y,
        vx: rand(-120, 120),
        vy: rand(-120, 120),
        life: rand(0.25, 0.55),
        maxLife: 0.55,
        size: rand(1.5, 3.5),
        color: def.color,
        drag: 0.9,
      });
    }
    particles.push({
      type: 'ring',
      x: powerup.x,
      y: powerup.y,
      vx: 0,
      vy: 0,
      life: 0.4,
      maxLife: 0.4,
      size: 10,
      growth: 50,
      color: def.color,
    });
  }

  function updatePowerups(dt) {
    for (const powerup of powerups) {
      if (powerup.dead) continue;
      powerup.life -= dt;
      if (powerup.life <= 0) {
        powerup.dead = true;
        continue;
      }
      if (
        player && player.alive &&
        Math.hypot(player.x - powerup.x, player.y - powerup.y) < 26
      ) {
        powerup.dead = true;
        applyPowerup(powerup);
      }
    }
    powerups = powerups.filter((p) => !p.dead);
  }

  /* ---------------------------------------------------------
     Particles
     --------------------------------------------------------- */

  function addParticle(particle) {
    if (particles.length > 460) particles.shift();
    particles.push({
      gravity: 0,
      drag: 0.9,
      rot: 0,
      vr: 0,
      growth: 0,
      ...particle,
    });
  }

  function sparkAt(x, y, color) {
    for (let i = 0; i < 4; i += 1) {
      addParticle({
        type: 'spark',
        x, y,
        vx: rand(-100, 100),
        vy: rand(-100, 100),
        life: rand(0.1, 0.25),
        maxLife: 0.25,
        size: rand(1, 2.5),
        color,
        drag: 0.85,
      });
    }
  }

  function explode(x, y, color = '#fbbf24', scale = 1) {
    const count = Math.round(16 * scale);
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, TAU);
      const speed = rand(20, 150) * Math.sqrt(scale);
      addParticle({
        type: Math.random() < 0.55 ? 'fire' : 'spark',
        x: x + rand(-5, 5),
        y: y + rand(-5, 5),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.22, 0.65) * Math.sqrt(scale),
        maxLife: 0.65,
        size: rand(2, 6) * Math.sqrt(scale),
        color: Math.random() < 0.35 ? '#fff4d1' : color,
        drag: 0.9,
      });
    }
    for (let i = 0; i < Math.round(5 * scale); i += 1) {
      addParticle({
        type: 'smoke',
        x: x + rand(-12, 12),
        y: y + rand(-12, 12),
        vx: rand(-25, 25),
        vy: rand(-45, -5),
        life: rand(0.5, 1.1) * scale,
        maxLife: 1.1,
        size: rand(6, 16) * Math.sqrt(scale),
        color: '#4c4743',
        drag: 0.96,
      });
    }
    particles.push({
      type: 'ring',
      x, y,
      vx: 0,
      vy: 0,
      life: 0.36,
      maxLife: 0.36,
      size: 4,
      growth: 130 * scale,
      color: '#fff1cc',
    });
  }

  function addScoreText(x, y, value) {
    addParticle({
      type: 'text',
      x, y: y - 10,
      vx: 0,
      vy: -22,
      life: 0.7,
      maxLife: 0.7,
      size: 10,
      color: '#fbbf24',
      text: `+${value}`,
    });
  }

  function celebrate() {
    const colors = ['#5eead4', '#fbbf24', '#fb7185', '#c4b5fd'];
    for (let i = 0; i < 26; i += 1) {
      addParticle({
        type: 'debris',
        x: rand(W * 0.3, W * 0.7),
        y: rand(H * 0.38, H * 0.62),
        vx: rand(-110, 110),
        vy: rand(-160, -35),
        life: rand(0.5, 1.1),
        maxLife: 1.1,
        size: rand(2, 4.5),
        color: colors[i % colors.length],
        gravity: 200,
        drag: 0.94,
        rot: rand(0, TAU),
        vr: rand(-8, 8),
      });
    }
  }

  function updateParticles(dt) {
    for (const particle of particles) {
      particle.life -= dt;
      if (particle.life <= 0) continue;
      if (particle.type === 'text') {
        particle.y += particle.vy * dt;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const drag = Math.pow(particle.drag, dt * 60);
      particle.vx *= drag;
      particle.vy *= drag;
      particle.vy += particle.gravity * dt;
      particle.rot += particle.vr * dt;
      if (particle.growth) particle.size += particle.growth * dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  /* ---------------------------------------------------------
     Player update
     --------------------------------------------------------- */

  function currentDirection() {
    return input.dirPresses.length
      ? input.dirPresses[input.dirPresses.length - 1].dir
      : null;
  }

  function isFiring() {
    return input.keyboardFire || input.firePointers.size > 0;
  }

  function updatePlayer(dt) {
    if (!player) return;

    player.flash = Math.max(0, player.flash - dt);

    if (!player.alive) {
      if (ending) return;
      player.respawn -= dt;
      if (player.respawn <= 0 && lives > 0) respawnPlayer();
      return;
    }

    player.cooldown = Math.max(0, player.cooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.shield = Math.max(0, player.shield - dt);
    player.rapid = Math.max(0, player.rapid - dt);

    const wanted = currentDirection();
    if (wanted !== null) {
      faceDirection(player, wanted);
      moveTank(player, dt);
    }

    if (isFiring() && player.cooldown <= 0) {
      if (fireBullet(player)) {
        player.cooldown = player.rapid > 0 ? 0.13 : 0.31;
      } else {
        player.cooldown = 0.07;
      }
    }
  }

  /* ---------------------------------------------------------
     Main update
     --------------------------------------------------------- */

  function updateHUD() {
    hudScore.textContent = pad(score, 6);
    hudLevel.textContent = pad(level, 2);
    hudLives.textContent = `×${Math.max(0, lives)}`;
    hudRemaining.textContent = state === 'title' ? '--' : pad(remainingToKill, 2);
  }

  function update(dt) {
    visualTime += dt;
    updateParticles(dt);
    updateShakeAndFlash(dt);

    if (state === 'playing') {
      if (ending) {
        ending.timer -= dt;
        if (ending.timer <= 0) finishGameOver();
        renderBuffs();
        return;
      }

      gameTime += dt;
      if (freezeTimer > 0) freezeTimer = Math.max(0, freezeTimer - dt);

      updatePlayer(dt);
      updateSpawning(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updatePowerups(dt);

      if (
        baseAlive &&
        !ending &&
        spawned >= totalEnemies &&
        remainingToKill <= 0 &&
        enemies.length === 0
      ) {
        beginLevelClear();
      }
    } else if (state === 'levelclear') {
      stageTimer -= dt;
      if (stageTimer <= 0) advanceLevel();
    }

    renderBuffs();
  }

  function updateShakeAndFlash(dt) {
    if (reduceMotion) {
      shake = 0;
      flash = 0;
      return;
    }
    shake = Math.max(0, shake - 26 * dt);
    flash = Math.max(0, flash - 2.1 * dt);
    if (baseFlash > 0) baseFlash = Math.max(0, baseFlash - dt);
  }

  /* ---------------------------------------------------------
     Rendering: terrain
     --------------------------------------------------------- */

  function drawBackground() {
    const bg = ctx.createRadialGradient(W / 2, H * 0.46, 60, W / 2, H * 0.5, W * 0.82);
    bg.addColorStop(0, '#0a151d');
    bg.addColorStop(0.65, '#071018');
    bg.addColorStop(1, '#04090e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(94, 234, 212, 0.038)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += TILE) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, H);
    }
    for (let y = 0; y <= H; y += TILE) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();

    const halo = ctx.createRadialGradient(
      BASE_CENTER.x, BASE_CENTER.y, 10,
      BASE_CENTER.x, BASE_CENTER.y, 130,
    );
    halo.addColorStop(0, 'rgba(251, 191, 36, 0.065)');
    halo.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(160, 400, 340, 200);

    ctx.strokeStyle = 'rgba(94, 234, 212, 0.1)';
    ctx.strokeRect(6.5, 6.5, W - 13, H - 13);
  }

  function drawBrick(x, y) {
    const px = x * TILE;
    const py = y * TILE;
    const variant = (x * 13 + y * 7) % 3;

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, TILE, TILE);
    ctx.clip();

    ctx.fillStyle = '#24100d';
    ctx.fillRect(px, py, TILE, TILE);

    const tones = ['#7f422e', '#8c4b33', '#743a29'];
    const brickH = 8.6;
    for (let row = 0; row < 4; row += 1) {
      const offset = row % 2 === 0 ? -7 : 3;
      for (let col = -1; col < 3; col += 1) {
        const bx = px + offset + col * 19 + (variant * 0.8);
        const by = py + 2 + row * 9.6;
        ctx.fillStyle = tones[(row + col + variant + 9) % 3];
        ctx.fillRect(bx, by, 17.4, 7.4);
        ctx.fillStyle = 'rgba(255, 204, 158, 0.1)';
        ctx.fillRect(bx, by, 17.4, 1.2);
      }
    }

    const shade = ctx.createLinearGradient(px, py, px, py + TILE);
    shade.addColorStop(0, 'rgba(255, 180, 120, 0.06)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
    ctx.fillStyle = shade;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.restore();

    ctx.strokeStyle = 'rgba(20, 8, 4, 0.45)';
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }

  function drawSteel(x, y) {
    const px = x * TILE;
    const py = y * TILE;

    ctx.fillStyle = '#18272f';
    ctx.fillRect(px, py, TILE, TILE);

    const grad = ctx.createLinearGradient(px, py, px + TILE, py + TILE);
    grad.addColorStop(0, '#334a55');
    grad.addColorStop(0.5, '#263c46');
    grad.addColorStop(1, '#182830');
    ctx.fillStyle = grad;
    ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);

    ctx.strokeStyle = 'rgba(174, 213, 223, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);

    ctx.strokeStyle = 'rgba(94, 234, 212, 0.1)';
    ctx.beginPath();
    ctx.moveTo(px + 8, py + 31);
    ctx.lineTo(px + 31, py + 8);
    ctx.moveTo(px + 9, py + 9);
    ctx.lineTo(px + 9, py + 15);
    ctx.stroke();

    ctx.fillStyle = 'rgba(200, 231, 236, 0.5)';
    for (const [dx, dy] of [[7, 7], [33, 7], [7, 33], [33, 33]]) {
      ctx.beginPath();
      ctx.arc(px + dx, py + dy, 1.6, 0, TAU);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(4, 10, 13, 0.7)';
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }

  function drawWater(x, y) {
    const px = x * TILE;
    const py = y * TILE;
    ctx.fillStyle = '#06212e';
    ctx.fillRect(px, py, TILE, TILE);

    const shimmer = ctx.createLinearGradient(px, py, px, py + TILE);
    shimmer.addColorStop(0, 'rgba(14, 165, 233, 0.14)');
    shimmer.addColorStop(0.6, 'rgba(14, 165, 233, 0.02)');
    shimmer.addColorStop(1, 'rgba(14, 165, 233, 0.16)');
    ctx.fillStyle = shimmer;
    ctx.fillRect(px, py, TILE, TILE);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i += 1) {
      const phase = visualTime * 1.7 + x * 0.8 + y * 1.1 + i * 1.7;
      const wy = py + 10 + i * 10 + Math.sin(phase) * 1.8;
      ctx.beginPath();
      for (let sx = 0; sx <= TILE; sx += 4) {
        const sy = wy + Math.sin(phase + sx * 0.22) * 1.2;
        if (sx === 0) ctx.moveTo(px + sx, sy);
        else ctx.lineTo(px + sx, sy);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(3, 15, 22, 0.55)';
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }

  function drawTreeGround(x, y) {
    const px = x * TILE;
    const py = y * TILE;
    ctx.fillStyle = 'rgba(8, 29, 21, 0.65)';
    ctx.fillRect(px, py, TILE, TILE);

    const rng = mulberry32(x * 991 + y * 37);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.14)';
    for (let i = 0; i < 6; i += 1) {
      ctx.fillRect(px + rng() * 38, py + rng() * 38, 1.3, 3);
    }
  }

  function drawTerrain() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        switch (map[y][x]) {
          case BRICK: drawBrick(x, y); break;
          case STEEL: drawSteel(x, y); break;
          case WATER: drawWater(x, y); break;
          case TREE: drawTreeGround(x, y); break;
          default: break;
        }
      }
    }
  }

  function drawTreeCanopy() {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (map[y][x] !== TREE) continue;
        const px = x * TILE;
        const py = y * TILE;
        const rng = mulberry32(x * 7717 + y * 131);
        ctx.save();
        ctx.globalAlpha = 0.68;
        for (let i = 0; i < 4; i += 1) {
          const cx = px + 10 + rng() * 22;
          const cy = py + 9 + rng() * 22;
          const radius = 9 + rng() * 9;
          ctx.fillStyle = i % 2 ? '#14532d' : '#166534';
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(px + 16, py + 13, 6, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  /* ---------------------------------------------------------
     Rendering: base, tanks, bullets, powerups
     --------------------------------------------------------- */

  function drawBase() {
    const cx = BASE_CENTER.x;
    const cy = BASE_CENTER.y;

    ctx.save();

    const ambient = ctx.createRadialGradient(cx, cy, 8, cx, cy, 75);
    ambient.addColorStop(0, baseAlive ? 'rgba(251, 191, 36, 0.16)' : 'rgba(251, 113, 133, 0.1)');
    ambient.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = ambient;
    ctx.fillRect(cx - 80, cy - 80, 160, 160);

    ctx.translate(cx, cy);

    // base plate
    roundRectPath(ctx, -37, -37, 74, 74, 5);
    ctx.fillStyle = baseAlive ? '#161a18' : '#150f11';
    ctx.fill();
    ctx.strokeStyle = baseAlive ? 'rgba(251, 191, 36, 0.55)' : 'rgba(251, 113, 133, 0.4)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (baseAlive) {
      ctx.save();
      ctx.globalAlpha = 0.2 + Math.sin(visualTime * 2.2) * 0.06;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 48, 0, TAU);
      ctx.stroke();
      ctx.restore();

      // eagle / crest
      const gold = ctx.createLinearGradient(0, -30, 0, 30);
      gold.addColorStop(0, '#fde68a');
      gold.addColorStop(0.55, '#fbbf24');
      gold.addColorStop(1, '#b45309');
      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.moveTo(0, -29);
      ctx.lineTo(8, -13);
      ctx.lineTo(27, -20);
      ctx.lineTo(17, -3);
      ctx.lineTo(25, 10);
      ctx.lineTo(6, 7);
      ctx.lineTo(0, 28);
      ctx.lineTo(-6, 7);
      ctx.lineTo(-25, 10);
      ctx.lineTo(-17, -3);
      ctx.lineTo(-27, -20);
      ctx.lineTo(-8, -13);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#111816';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(9, -6);
      ctx.lineTo(6, 10);
      ctx.lineTo(0, 17);
      ctx.lineTo(-6, 10);
      ctx.lineTo(-9, -6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#5eead4';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(3.5, 1);
      ctx.lineTo(0, 8);
      ctx.lineTo(-3.5, 1);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(253, 230, 138, 0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-34.5, -34.5, 69, 69);
    } else {
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-21, -24);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-17, 18);
      ctx.moveTo(9, -26);
      ctx.lineTo(6, 2);
      ctx.lineTo(23, 21);
      ctx.moveTo(-28, 3);
      ctx.lineTo(10, 12);
      ctx.lineTo(22, -8);
      ctx.stroke();

      ctx.fillStyle = 'rgba(251, 113, 133, 0.14)';
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawSpawnMarkers() {
    for (const point of SPAWN_POINTS) {
      const pulse = 0.5 + Math.sin(visualTime * 2.4 + point.x) * 0.5;
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.strokeStyle = `rgba(251, 113, 133, ${0.1 + pulse * 0.1})`;
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(251, 113, 133, ${0.18 + pulse * 0.16})`;
      for (let i = 0; i < 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-6, -5 + i * 6);
        ctx.lineTo(0, 1 + i * 6);
        ctx.lineTo(6, -5 + i * 6);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPlayerSpawnMarker() {
    if (!player) return;
    const pulse = 0.5 + Math.sin(visualTime * 3) * 0.5;
    ctx.save();
    ctx.translate(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    ctx.strokeStyle = `rgba(94, 234, 212, ${0.08 + pulse * 0.06})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 25 + pulse * 2, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawPowerups() {
    for (const powerup of powerups) {
      const def = POWERUP_DEFS[powerup.type];
      const bob = Math.sin(visualTime * 2.8 + powerup.seed) * 3;
      const pulse = 0.72 + Math.sin(visualTime * 3.6 + powerup.seed) * 0.14;
      const fading = powerup.life < 3.5 && Math.floor(powerup.life * 6) % 2 === 0;

      ctx.save();
      ctx.translate(powerup.x, powerup.y + bob);
      ctx.globalAlpha = fading ? 0.35 : 1;

      const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
      halo.addColorStop(0, def.color + '44');
      halo.addColorStop(1, def.color + '00');
      ctx.fillStyle = halo;
      ctx.fillRect(-28, -28, 56, 56);

      ctx.rotate(visualTime * 0.8 + powerup.seed);
      ctx.strokeStyle = def.color;
      ctx.globalAlpha *= 0.42;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        const px = Math.cos(a) * 19;
        const py = Math.sin(a) * 19;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = fading ? 0.35 : 1;
      ctx.rotate(-(visualTime * 0.8 + powerup.seed));

      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(5, 12, 16, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = def.color;
      ctx.font = '700 14px "Cascadia Code", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.glyph, 0, 1);
      ctx.restore();
    }
  }

  function drawTank(tank) {
    if (!tank || !tank.alive || tank.dead) return;
    const h = tank.size / 2;
    const colors = tank.colors;

    ctx.save();
    ctx.translate(tank.x, tank.y);

    // ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(2, 3, h * 0.92, h * 0.8, 0, 0, TAU);
    ctx.fill();

    const spawning = tank.spawnTimer > 0;
    if (spawning) {
      ctx.globalAlpha = 0.48;
    } else if (tank.invuln > 0 && Math.floor(visualTime * 14) % 2 === 0) {
      ctx.globalAlpha = 0.58;
    }

    ctx.rotate((tank.dir * Math.PI) / 2);

    // treads
    ctx.fillStyle = colors.track;
    roundRectPath(ctx, -h, -h + 2, 7, tank.size - 4, 2);
    ctx.fill();
    roundRectPath(ctx, h - 7, -h + 2, 7, tank.size - 4, 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const ty = -h + 4 + ((i * 5.5 + (tank.tread % 5.5)) % (tank.size - 8));
      ctx.beginPath();
      ctx.moveTo(-h + 1.5, ty);
      ctx.lineTo(-h + 5.5, ty);
      ctx.moveTo(h - 5.5, ty);
      ctx.lineTo(h - 1.5, ty);
      ctx.stroke();
    }

    // hull
    const hull = ctx.createLinearGradient(-h, 0, h, 0);
    if (tank.flash > 0) {
      hull.addColorStop(0, '#ffffff');
      hull.addColorStop(1, '#e9fffb');
    } else {
      hull.addColorStop(0, colors.body);
      hull.addColorStop(0.5, colors.accent);
      hull.addColorStop(1, colors.body);
    }
    ctx.fillStyle = hull;
    roundRectPath(ctx, -h + 6, -h + 4, tank.size - 12, tank.size - 11, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // barrel
    ctx.fillStyle = colors.accent;
    ctx.fillRect(-2.2, -h - 5.5, 4.4, h + 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(-1, -h - 5.5, 1.2, h + 3);

    // turret
    ctx.fillStyle = tank.flash > 0 ? '#ffffff' : colors.body;
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(0, 0, 1.7, 0, TAU);
    ctx.fill();

    // small chevron on the nose
    ctx.strokeStyle = 'rgba(5, 15, 15, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-4, -h + 8);
    ctx.lineTo(0, -h + 11);
    ctx.lineTo(4, -h + 8);
    ctx.stroke();

    ctx.restore();

    // status decorations in screen space
    if (tank.maxHp > 1 && tank.hp < tank.maxHp) {
      const bars = tank.maxHp;
      const width = 22;
      const individual = width / bars;
      ctx.save();
      ctx.translate(tank.x - width / 2, tank.y - h - 9);
      for (let i = 0; i < bars; i += 1) {
        ctx.fillStyle = i < tank.hp ? colors.accent : 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(i * individual + 1, 0, individual - 2.4, 2.6);
      }
      ctx.restore();
    }

    if (tank.isPlayer && tank.shield > 0) {
      ctx.save();
      ctx.translate(tank.x, tank.y);
      ctx.rotate(visualTime * 1.6);
      ctx.strokeStyle = 'rgba(94, 234, 212, 0.72)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else if (tank.isPlayer && tank.invuln > 0) {
      ctx.save();
      ctx.translate(tank.x, tank.y);
      ctx.globalAlpha = 0.26 + Math.sin(visualTime * 9) * 0.12;
      ctx.strokeStyle = '#d9fffa';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (!tank.isPlayer && freezeTimer > 0) {
      ctx.save();
      ctx.translate(tank.x, tank.y);
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-9, -23);
      ctx.lineTo(9, -23);
      ctx.moveTo(0, -29);
      ctx.lineTo(0, -17);
      ctx.moveTo(-6, -27);
      ctx.lineTo(6, -19);
      ctx.moveTo(6, -27);
      ctx.lineTo(-6, -19);
      ctx.stroke();
      ctx.restore();
    }

    if (spawning) {
      ctx.save();
      ctx.translate(tank.x, tank.y);
      ctx.rotate(visualTime * 2.5);
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.65)';
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  function drawTanks() {
    for (const enemy of enemies) drawTank(enemy);
    if (player) drawTank(player);
  }

  function drawBullets() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const bullet of bullets) {
      const d = DIRS[bullet.dir];
      const tx = bullet.x - d.x * 16;
      const ty = bullet.y - d.y * 16;

      const trail = ctx.createLinearGradient(tx, ty, bullet.x, bullet.y);
      trail.addColorStop(0, 'rgba(255,255,255,0)');
      trail.addColorStop(1, bullet.color);
      ctx.strokeStyle = trail;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fffdf4';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 2.8, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 0.24;
      ctx.fillStyle = bullet.color;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------
     Rendering: particles, overlays
     --------------------------------------------------------- */

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      const k = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = k;

      if (p.type === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.type === 'fire') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.type === 'smoke') {
        ctx.globalAlpha = k * 0.3;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.5 - k * 0.4), 0, TAU);
        ctx.fill();
      } else if (p.type === 'ring') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = k * 0.6;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.type === 'text') {
        ctx.fillStyle = p.color;
        ctx.font = '700 10px "Cascadia Code", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.type === 'debris') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawVignetteAndStatus() {
    const vignette = ctx.createRadialGradient(
      W / 2, H / 2, H * 0.28,
      W / 2, H / 2, H * 0.78,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    if (freezeTimer > 0) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.045)';
      ctx.fillRect(0, 0, W, H);
    }

    if (lives <= 1 && baseAlive && state === 'playing') {
      const pulse = 0.5 + Math.sin(visualTime * 4) * 0.5;
      ctx.strokeStyle = `rgba(251, 113, 133, ${0.08 + pulse * 0.1})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, W - 10, H - 10);
    }

    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 218, 170, ${flash * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (state === 'levelclear') {
      ctx.save();
      ctx.fillStyle = 'rgba(4, 8, 12, 0.26)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const sx = shake > 0 ? rand(-shake, shake) : 0;
    const sy = shake > 0 ? rand(-shake, shake) : 0;

    ctx.save();
    ctx.translate(sx, sy);
    drawBackground();
    drawSpawnMarkers();
    drawPlayerSpawnMarker();
    drawTerrain();
    drawBase();
    drawPowerups();
    drawTanks();
    drawTreeCanopy();
    drawBullets();
    drawParticles();
    ctx.restore();

    drawVignetteAndStatus();
  }

  /* ---------------------------------------------------------
     DOM: HUD, buffs, toast, panels
     --------------------------------------------------------- */

  function renderBuffs() {
    if (!player) return;
    const entries = [];
    if (player.shield > 0) {
      entries.push({ key: 'shield', label: `护盾 ${Math.ceil(player.shield)}`, color: '#5eead4' });
    }
    if (player.rapid > 0) {
      entries.push({ key: 'rapid', label: `连发 ${Math.ceil(player.rapid)}`, color: '#fbbf24' });
    }
    if (freezeTimer > 0) {
      entries.push({ key: 'freeze', label: `冻结 ${Math.ceil(freezeTimer)}`, color: '#c4b5fd' });
    }

    const signature = entries.map((e) => `${e.key}${e.label}`).join('|');
    if (signature === buffSignature) return;
    buffSignature = signature;

    buffsEl.innerHTML = entries.map((entry) => (
      `<div class="buff" style="--buff-color:${entry.color}"><i></i>${entry.label}</div>`
    )).join('');
  }

  function showToast(text, tone = '', duration = 1600) {
    toastEl.textContent = text;
    toastEl.className = `toast show${tone ? ` ${tone}` : ''}`;
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
      toastEl.classList.remove('show');
    }, duration);
  }

  function hideToast() {
    window.clearTimeout(toastTimeout);
    toastEl.classList.remove('show');
  }

  function showOverlay(html) {
    panel.innerHTML = html;
    panel.scrollTop = 0;
    overlay.classList.remove('is-hidden');
    overlay.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => {
      const primary = panel.querySelector('.primary-btn');
      if (primary) primary.focus({ preventScroll: true });
    }, 30);
  }

  function hideOverlay() {
    overlay.classList.add('is-hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function pauseIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';
  }

  function startHintMarkup() {
    if (isTouch) {
      return `
        <div class="control-item"><span class="keys"><kbd>◈</kbd></span><span>左下方向键驾驶</span></div>
        <div class="control-item"><span class="keys"><kbd>●</kbd></span><span>右下 FIRE 开火</span></div>
        <div class="control-item"><span class="keys"><kbd>Ⅱ</kbd></span><span>随时暂停</span></div>
        <div class="control-item"><span class="keys"><kbd>♪</kbd></span><span>支持音效</span></div>
      `;
    }
    return `
      <div class="control-item"><span class="keys"><kbd>WASD</kbd></span><span>驾驶坦克</span></div>
      <div class="control-item"><span class="keys"><kbd>空格</kbd></span><span>开火</span></div>
      <div class="control-item"><span class="keys"><kbd>P</kbd></span><span>暂停</span></div>
      <div class="control-item"><span class="keys"><kbd>M</kbd></span><span>静音</span></div>
    `;
  }

  function showTitle() {
    const bestLine = best > 0
      ? `<p class="tiny">最高分 ${pad(best, 6)}</p>`
      : '<p class="tiny">按 空格 / Enter 快速开始</p>';

    showOverlay(`
      <p class="eyebrow">Arcade // Defense Protocol</p>
      <h2>守住基地<br><em>击退钢铁洪流</em></h2>
      <p class="lead">五波敌军正在逼近。驾驶霓虹坦克，摧毁所有敌人，别让底部的雄鹰基地沦陷。</p>
      <div class="control-grid">${startHintMarkup()}</div>
      <button class="primary-btn" type="button" data-action="start">
        开始战斗 <span class="btn-icon">▶</span>
      </button>
      ${bestLine}
    `);
    updateHUD();
  }

  function levelPips() {
    let html = '<div class="level-pips" aria-hidden="true">';
    for (let i = 1; i <= MAX_LEVEL; i += 1) {
      let cls = '';
      if (state === 'victory') cls = 'done';
      else if (i < level) cls = 'done';
      else if (i === level) cls = 'current';
      html += `<i class="${cls}"></i>`;
    }
    html += '</div>';
    return html;
  }

  function showPause() {
    showOverlay(`
      <p class="eyebrow">System Paused</p>
      <h2>战斗暂停</h2>
      ${levelPips()}
      <p class="result-note">第 ${level} 波 · 剩余敌军 ${remainingToKill} · 生命 ${lives}</p>
      <button class="primary-btn" type="button" data-action="resume">
        继续战斗 <span class="btn-icon">▷</span>
      </button>
      <div class="panel-actions">
        <button class="ghost-btn" type="button" data-action="restart">重新开始</button>
        <button class="ghost-btn" type="button" data-action="title">退出战斗</button>
      </div>
      <p class="tiny">按 P / Esc 继续</p>
    `);
    sfx.play('click');
  }

  function showGameOver(newBest) {
    const isBase = lastEndReason === 'base';
    const headline = isBase ? '基地沦陷' : '装甲耗尽';
    const note = isBase
      ? '雄鹰基地被摧毁了。下一轮记得优先清理逼近基地的敌人。'
      : '你已用尽全部坦克。防线仍在等待下一位指挥官。';
    const record = newBest ? ' · <span style="color:#fbbf24">新纪录</span>' : '';

    showOverlay(`
      <p class="eyebrow">Mission Failed</p>
      <h2>${headline}</h2>
      <div class="result-score">
        <span>本次得分</span>
        <strong>${pad(score, 6)}</strong>
      </div>
      <p class="result-note">${note}</p>
      ${levelPips()}
      <p class="tiny">抵达第 ${level} 波 · 最高分 ${pad(best, 6)}${record}</p>
      <button class="primary-btn" type="button" data-action="start">
        再来一局 <span class="btn-icon">▶</span>
      </button>
      <div class="panel-actions">
        <button class="ghost-btn" type="button" data-action="title">返回标题</button>
      </div>
      <p class="tiny">按 Enter 快速重开</p>
    `);
    updateHUD();
  }

  function showVictory(newBest) {
    const record = newBest ? ' · <span style="color:#fbbf24">新纪录</span>' : '';
    showOverlay(`
      <p class="eyebrow">Sector Secured</p>
      <h2>防线守住了<br><em>战役完成</em></h2>
      <div class="result-score">
        <span>最终得分</span>
        <strong>${pad(score, 6)}</strong>
      </div>
      <p class="result-note">全部 ${MAX_LEVEL} 波敌军已被击退。霓虹防线再次亮起，基地安然无恙。</p>
      ${levelPips()}
      <p class="tiny">最高分 ${pad(best, 6)}${record}</p>
      <button class="primary-btn" type="button" data-action="start">
        再战一次 <span class="btn-icon">▶</span>
      </button>
      <div class="panel-actions">
        <button class="ghost-btn" type="button" data-action="title">返回标题</button>
      </div>
    `);
    updateHUD();
  }

  /* ---------------------------------------------------------
     Input
     --------------------------------------------------------- */

  function beginDirection(key, dir) {
    if (input.dirPresses.some((entry) => entry.key === key)) return;
    input.dirPresses.push({ key, dir });
  }

  function endDirection(key) {
    const index = input.dirPresses.findIndex((entry) => entry.key === key);
    if (index !== -1) input.dirPresses.splice(index, 1);
  }

  function clearInputs() {
    input.dirPresses.length = 0;
    input.keyboardFire = false;
    input.firePointers.clear();
    document.querySelectorAll('.touch-btn.is-active, .fire-btn.is-active').forEach((el) => {
      el.classList.remove('is-active');
    });
    fireBtn.classList.remove('is-active');
  }

  const KEY_DIRS = {
    ArrowUp: 0,
    KeyW: 0,
    ArrowRight: 1,
    KeyD: 1,
    ArrowDown: 2,
    KeyS: 2,
    ArrowLeft: 3,
    KeyA: 3,
  };

  function togglePause() {
    if (state === 'playing' && !ending) {
      state = 'paused';
      document.body.classList.add('is-paused');
      clearInputs();
      showPause();
    } else if (state === 'paused') {
      state = 'playing';
      document.body.classList.remove('is-paused');
      hideOverlay();
      canvas.focus({ preventScroll: true });
      sfx.play('click');
    }
  }

  function toggleMute() {
    sfx.setEnabled(!sfx.enabled);
    document.body.classList.toggle('is-muted', !sfx.enabled);
    saveNumber('neon-tanks-muted', sfx.enabled ? 0 : 1);
    soundBtn.setAttribute('aria-label', sfx.enabled ? '关闭音效' : '开启音效');
    if (sfx.enabled) sfx.play('click');
  }

  function onKeyDown(event) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const code = event.code;
    const dir = KEY_DIRS[code];

    if (state === 'title') {
      if (code === 'Enter' || code === 'Space') {
        if (event.target.closest && event.target.closest('button')) return;
        event.preventDefault();
        startNewGame();
      }
      return;
    }

    if (state === 'gameover' || state === 'victory') {
      if (code === 'Enter' || code === 'Space') {
        if (event.target.closest && event.target.closest('button')) return;
        event.preventDefault();
        startNewGame();
      }
      return;
    }

    if (code === 'KeyP' || code === 'Escape') {
      if (!event.repeat && (state === 'playing' || state === 'paused')) {
        event.preventDefault();
        togglePause();
      }
      return;
    }

    if (code === 'KeyM') {
      if (!event.repeat) {
        event.preventDefault();
        toggleMute();
      }
      return;
    }

    if (dir !== undefined) {
      event.preventDefault();
      beginDirection(`key-${code}`, dir);
      return;
    }

    if (code === 'Space' || code === 'KeyJ') {
      event.preventDefault();
      if (state === 'playing') input.keyboardFire = true;
    }
  }

  function onKeyUp(event) {
    const code = event.code;
    if (KEY_DIRS[code] !== undefined) {
      endDirection(`key-${code}`);
    }
    if (code === 'Space' || code === 'KeyJ') {
      input.keyboardFire = false;
    }
  }

  function onWindowBlur() {
    clearInputs();
    if (state === 'playing' && !ending) togglePause();
  }

  function setupTouchControls() {
    const buttons = document.querySelectorAll('[data-dir]');
    const pointerDirs = new Map();

    for (const button of buttons) {
      const dir = Number(button.dataset.dir);

      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        button.setPointerCapture(event.pointerId);
        const key = `touch-${event.pointerId}`;
        pointerDirs.set(event.pointerId, { key, dir, button });
        beginDirection(key, dir);
        button.classList.add('is-active');
        sfx.init();
      });

      const release = (event) => {
        const entry = pointerDirs.get(event.pointerId);
        if (!entry) return;
        endDirection(entry.key);
        pointerDirs.delete(event.pointerId);
        entry.button.classList.remove('is-active');
      };

      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    }

    const releaseFire = (event) => {
      input.firePointers.delete(event.pointerId);
      fireBtn.classList.toggle('is-active', input.firePointers.size > 0);
    };

    fireBtn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      fireBtn.setPointerCapture(event.pointerId);
      input.firePointers.add(event.pointerId);
      fireBtn.classList.add('is-active');
      sfx.init();
    });
    fireBtn.addEventListener('pointerup', releaseFire);
    fireBtn.addEventListener('pointercancel', releaseFire);
    fireBtn.addEventListener('lostpointercapture', releaseFire);

    touchPause.addEventListener('click', () => {
      if (state === 'playing' || state === 'paused') togglePause();
    });
  }

  /* ---------------------------------------------------------
     Wiring
     --------------------------------------------------------- */

  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'start') {
      startNewGame();
    } else if (action === 'resume') {
      if (state === 'paused') togglePause();
    } else if (action === 'restart') {
      startNewGame();
    } else if (action === 'title') {
      returnToTitle();
    }
  });

  soundBtn.addEventListener('click', () => {
    toggleMute();
  });

  pauseBtn.addEventListener('click', () => {
    if (state === 'playing' || state === 'paused') togglePause();
  });

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing' && !ending) {
      togglePause();
    }
  });

  window.addEventListener('resize', () => {
    fitCanvas();
  });

  /* ---------------------------------------------------------
     Canvas setup + boot
     --------------------------------------------------------- */

  function fitCanvas() {
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    dpr = nextDpr;
    const width = Math.round(W * dpr);
    const height = Math.round(H * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function detectTouch() {
    // Touchscreen laptops report touch points too, but their primary input is
    // still a mouse. Only surface the on-screen controls for coarse pointers.
    isTouch = window.matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch-enabled', isTouch);
  }

  function boot() {
    detectTouch();
    fitCanvas();
    setupTouchControls();
    document.body.classList.toggle('is-muted', !sfx.enabled);
    soundBtn.setAttribute('aria-label', sfx.enabled ? '关闭音效' : '开启音效');
    buildLevel(1);
    state = 'title';
    updateHUD();
    showTitle();

    // A tiny debug surface helps automated smoke tests and curious tinkerers.
    window.__neonTanks = {
      start: startNewGame,
      togglePause,
      getState: () => ({
        state,
        level,
        score,
        lives,
        remaining: remainingToKill,
        enemies: enemies.length,
        bullets: bullets.length,
        powerups: powerups.length,
        baseAlive,
      }),
      grantShield: () => {
        if (player) player.shield = 30;
      },
    };

    lastFrame = performance.now();
    requestAnimationFrame(loop);
  }

  function loop(timestamp) {
    const dt = Math.min(0.05, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  boot();
})();
