/**
 * Fact Man V2 — Pac-Man maze, 4 coloured ghosts = 4 answer choices.
 * Eat the CORRECT coloured ghost to advance. Eating a wrong ghost loses a life.
 * Controls: Arrow keys / WASD to move.
 * Class: Game_fact_man   Canvas: 320×240
 */
window.Game_fact_man = (function () {
  'use strict';

  /* ── Layout ──────────────────────────────────────────────────── */
  const W = 320, H = 240;
  const HUD_H  = 14;   // score / lives bar
  const Q_H    = 20;   // question text (up to 2 lines)
  const LEG_H  = 26;   // answer legend: 2 rows × 13 px
  const INFO_H = HUD_H + Q_H + LEG_H;   // = 60

  /* ── Maze ────────────────────────────────────────────────────── */
  const CELL = 10;
  const COLS = 32;
  const ROWS = 18;
  const OX   = 0;
  const OY   = INFO_H;   // = 60

  //  # = wall   . = path (dot)   ' ' = ghost-house (no dot, walkable)
const MAP_STR = [
    '################################', // 0
    '#............######............#', // 1
    '#.##########.######.##########.#', // 2
    '#.##########........##########.#', // 3
    '#......##......##......##......#', // 4
    '#.####.##.####.##.####.##.####.#', // 5
    '#......##.###      ###.##......#', // 6
    '######.##.###      ###.##.######', // 7
    '.......##.            .##.......', // 8 (Tunnel Row)
    '######.##.###      ###.##.######', // 9
    '#......##.###      ###.##......#', // 10
    '#.####.##.####.##.####.##.####.#', // 11
    '#......##......##......##......#', // 12
    '#.##########........##########.#', // 13
    '#.##########.######.##########.#', // 14
    '#............######............#', // 15
    '#..............................#', // 16
    '################################', // 17
  ];

  // 1 = wall, 0 = path, 2 = ghost-house open
  const MAP = MAP_STR.map(row =>
    Array.from(row).map(ch => ch === '#' ? 1 : ch === ' ' ? 2 : 0)
  );

function isWall(col, row) {
  // 1. Boundary check: Vertical bounds are always walls
  if (row < 0 || row >= ROWS) return true;

  // 2. Tunnel wrap logic: 
  // If the column is outside the grid (col < 0 or col >= COLS), 
  // we only allow passage if it's on the tunnel row (Row 8).
  if (col < 0 || col >= COLS) {
    return (row === 8) ? false : true; 
  }

  // 3. Standard grid check:
  // Otherwise, strictly check if the specific map cell is a wall (1)
  return MAP[row][col] === 1;
}

  function tileCenter(col, row) {
    return { x: OX + col * CELL + CELL / 2, y: OY + row * CELL + CELL / 2 };
  }

  /* ── Ghost colours & labels ──────────────────────────────────── */
  const GHOST_COLORS = ['#ff4444', '#ff88cc', '#44ddff', '#ffaa44'];
  const ANS_LABELS   = ['A', 'B', 'C', 'D'];

  /* ── Audio ───────────────────────────────────────────────────── */
  let _ac;
  function tone(freq, dur, type = 'sine', vol = 0.08) {
    if (!_ac) return;
    const o = _ac.createOscillator(), g = _ac.createGain();
    o.connect(g); g.connect(_ac.destination);
    o.frequency.value = freq; o.type = type;
    g.gain.setValueAtTime(vol, _ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, _ac.currentTime + dur);
    o.start(); o.stop(_ac.currentTime + dur);
  }
  function sndEat()     { tone(520, 0.04, 'square', 0.03); }
  function sndCorrect() { [523,659,784].forEach((f,i) => setTimeout(() => tone(f,0.15,'sine',0.1), i*100)); }
  function sndWrong()   { tone(180, 0.4, 'sawtooth', 0.15); }

  /* ── Text helper ─────────────────────────────────────────────── */
  function makeT(tc) {
    const S = 2;
    return {
      clear() { tc.clearRect(0, 0, 640, 480); },
      font(f) { tc.font = f.replace(/(\d+(?:\.\d+)?)px/, (_,n) => (n*S)+'px'); },
      fill(v) { tc.fillStyle = v; },
      align(a){ tc.textAlign = a; },
      base(b) { tc.textBaseline = b; },
      alpha(a){ tc.globalAlpha = a; },
      text(t,x,y){ tc.fillText(t, x*S, y*S); },
      w(t)    { return tc.measureText(t).width / S; },
    };
  }

  /* ── Ghost sprite ────────────────────────────────────────────── */
  function drawGhost(c, x, y, r, color) {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y - r * 0.1, r, Math.PI, 0);
    const bot = y + r * 0.85, bH = r * 0.5;
    c.lineTo(x + r, bot);
    c.bezierCurveTo(x+r-r*0.33, bot-bH, x+r*0.33, bot-bH, x,     bot);
    c.bezierCurveTo(x-r*0.33,   bot-bH, x-r+r*0.33, bot-bH, x-r, bot);
    c.closePath(); c.fill();
    c.fillStyle = 'white';
    c.beginPath(); c.arc(x - r*0.3,  y - r*0.15, r*0.27, 0, Math.PI*2); c.fill();
    c.beginPath(); c.arc(x + r*0.3,  y - r*0.15, r*0.27, 0, Math.PI*2); c.fill();
    c.fillStyle = '#112';
    c.beginPath(); c.arc(x - r*0.18, y - r*0.1,  r*0.14, 0, Math.PI*2); c.fill();
    c.beginPath(); c.arc(x + r*0.42, y - r*0.1,  r*0.14, 0, Math.PI*2); c.fill();
  }

  /* ══════════════════════════════════════════════════════════════
     GAME CLASS
  ══════════════════════════════════════════════════════════════ */
  class FactMan {
    constructor(canvas, ctx, data, textCtx) {
      this.canvas = canvas;
      this.ctx    = ctx;
      this.T      = makeT(textCtx);
      const raw   = data.fact_man_data || [];
      this.questions = raw.length ? raw : [
        { question: 'No data.json found', options: ['A','B','C','D'], correct: 0 }
      ];
      this._keys  = {};
      this._raf   = null;
    }

    start() {
      try { _ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
      this._onKey   = e => { this._keys[e.code] = true;  this._keys[e.key] = true;  };
      this._onKeyUp = e => { this._keys[e.code] = false; this._keys[e.key] = false; };
      document.addEventListener('keydown', this._onKey);
      document.addEventListener('keyup',   this._onKeyUp);
      this._resetGame();
      this._loop();
    }

    destroy() {
      cancelAnimationFrame(this._raf);
      document.removeEventListener('keydown', this._onKey);
      document.removeEventListener('keyup',   this._onKeyUp);
    }

    /* ── Game state ─────────────────────────────────────────────── */
    _resetGame() {
      this.score  = 0;
      this.lives  = 3;
      this.phase  = 'playing';
      this.qIndex = 0;
      this.pool   = [...this.questions].sort(() => Math.random() - 0.5);
      this._makeDots();
      this._loadQuestion();
    }

    _makeDots() {
      this.dots = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (MAP[r][c] === 0) {
            const p = tileCenter(c, r);
            this.dots.push({ col: c, row: r, x: p.x, y: p.y, eaten: false });
          }
        }
      }
    }

    _loadQuestion() {
      if (this.qIndex >= this.pool.length) { this.phase = 'win'; return; }
      const q = this.pool[this.qIndex];
      this.question = q.question;

      // Build shuffled 4-option list, track which is correct
      const opts = q.options.map((text, i) => ({ text, correct: i === q.correct }))
                            .sort(() => Math.random() - 0.5)
                            .slice(0, 4);
      while (opts.length < 4) opts.push({ text: '?', correct: false });
      this.ghostAnswers = opts;   // ghostAnswers[i] → ghost with GHOST_COLORS[i]

      this.resultMsg   = '';
      this.resultT     = 0;
      this.resultColor = '#3ddc84';
      this.locked      = false;
      this.restartBound = false;

      this._spawnPlayer();
      this._spawnGhosts();
      this._keys = {};       // clear so a held key doesn't skip the ready screen
      this.phase = 'ready';
    }

    _spawnPlayer() {
      const pos = tileCenter(15, 16);
      this.player = {
        col: 15, row: 16, x: pos.x, y: pos.y,
        tx: 15, ty: 16,
        dx: 0, dy: 0, ndx: 0, ndy: -1,
        speed: 0.13,
        progress: 1.0,
        mouth: 0.3, mouthD: 0.06, angle: -Math.PI / 2,
        invincT: 0,
      };
    }

    _spawnGhosts() {
      // Staggered spawns inside ghost house, exit to left or right corridor
      const spawns = [
        { col: 13, row:  9, exitCol: 10, delay:   0 },
        { col: 15, row:  9, exitCol: 21, delay:  35 },
        { col: 13, row: 10, exitCol: 10, delay:  70 },
        { col: 15, row: 10, exitCol: 21, delay: 105 },
      ];
      const speeds = [0.065, 0.055, 0.060, 0.050];
      this.ghosts = spawns.map((sp, i) => {
        const pos = tileCenter(sp.col, sp.row);
        return {
          idx: i,
          col: sp.col, row: sp.row, x: pos.x, y: pos.y,
          tx: sp.col,  ty: sp.row,
          dx: 0, dy: 0,
          speed: speeds[i],
          progress: 1.0,
          delay: sp.delay,
          exitCol: sp.exitCol,
          exitPhase: 0,   // 0=descend, 1=go horizontal, 2=ascend, then free
          exited: false,
          alive: true,
        };
      });
    }

    /* ── Update ──────────────────────────────────────────────────── */
    _loop() {
      this._raf = requestAnimationFrame(() => { this._update(); this._draw(); this._loop(); });
    }

    _update() {
      if (this.phase === 'ready') {
        if (this._keys['Space'] || this._keys[' ']) {
          this.phase = 'playing';
        }
        return;
      }
      if (this.phase === 'playing') {
        if (!this.locked) this._updatePlayer();
        this._updateGhosts();
        if (!this.locked) this._checkCollisions();
      }
      if ((this.phase === 'gameover' || this.phase === 'win') && !this.restartBound) {
        if (this._keys['Enter']) {
          this.restartBound = true;
          setTimeout(() => { this._resetGame(); }, 80);
        }
      }
    }

    _updatePlayer() {
      const p = this.player, k = this._keys;

      // 1. Update intended direction
      if (k['ArrowLeft']  || k['a']) { p.ndx = -1; p.ndy = 0; }
      if (k['ArrowRight'] || k['d']) { p.ndx =  1; p.ndy = 0; }
      if (k['ArrowUp']    || k['w']) { p.ndx =  0; p.ndy = -1; }
      if (k['ArrowDown']  || k['s']) { p.ndx =  0; p.ndy =  1; }

      if (p.invincT > 0) p.invincT--;

      // 2. Movement Processing
      if (p.progress >= 1.0) {
        p.col = p.tx; p.row = p.ty;

        // Tunnel Wrap Logic: If we step out of bounds, snap to opposite side
        if (p.col < 0) p.col = COLS - 1;
        else if (p.col >= COLS) p.col = 0;

        const pos = tileCenter(p.col, p.row);
        p.x = pos.x; p.y = pos.y;
        p.tx = p.col; p.ty = p.row;

        // Determine if we can turn into the new intended direction
        if ((p.ndx || p.ndy) && !isWall(p.col + p.ndx, p.row + p.ndy)) {
          p.dx = p.ndx; p.dy = p.ndy;
        }

        // Attempt to move in current direction
        if ((p.dx || p.dy) && !isWall(p.col + p.dx, p.row + p.dy)) {
          p.tx = p.col + p.dx;
          p.ty = p.row + p.dy;
          p.progress = 0;
          p.angle = Math.atan2(p.dy, p.dx);
        } else {
          p.dx = 0; p.dy = 0; // Collision: Stop
        }

        // Dot interaction
        const d = this.dots.find(d => !d.eaten && d.col === p.col && d.row === p.row);
        if (d) { d.eaten = true; this.score += 10; sndEat(); }
      } else {
        // Interpolate visual position between tiles
        p.progress = Math.min(1.0, p.progress + p.speed);
        const from = tileCenter(p.col, p.row);
        const to = tileCenter(p.tx, p.ty);
        p.x = from.x + (to.x - from.x) * p.progress;
        p.y = from.y + (to.y - from.y) * p.progress;
      }

      // Mouth animation
      p.mouth += p.mouthD;
      if (p.mouth > 0.35 || p.mouth < 0.04) p.mouthD *= -1;
    }

    _updateGhosts() {
      this.ghosts.forEach(g => {
        if (!g.alive) return;
        if (g.delay > 0) { g.delay--; return; }

        if (g.progress >= 1.0) {
          g.col = g.tx; g.row = g.ty;
          const pos = tileCenter(g.col, g.row);
          g.x = pos.x; g.y = pos.y;
          this._ghostChooseDir(g);
        } else {
          g.progress = Math.min(1.0, g.progress + g.speed);
          const from = tileCenter(g.col, g.row), to = tileCenter(g.tx, g.ty);
          g.x = from.x + (to.x - from.x) * g.progress;
          g.y = from.y + (to.y - from.y) * g.progress;
        }
      });
    }

  _ghostChooseDir(g) {
    const DIRS = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];

    // --- 1. Exit Logic ---
    if (!g.exited) {
      // Basic logic to get out of the house
      if (g.row > 5 && !isWall(g.col, g.row - 1)) {
          g.dx = 0; g.dy = -1; g.tx = g.col; g.ty = g.row - 1; g.progress = 0; return;
      } else {
          g.exited = true;
      }
    }

    // --- 2. Free Roam / Tunnel Logic ---
    const rev = { dx: -g.dx, dy: -g.dy };
    
    // Find valid moves
    let moves = DIRS.filter(d => !isWall(g.col + d.dx, g.row + d.dy));

    // Remove reversals ONLY if we have other options
    let nonReverseMoves = moves.filter(d => !(d.dx === rev.dx && d.dy === rev.dy));
    if (nonReverseMoves.length > 0) {
        moves = nonReverseMoves;
    }

    // AI Chasing (only if not stuck)
    if (this.player && Math.random() < 0.2) {
        moves.sort((a, b) => {
            const distA = Math.hypot(g.col + a.dx - this.player.col, g.row + a.dy - this.player.row);
            const distB = Math.hypot(g.col + b.dx - this.player.col, g.row + b.dy - this.player.row);
            return distA - distB;
        });
    } else {
        moves.sort(() => Math.random() - 0.5);
    }

    const m = moves[0];
    g.dx = m.dx; g.dy = m.dy;
    
    // Update target, handle wrap-around
    let nextCol = g.col + m.dx;
    if (nextCol < 0) nextCol = COLS - 1;
    if (nextCol >= COLS) nextCol = 0;

    g.tx = nextCol;
    g.ty = g.row + m.dy;
    g.progress = 0;
  }

    /* ── Collision ───────────────────────────────────────────────── */
    _checkCollisions() {
      const p = this.player;
      if (p.invincT > 0) return;

      for (const g of this.ghosts) {
        if (!g.alive) continue;
        if (Math.hypot(g.x - p.x, g.y - p.y) < CELL * 0.85) {
          g.alive = false;
          this.locked = true;

          const ans = this.ghostAnswers[g.idx];
          if (ans && ans.correct) {
            sndCorrect();
            this.score += 200;
            this.resultMsg   = '✓ CORRECT!';
            this.resultColor = '#3ddc84';
            this.resultT     = 70;
            // Kill remaining ghosts visually
            this.ghosts.forEach(gg => { gg.alive = false; });
            setTimeout(() => {
              this.locked = false;
              this.qIndex++;
              this._loadQuestion();
            }, 900);
          } else {
            sndWrong();
            this.lives--;
            this.resultMsg   = '✗ WRONG!';
            this.resultColor = '#e05252';
            this.resultT     = 70;
            if (this.lives <= 0) {
              setTimeout(() => { this.phase = 'gameover'; }, 900);
            } else {
              setTimeout(() => {
                this.locked = false;
                this._spawnPlayer();
                this._spawnGhosts();
                this.resultT = 0;
              }, 900);
            }
          }
          break;
        }
      }
    }

    /* ── Draw ────────────────────────────────────────────────────── */
    _draw() {
      const { ctx: c, T } = this;
      T.clear();
      c.fillStyle = '#06060f';
      c.fillRect(0, 0, W, H);

      this._drawInfo();
      this._drawMaze();
      this._drawDots();
      this._drawGhosts();
      this._drawPlayer();
      if (this.resultT > 0) { this._drawResult(); this.resultT--; }

      if (this.phase === 'ready')    this._drawReadyOverlay();
      if (this.phase === 'gameover') this._drawOverlay('GAME OVER', '#e05252');
      if (this.phase === 'win')      this._drawOverlay('YOU WIN!',  '#3ddc84');
    }

    _drawInfo() {
      const { ctx: c, T } = this;
      c.fillStyle = '#0c0c1d';
      c.fillRect(0, 0, W, INFO_H);

      /* HUD row */
      T.font('10px monospace'); T.fill('#c9d1d9'); T.align('left');
      T.text(`SCO: ${this.score}`, 4, HUD_H - 2);
      T.fill('#e05252'); T.align('right');
      T.text('♥'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, 3 - this.lives)), W - 4, HUD_H - 2);
      // progress bar
      c.fillStyle = '#222244'; c.fillRect(4, HUD_H - 1, W - 8, 2);
      c.fillStyle = '#58a6ff';
      c.fillRect(4, HUD_H - 1, Math.round((this.qIndex / this.pool.length) * (W - 8)), 2);

      /* Question */
      if (this.question) {
        T.font('bold 10px monospace'); T.fill('#ffffff'); T.align('center');
        const words = this.question.split(' ');
        let line = '', lines = [];
        for (const w of words) {
          const test = line ? line + ' ' + w : w;
          if (T.w(test) > W - 12) { if (line) lines.push(line); line = w; } else line = test;
        }
        if (line) lines.push(line);
        lines.slice(0, 2).forEach((l, i) => T.text(l, W / 2, HUD_H + 10 + i * 11));
      }

      /* Legend — 2 rows, 2 answers per row (160 px wide each) */
      if (this.ghostAnswers) {
        const legY0 = HUD_H + Q_H;       // row 1: A + B
        const legY1 = legY0 + LEG_H / 2; // row 2: C + D

        [0, 1, 2, 3].forEach(i => {
          const col = i % 2;               // 0 = left, 1 = right
          const rowY = i < 2 ? legY0 : legY1;
          const bx   = col * (W / 2);
          const rH   = LEG_H / 2;
          const ans  = this.ghostAnswers[i];

          // Background tint
          c.fillStyle = GHOST_COLORS[i] + '22';
          c.fillRect(bx, rowY, W / 2, rH);

          // Colour stripe
          c.fillStyle = GHOST_COLORS[i];
          c.fillRect(bx, rowY, 5, rH);

          // Label letter
          T.font('bold 9px monospace'); T.fill(GHOST_COLORS[i]); T.align('left');
          T.text(ANS_LABELS[i] + ':', bx + 8, rowY + rH / 2 + 1);

          // Answer text (truncated to fit 148 px)
          T.font('9px monospace'); T.fill('#eef4ff'); T.align('left');
          let txt = (ans && ans.text) ? ans.text : '?';
          while (T.w(txt) > W / 2 - 28 && txt.length > 2) txt = txt.slice(0, -1);
          if (txt !== ((ans && ans.text) ? ans.text : '?')) txt += '…';
          T.text(txt, bx + 26, rowY + rH / 2 + 1);
        });

        // Dividers
        c.strokeStyle = '#2a2a4a'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(W / 2, legY0); c.lineTo(W / 2, legY0 + LEG_H); c.stroke();
        c.beginPath(); c.moveTo(0, legY1); c.lineTo(W, legY1); c.stroke();
        c.strokeStyle = '#3a3a6a';
        c.beginPath(); c.moveTo(0, INFO_H); c.lineTo(W, INFO_H); c.stroke();
      }
    }

_drawMaze() {
  const c = this.ctx;
  c.strokeStyle = '#2222ff';
  c.lineWidth = 4;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  c.beginPath(); // One single path for everything

  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      if (MAP[r][col] !== 1) continue;

      const x = OX + col * CELL + CELL / 2;
      const y = OY + r * CELL + CELL / 2;

      // Check if neighbors are walls
      const right = (col < COLS - 1 && MAP[r][col + 1] === 1);
      const down  = (r < ROWS - 1 && MAP[r + 1][col + 1 === undefined ? 0 : r + 1][col] === 1); 
      // Note: Simplified logic here for standard grid
      const downSimple = (r < ROWS - 1 && MAP[r + 1][col] === 1);

      // Draw horizontal segment if right neighbor is wall
      if (right) {
        c.moveTo(x, y);
        c.lineTo(x + CELL, y);
      }
      // Draw vertical segment if down neighbor is wall
      if (downSimple) {
        c.moveTo(x, y);
        c.lineTo(x, y + CELL);
      }
    }
  }
  c.stroke(); // Stroke once at the very end
}

    _drawDots() {
      const c = this.ctx;
      c.fillStyle = '#33335a';
      this.dots.forEach(d => { if (!d.eaten) c.fillRect(d.x - 1, d.y - 1, 2, 2); });
    }

    _drawGhosts() {
      const { ctx: c, T } = this;
      this.ghosts.forEach(g => {
        if (!g.alive) return;
        if (g.delay > 0) return;   // still waiting to spawn
        const r = CELL * 0.44;
        drawGhost(c, g.x, g.y, r, GHOST_COLORS[g.idx]);
        // Answer label above ghost
        T.font('bold 9px monospace'); T.fill('#fff'); T.align('center');
        T.text(ANS_LABELS[g.idx], g.x, g.y - r - 1);
      });
    }

    _drawPlayer() {
      const p = this.player, c = this.ctx;
      if (p.invincT > 0 && Math.floor(p.invincT / 6) % 2 === 0) return;
      c.fillStyle = '#ffe066';
      c.beginPath(); c.moveTo(p.x, p.y);
      c.arc(p.x, p.y, CELL * 0.44, p.angle + p.mouth, p.angle + Math.PI * 2 - p.mouth);
      c.closePath(); c.fill();
    }

    _drawReadyOverlay() {
      const { ctx: c, T } = this;
      c.fillStyle = 'rgba(0,0,0,0.65)';
      c.fillRect(0, OY, W, H - OY);
      T.font('bold 14px monospace'); T.fill('#ffe066'); T.align('center');
      T.text('Press A to start', W / 2, OY + (H - OY) / 2);
    }

    _drawResult() {
      const { T } = this;
      T.alpha(Math.min(1, this.resultT / 20));
      T.fill(this.resultColor); T.font('bold 17px monospace'); T.align('center');
      T.text(this.resultMsg, W / 2, OY + (H - OY) / 2 + 4);
      T.alpha(1);
    }

    _drawOverlay(title, color) {
      const { ctx: c, T } = this;
      c.fillStyle = 'rgba(0,0,0,0.80)';
      c.fillRect(0, OY, W, H - OY);
      T.font('bold 26px monospace'); T.fill(color); T.align('center');
      T.text(title, W / 2, OY + (H - OY) / 2 - 24);
      T.font('12px monospace'); T.fill('#c9d1d9');
      T.text(`Score: ${this.score}`, W / 2, OY + (H - OY) / 2 - 4);
      T.font('10px monospace'); T.fill('#8888aa');
      T.text('[B / Enter] to play again', W / 2, OY + (H - OY) / 2 + 14);
    }
  }

  return FactMan;
})();
