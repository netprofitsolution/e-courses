// ── Space Brains v2 ───────────────────────────────────────────────────────────
// Shoot the CORRECT answer pod. Wrong pod or pod reaching ship = game over.
// Controls: Left/Right = move ship, A/Space = shoot, B/Enter = restart.
// Uses space_brain_data from data.json.  Canvas: 320×240

window.Game_space_brains = function (canvas, ctx, data, textCtx) {
  var c    = ctx;
  var W    = 320, H = 240;
  var raf  = null;

  // ── Hi-res text canvas (2×) ────────────────────────────────────────────────
  var TC = textCtx, TS = 2;
  function tClear() { TC.clearRect(0, 0, 640, 480); }
  function tFont(f) { TC.font = f.replace(/(\d+(?:\.\d+)?)px/, function(_,n){ return (n*TS)+'px'; }); }
  function tFill(v) { TC.fillStyle = v; }
  function tAlign(a){ TC.textAlign = a; }
  function tAlpha(a){ TC.globalAlpha = a; }
  function tText(t,x,y){ TC.fillText(t, x*TS, y*TS); }
  function tW(t)    { return TC.measureText(t).width / TS; }

  var questions = [];
  if (data && data.space_brain_data && data.space_brain_data.questions) {
    questions = data.space_brain_data.questions.slice();
  }
  if (!questions.length) {
    questions = [{ question: 'No data', answers: [
      { text:'True', icon:'✅', isCorrect:true },
      { text:'False',icon:'❌', isCorrect:false }
    ]}];
  }

  // ── Audio ──────────────────────────────────────────────────────────────────
  var ac = null;
  function initAudio() {
    if (ac) return;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
  }
  function tone(freq, dur, type, vol) {
    if (!ac) return;
    var o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.frequency.value = freq; o.type = type || 'square';
    g.gain.setValueAtTime(vol || 0.07, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.start(ac.currentTime); o.stop(ac.currentTime + dur);
  }
  function sndShoot()  { tone(900,0.08,'square',0.05); setTimeout(function(){tone(1100,0.05,'square',0.03);},40); }
  function sndHit()    { tone(440,0.15,'sine',0.1); setTimeout(function(){tone(550,0.1,'sine',0.08);},100); setTimeout(function(){tone(660,0.15,'sine',0.06);},200); }
  function sndWrong()  { tone(180,0.3,'sawtooth',0.15); setTimeout(function(){tone(130,0.4,'sawtooth',0.12);},200); }
  function sndDrop()   { tone(300,0.2,'square',0.12); setTimeout(function(){tone(200,0.3,'square',0.1);},150); }
  function sndWin()    { [523,659,784,1047].forEach(function(f,i){ setTimeout(function(){tone(f,0.2,'sine',0.1);},i*150); }); }

  // ── Stars ──────────────────────────────────────────────────────────────────
  var STARS = [];
  for (var i = 0; i < 60; i++) {
    STARS.push({ x: Math.random()*W, y: Math.random()*H, s: Math.random()*1.5+0.3, sp: Math.random()*0.4+0.2 });
  }
  function updateStars() {
    STARS.forEach(function(s){ s.y += s.sp; if (s.y > H) { s.y = 0; s.x = Math.random()*W; } });
  }
  function drawStars() {
    STARS.forEach(function(s){
      c.globalAlpha = 0.4 + 0.3 * Math.sin(Date.now()*0.003 + s.x);
      c.fillStyle = '#fff'; c.fillRect(s.x, s.y, s.s, s.s);
    });
    c.globalAlpha = 1;
  }

  // ── Game state ─────────────────────────────────────────────────────────────
  var phase    = 'title'; // title | playing | correct | wrong | win
  var score    = 0;
  var qIdx     = 0;
  var qPool    = [];

  var ship     = { x: W/2, y: H - 36, w: 20, h: 14, spd: 2.5 };
  var bullets  = [];
  var pods     = [];
  var SHOOT_COOL = 16;
  var shootTimer = 0;

  var flashT   = 0;
  var feedMsg  = '';
  var feedColor= '#0f0';

  var QUESTION_H = 40;
  var ARENA_H    = H - QUESTION_H;  // 200px
  var POD_Y_START = 30;
  var POD_SPEED   = 0.4;
  var POD_AMP     = 28;
  var podFrame    = 0;

  var keys = {};

  // ── Pod layout ─────────────────────────────────────────────────────────────
  function makePods(question) {
    var answers = question.answers.slice().sort(function(){ return Math.random()-0.5; });
    answers = answers.slice(0, 3);
    var n = answers.length;
    var PW = 80, PH = 38;
    var spacing = W / n;
    pods = answers.map(function(a, i) {
      return {
        x: spacing * i + spacing/2,
        y: POD_Y_START + i * 5,
        w: PW, h: PH,
        ix: spacing * i + spacing/2,
        iy: POD_Y_START + i * 5,
        text: a.text,
        icon: a.icon || '?',
        correct: a.isCorrect,
        alive: true
      };
    });
  }

  function loadQuestion() {
    if (qIdx >= qPool.length) {
      phase = 'win';
      sndWin();
      return;
    }
    var q = qPool[qIdx];
    makePods(q);
    podFrame = 0;
    POD_SPEED = 0.35 + qIdx * 0.04;
  }

  function startGame() {
    initAudio();
    qPool = questions.slice().sort(function(){ return Math.random()-0.5; });
    qIdx = 0; score = 0;
    bullets = [];
    ship.x = W / 2;
    flashT = 0;
    phase = 'playing';
    loadQuestion();
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  function update() {
    if (phase !== 'playing') return;

    updateStars();
    podFrame++;

    if (keys['ArrowLeft'])  ship.x = Math.max(ship.w/2, ship.x - ship.spd);
    if (keys['ArrowRight']) ship.x = Math.min(W - ship.w/2, ship.x + ship.spd);

    if (shootTimer > 0) shootTimer--;
    if (keys['Space'] && shootTimer === 0 && bullets.length < 3) {
      bullets.push({ x: ship.x, y: ship.y - ship.h/2, alive: true });
      sndShoot();
      shootTimer = SHOOT_COOL;
    }

    bullets.forEach(function(b){ b.y -= 4; });
    bullets = bullets.filter(function(b){ return b.y > -4 && b.alive; });

    pods.forEach(function(p){
      if (!p.alive) return;
      p.y = p.iy + podFrame * POD_SPEED;
      p.x = p.ix + Math.sin(podFrame * 0.025 + p.ix * 0.01) * POD_AMP;
    });

    bullets.forEach(function(b){
      if (!b.alive) return;
      pods.forEach(function(p){
        if (!p.alive) return;
        if (b.x > p.x - p.w/2 && b.x < p.x + p.w/2 &&
            b.y > p.y && b.y < p.y + p.h) {
          b.alive = false;
          p.alive = false;
          if (p.correct) {
            score += 100;
            feedMsg   = '+100  CORRECT!';
            feedColor = '#44ff88';
            sndHit();
            phase = 'correct';
            flashT = 40;
          } else {
            feedMsg   = 'WRONG!  ' + getCorrectText();
            feedColor = '#ff4444';
            sndWrong();
            phase = 'wrong';
            flashT = 80;
          }
        }
      });
    });

    pods.forEach(function(p){
      if (!p.alive) return;
      if (p.y + p.h >= ARENA_H - 10) {
        if (p.correct) {
          feedMsg   = 'MISSED!  ' + getCorrectText();
          feedColor = '#ff8800';
          sndDrop();
          phase = 'wrong';
          flashT = 80;
        } else {
          p.alive = false;
        }
      }
    });
  }

  function getCorrectText() {
    if (!qPool[qIdx]) return '';
    var a = qPool[qIdx].answers.find(function(x){ return x.isCorrect; });
    return a ? '"' + a.text + '"' : '';
  }

  function tick() {
    if (phase === 'correct') {
      flashT--;
      if (flashT <= 0) {
        qIdx++;
        phase = 'playing';
        bullets = [];
        loadQuestion();
      }
    } else if (phase === 'wrong') {
      flashT--;
    }
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  function wrapText(text, x, y, maxW, lineH, maxLines) {
    var words = text.split(' '), line = '', lines = [];
    for (var i = 0; i < words.length; i++) {
      var t = line + (line?' ':'')+words[i];
      if (tW(t) > maxW && line) { lines.push(line); line = words[i]; }
      else line = t;
    }
    if (line) lines.push(line);
    if (maxLines) lines = lines.slice(0, maxLines);
    lines.forEach(function(l, i){ tText(l, x, y + i*lineH); });
  }

  function drawPod(p) {
    if (!p.alive) return;
    var px = p.x - p.w/2, py = p.y;

    // Pod body (graphics canvas)
    var gr = c.createLinearGradient(px, py, px, py + p.h);
    gr.addColorStop(0, '#eee');
    gr.addColorStop(1, '#bbb');
    c.fillStyle = gr;
    c.beginPath();
    c.roundRect(px, py, p.w, p.h, 5);
    c.fill();
    c.strokeStyle = '#333';
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(px, py, p.w, p.h, 5);
    c.stroke();

    // Icon + text (text canvas)
    tFont('17px sans-serif');
    tAlign('center');
    tFill('#222');
    tText(p.icon, p.x, py + 16);

    tFont('8px monospace');
    tFill('#111');
    tText(p.text, p.x, py + 30);
  }

  function drawShip(sx, sy) {
    c.save();
    c.translate(sx, sy);
    c.fillStyle = '#44ff88';
    c.fillRect(-4, -4, 8, 10);
    c.fillRect(-2, -10, 4, 6);
    c.fillRect(-10, 0, 6, 6);
    c.fillRect(4,  0, 6, 6);
    c.fillStyle = (Date.now() % 200 < 100) ? '#ff8800' : '#ffcc00';
    c.fillRect(-2, 6, 4, 3);
    c.restore();
  }

  function drawBullets() {
    c.fillStyle = '#ffff44';
    bullets.forEach(function(b){
      c.fillRect(b.x - 1, b.y - 4, 2, 6);
    });
  }

  function drawHUD() {
    tFont('bold 11px monospace');
    tFill('#ffdd44');
    tAlign('left');
    tText('SCORE: ' + score, 6, 14);
  }

  function drawQuestion() {
    var q = (qPool[qIdx] && phase !== 'win') ? qPool[qIdx] : null;
    c.fillStyle = 'rgba(0,0,0,0.75)';
    c.fillRect(0, ARENA_H, W, QUESTION_H);
    if (!q) return;
    c.strokeStyle = '#224422';
    c.lineWidth = 1;
    c.strokeRect(0, ARENA_H, W, QUESTION_H);
    tFont('10px monospace');
    tFill('#ddeeff');
    tAlign('center');
    wrapText(q.question, W/2, ARENA_H + 10, W - 16, 11, 3);
  }

  function draw() {
    tClear();
    c.fillStyle = '#04040f';
    c.fillRect(0, 0, W, H);
    drawStars();

    if (phase === 'title') {
      drawTitle();
      return;
    }
    if (phase === 'win') {
      drawWin();
      return;
    }

    c.strokeStyle = '#223322';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, ARENA_H); c.lineTo(W, ARENA_H); c.stroke();

    pods.forEach(drawPod);
    drawBullets();
    drawShip(ship.x, ship.y);
    drawHUD();
    drawQuestion();

    if ((phase === 'correct' || phase === 'wrong') && flashT > 0) {
      c.globalAlpha = Math.min(1, flashT / 20) * 0.7;
      c.fillStyle = (phase === 'correct') ? '#003300' : '#330000';
      c.fillRect(0, 0, W, ARENA_H);
      c.globalAlpha = 1;

      tFont('bold 13px monospace');
      tFill(feedColor);
      tAlign('center');
      tText(feedMsg, W/2, ARENA_H/2);

      if (phase === 'wrong') {
        tFont('10px monospace');
        tFill('#ccc');
        tText('[B / Enter] to restart', W/2, ARENA_H/2 + 20);
      }
    }
  }

  function drawTitle() {
    tFont('bold 22px monospace');
    tFill('#44ff88');
    tAlign('center');
    tText('SPACE BRAINS', W/2, 70);
    tFont('11px monospace');
    tFill('#ccc');
    tText('Shoot the CORRECT answer!', W/2, 95);
    tFill('#999');
    tText('Wrong pod = game over', W/2, 112);

    drawShip(W/2, 155);

    tFont('10px monospace');
    tFill((Date.now() % 900 < 500) ? '#ffdd44' : '#aa8800');
    tAlign('center');
    tText('[B / Enter] to start', W/2, 195);
  }

  function drawWin() {
    tFont('bold 22px monospace');
    tFill('#ffdd44');
    tAlign('center');
    tText('MISSION COMPLETE!', W/2, 80);
    tFont('13px monospace');
    tFill('#44ff88');
    tText('SCORE: ' + score, W/2, 110);
    tFont('10px monospace');
    tFill('#ccc');
    tText('[B / Enter] to play again', W/2, 160);
  }

  // ── Keys ───────────────────────────────────────────────────────────────────
  function onKey(e) {
    if (e.type === 'keydown') {
      keys[e.code] = true;
      initAudio();
      if (e.code === 'Space') e.preventDefault();

      if (phase === 'title' && e.code === 'Enter') { startGame(); return; }
      if (phase === 'win'   && e.code === 'Enter') { startGame(); return; }
      if (phase === 'wrong' && e.code === 'Enter') { startGame(); return; }
    } else {
      keys[e.code] = false;
    }
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  function loop() {
    tick();
    update();
    draw();
    raf = requestAnimationFrame(loop);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  this.start = function () {
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup',   onKey);
    raf = requestAnimationFrame(loop);
  };

  this.destroy = function () {
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup',   onKey);
  };
};
