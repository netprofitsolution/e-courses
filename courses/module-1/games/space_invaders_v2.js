/**
 * Space Invaders V2 — 320×240 canvas, mobile-first
 * Class: Game_space_invaders
 * Controls: ArrowLeft/Right to move, Space to shoot
 * Data: data.json → space_brain_data.questions
 *   Each question: { question, answers: [{text, icon, isCorrect}] }
 * 4th arg: textCtx — 640×480 canvas for crisp text rendering
 */
window.Game_space_invaders = (function () {
  'use strict';

  /* ── Audio ──────────────────────────────────────────────────── */
  let _ac;
  function tone(freq, dur, type = 'square', vol = 0.08) {
    if (!_ac) return;
    const o = _ac.createOscillator(), g = _ac.createGain();
    o.connect(g); g.connect(_ac.destination);
    o.frequency.value = freq; o.type = type;
    g.gain.setValueAtTime(vol, _ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, _ac.currentTime + dur);
    o.start(); o.stop(_ac.currentTime + dur);
  }
  function sndShoot()   { tone(900, 0.08, 'square', 0.06); }
  function sndHit()     { tone(400, 0.08); setTimeout(() => tone(250, 0.1, 'triangle'), 80); }
  function sndCorrect() { [523,659,784].forEach((f,i) => setTimeout(() => tone(f, 0.15, 'sine', 0.1), i*120)); }
  function sndWrong()   { tone(180, 0.4, 'sawtooth', 0.15); }
  function sndOver()    { for (let i=0;i<15;i++) setTimeout(() => tone(380-i*20, 0.08, 'sine',0.05), i*60); }

  /* ── Palette ────────────────────────────────────────────────── */
  const C = {
    bg:      '#050510',
    player:  '#58a6ff',
    bullet:  '#ffe066',
    correct: '#3ddc84',
    wrong:   '#e05252',
    text:    '#c9d1d9',
    dim:     '#8888aa',
    hud:     '#8b949e',
    accent:  '#58a6ff',
  };

  /* ── Pixel-art player ship ──────────────────────────────────── */
  const SHIP_W = 14, SHIP_H = 10;
  function drawShip(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(x - SHIP_W/2, y - SHIP_H/2);
    const pixels = [
      [3,0],
      [2,1],[3,1],[4,1],
      [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
      [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],
      [0,4],[2,4],[4,4],[6,4],
    ];
    pixels.forEach(([px,py]) => ctx.fillRect(px*2, py*2, 2, 2));
    ctx.restore();
  }

  /* ── Invader sprite ─────────────────────────────────────────── */
  const INV_W = 24, INV_H = 16;
  function drawInvader(ctx, x, y, color, frame) {
    const pixels0 = [
      [1,0],[4,0],
      [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],
      [0,2],[1,2],[3,2],[4,2],[5,2],
      [1,3],[2,3],[3,3],[4,3],
      [1,4],[4,4],
    ];
    const pixels1 = [
      [1,0],[4,0],
      [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],
      [0,2],[2,2],[3,2],[5,2],
      [1,3],[2,3],[3,3],[4,3],
      [0,4],[2,4],[3,4],[5,4],
    ];
    const px = frame % 2 === 0 ? pixels0 : pixels1;
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(x - INV_W/2, y - INV_H/2);
    px.forEach(([dx,dy]) => ctx.fillRect(dx*4, dy*3, 4, 3));
    ctx.restore();
  }

  /* ── Stars ──────────────────────────────────────────────────── */
  function makeStars(n) {
    return Array.from({length:n}, () => ({
      x: Math.random() * 320,
      y: Math.random() * 240,
      s: Math.random() * 1.5 + 0.5,
      b: Math.random(),
    }));
  }

  /* ── Text helper (draws on 2× canvas) ──────────────────────── */
  function makeT(tc) {
    const S = 2;
    return {
      clear() { tc.clearRect(0, 0, 640, 480); },
      font(f) { tc.font = f.replace(/(\d+(?:\.\d+)?)px/, (_,n) => (n*S)+'px'); },
      fill(v) { tc.fillStyle = v; },
      align(a){ tc.textAlign = a; },
      base(b) { tc.textBaseline = b; },
      alpha(a){ tc.globalAlpha = a; },
      stroke(v){ tc.strokeStyle = v; },
      lw(v)   { tc.lineWidth = v*S; },
      text(t,x,y){ tc.fillText(t, x*S, y*S); },
      w(t)    { return tc.measureText(t).width / S; },
    };
  }

  /* ══════════════════════════════════════════════════════════════
     GAME CLASS
  ══════════════════════════════════════════════════════════════ */
  class SpaceInvaders {
    constructor(canvas, ctx, data, textCtx) {
      this.canvas  = canvas;
      this.ctx     = ctx;
      this.T       = makeT(textCtx);
      this.W       = 320;
      this.H       = 240;

      const raw = (data.space_brain_data && data.space_brain_data.questions) || [];
      this.questions = raw.length ? raw : [
        { question: 'No data.json found', answers: [
            {text:'OK', icon:'✓', isCorrect:true},
            {text:'?',  icon:'?', isCorrect:false},
            {text:'!',  icon:'!', isCorrect:false},
          ]}
      ];

      this._keys    = {};
      this._raf     = null;
      this._onKey   = null;
      this.stars    = makeStars(40);
    }

    start() {
      try { _ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
      this._bindKeys();
      this._resetGame();
      this._loop();
    }

    destroy() {
      cancelAnimationFrame(this._raf);
      if (this._onKey) {
        document.removeEventListener('keydown', this._onKey);
        document.removeEventListener('keyup',   this._onKeyUp);
      }
    }

    _bindKeys() {
      this._onKey    = e => { this._keys[e.code] = true;  this._keys[e.key] = true;  };
      this._onKeyUp  = e => { this._keys[e.code] = false; this._keys[e.key] = false; };
      document.addEventListener('keydown', this._onKey);
      document.addEventListener('keyup',   this._onKeyUp);
    }

    _resetGame() {
      this.score    = 0;
      this.lives    = 3;
      this.phase    = 'playing';
      this.qIndex   = 0;
      this._shuffle();
      this._loadQuestion();
    }

    _shuffle() {
      this.pool = [...this.questions].sort(() => Math.random() - 0.5);
    }

    _loadQuestion() {
      if (this.qIndex >= this.pool.length) { this.phase = 'win'; return; }
      const q = this.pool[this.qIndex];
      this.question = q.question;

      const answers = [...q.answers].sort(() => Math.random() - 0.5).slice(0, 3);
      const spacing = this.W / (answers.length + 1);

      this.invaders = answers.map((a, i) => ({
        x:       spacing * (i + 1),
        y:       30,
        dx:      (i % 2 === 0 ? 1 : -1) * 0.6,
        text:    a.text,
        icon:    a.icon || '',
        correct: a.isCorrect,
        alive:   true,
        frame:   0,
        frameT:  0,
        color:   '#cc88ff',
        explodeT: 0,
        exploding: false,
      }));

      this.bullet       = null;
      this.shotCooldown = 0;
      this.resultMsg    = '';
      this.resultT      = 0;

      if (!this.player) this.player = { x: this.W / 2, y: this.H - 20 };
    }

    _loop() {
      this._raf = requestAnimationFrame(() => {
        this._update();
        this._draw();
        this._loop();
      });
    }

    _update() {
      if (this.phase === 'playing') this._updatePlaying();
    }

    _updatePlaying() {
      const px = this.player;
      const spd = 2.5;
      if ((this._keys['ArrowLeft']  || this._keys['a']) && px.x > SHIP_W/2)         px.x -= spd;
      if ((this._keys['ArrowRight'] || this._keys['d']) && px.x < this.W - SHIP_W/2) px.x += spd;

      this.shotCooldown = Math.max(0, this.shotCooldown - 1);
      if ((this._keys[' '] || this._keys['Space']) && !this.bullet && this.shotCooldown === 0) {
        this.bullet = { x: px.x, y: px.y - SHIP_H/2 };
        this.shotCooldown = 18;
        sndShoot();
      }

      if (this.bullet) {
        this.bullet.y -= 5;
        if (this.bullet.y < 0) this.bullet = null;
      }

      this.invaders.forEach(inv => {
        if (!inv.alive) return;
        inv.x += inv.dx;
        if (inv.x < INV_W/2 || inv.x > this.W - INV_W/2) inv.dx *= -1;
        inv.frameT++;
        if (inv.frameT % 30 === 0) inv.frame++;
        inv.y += 0.08;
        if (inv.y > this.H - 40) { this._loseLife('INVASION!'); return; }
      });

      if (this.bullet) {
        for (const inv of this.invaders) {
          if (!inv.alive) continue;
          if (Math.abs(this.bullet.x - inv.x) < INV_W/2 &&
              Math.abs(this.bullet.y - inv.y) < INV_H/2) {
            this.bullet = null;
            inv.alive   = false;
            if (inv.correct) {
              sndCorrect(); this.score += 100;
              this.resultMsg = '✓ CORRECT!'; this.resultColor = C.correct;
              setTimeout(() => this._nextQuestion(), 900);
            } else {
              sndWrong(); this.lives--;
              this.resultMsg = '✗ WRONG!'; this.resultColor = C.wrong;
              if (this.lives <= 0) setTimeout(() => { this.phase = 'gameover'; sndOver(); }, 600);
              else setTimeout(() => this._reloadInvaders(), 800);
            }
            this.resultT = 60;
            break;
          }
        }
      }

      if (this.resultT > 0) this.resultT--;
      this.stars.forEach(s => { s.y += 0.3; if (s.y > this.H) s.y = 0; });
    }

    _loseLife(msg) {
      this.lives--;
      this.resultMsg = msg; this.resultColor = C.wrong; this.resultT = 80;
      if (this.lives <= 0) setTimeout(() => { this.phase = 'gameover'; sndOver(); }, 700);
      else setTimeout(() => this._loadQuestion(), 900);
    }

    _reloadInvaders() { this._loadQuestion(); this.qIndex--; this._loadQuestion(); }
    _nextQuestion()   { this.qIndex++; this._loadQuestion(); }

    /* ── Drawing ──────────────────────────────────────────────── */
    _draw() {
      const { ctx: c, T, W, H } = this;
      T.clear();

      c.fillStyle = C.bg;
      c.fillRect(0, 0, W, H);

      this.stars.forEach(s => {
        c.fillStyle = `rgba(255,255,255,${0.4 + s.b * 0.6})`;
        c.fillRect(s.x, s.y, s.s, s.s);
      });

      if (this.phase === 'playing' || this.phase === 'result') {
        this._drawHUD();
        this._drawQuestion();
        this._drawInvaders();
        this._drawPlayer();
        this._drawBullet();
        this._drawResultMsg();
      } else if (this.phase === 'gameover') {
        this._drawOverlay('GAME OVER', `Score: ${this.score}`, C.wrong);
      } else if (this.phase === 'win') {
        this._drawOverlay('YOU WIN!', `Score: ${this.score}`, C.correct);
      }
    }

    _drawHUD() {
      const { ctx: c, T, W } = this;
      T.font('10px monospace'); T.fill(C.hud);
      T.align('left');  T.text(`SCO: ${this.score}`, 4, 10);
      T.align('right');
      const hearts = '♥'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, 3 - this.lives));
      T.fill(C.wrong); T.text(hearts, W - 4, 10);
      // Progress bar (on game canvas)
      c.fillStyle = '#222244'; c.fillRect(4, 14, W - 8, 3);
      c.fillStyle = C.accent;
      c.fillRect(4, 14, Math.round((this.qIndex / this.pool.length) * (W - 8)), 3);
    }

    _drawQuestion() {
      const { T, W } = this;
      if (!this.question) return;
      T.font('bold 11px monospace'); T.fill(C.text); T.align('center');
      const words = this.question.split(' ');
      let line = '', lines = [], maxW = W - 20;
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (T.w(test) > maxW) { if (line) lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      lines.forEach((l, i) => T.text(l, W/2, 24 + i * 12));
    }

    _drawInvaders() {
      const { ctx: c, T } = this;
      this.invaders.forEach(inv => {
        if (!inv.alive) return;
        drawInvader(c, inv.x, inv.y, inv.color, inv.frame);
        T.fill('#ffffff'); T.font('bold 10px monospace'); T.align('center');
        T.text(inv.icon + ' ' + inv.text, inv.x, inv.y + INV_H/2 + 10);
      });
    }

    _drawPlayer() { drawShip(this.ctx, this.player.x, this.player.y, C.player); }

    _drawBullet() {
      if (!this.bullet) return;
      const c = this.ctx;
      c.fillStyle = C.bullet;
      c.fillRect(this.bullet.x - 1, this.bullet.y - 4, 2, 8);
      c.fillStyle = 'rgba(255,224,102,0.3)';
      c.fillRect(this.bullet.x - 2, this.bullet.y - 4, 4, 8);
    }

    _drawResultMsg() {
      if (!this.resultMsg || this.resultT <= 0) return;
      const { T, W, H } = this;
      T.alpha(Math.min(1, this.resultT / 20));
      T.fill(this.resultColor); T.font('bold 17px monospace'); T.align('center');
      T.text(this.resultMsg, W/2, H/2);
      T.alpha(1);
    }

    _drawOverlay(title, sub, color) {
      const { ctx: c, T, W, H } = this;
      const isGameOver = title === 'GAME OVER';

      c.fillStyle = 'rgba(0,0,0,0.82)';
      c.fillRect(0, 0, W, H);

      T.font('bold 26px monospace'); T.align('center');
      T.fill(color); T.text(title, W/2, H/2 - 48);
      T.font('12px monospace'); T.fill(C.text);
      T.text(sub, W/2, H/2 - 30);

      if (isGameOver) {
        const period = 1800;
        const phase  = (Date.now() % period) / period;
        const slotX  = W/2 - 12, slotY = H/2 - 4;

        // Coin slot housing (on game canvas — it's a graphic)
        c.fillStyle = '#0a0a18';
        c.beginPath(); c.roundRect(slotX - 6, slotY - 4, 36, 22, 3); c.fill();
        c.strokeStyle = '#333355'; c.lineWidth = 1; c.stroke();
        c.fillStyle = '#000'; c.fillRect(slotX, slotY, 24, 5);

        if (phase < 0.55) {
          const drop  = phase / 0.55;
          const coinY = H/2 - 32 + drop * 28;
          const squish = drop > 0.85 ? 1 - (drop - 0.85) / 0.15 * 0.35 : 1;
          c.save();
          c.translate(W/2, coinY); c.scale(1, squish);
          const gold = c.createRadialGradient(-3,-3,1,0,0,9);
          gold.addColorStop(0,'#ffe566'); gold.addColorStop(1,'#c8860a');
          c.fillStyle = gold;
          c.beginPath(); c.arc(0,0,9,0,Math.PI*2); c.fill();
          // coin label on text canvas (scaled into coin coords — use game canvas for this tiny glyph)
          c.fillStyle = 'rgba(0,0,0,0.35)';
          c.font = 'bold 11px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('¢', 0, 0); c.textBaseline = 'alphabetic';
          c.restore();
        }

        const blink = Math.sin(Date.now() / 380) > 0;
        T.font('bold 11px monospace');
        T.fill(blink ? C.accent : C.dim); T.text('INSERT COIN', W/2, H/2 + 28);
        T.font('10px monospace'); T.fill(C.dim);
        T.text('press [B] to drop a coin', W/2, H/2 + 44);
      } else {
        T.font('10px monospace'); T.fill(C.dim);
        T.text('press [B] to play again', W/2, H/2 - 10);
      }

      if (!this._restartBound) {
        this._restartBound = true;
        const handler = e => {
          if (e.code === 'Enter') {
            document.removeEventListener('keydown', handler);
            this._restartBound = false;
            this._resetGame();
          }
        };
        document.addEventListener('keydown', handler);
      }
    }
  }

  return SpaceInvaders;
})();
