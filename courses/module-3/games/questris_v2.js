// ── Questris v2 ───────────────────────────────────────────────────────────────
// Tetris variant: Left half = TRUE (green), Right half = FALSE (red).
// Place falling piece on the correct side for the current true/false question.
// Controls: Left/Right = move, Up = rotate, Down = soft drop, A/Space = hard drop.
// B/Enter = restart (game over only).
// Uses questris_data from data.json.  Canvas: 320×240

window.Game_questris = function (canvas, ctx, data, textCtx) {
  var c = ctx, W = 320, H = 240;
  var raf = null;

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
  if (data && data.questris_data) {
    questions = data.questris_data.slice();
  }
  if (!questions.length) {
    questions = [
      { question:'The sun rises in the east.',  answer:true  },
      { question:'Fish can climb trees.',        answer:false },
      { question:'Water is wet.',                answer:true  },
      { question:'The moon is made of cheese.', answer:false },
    ];
  }

  // ── Grid config ────────────────────────────────────────────────────────────
  var COLS = 16, ROWS = 13;
  var CELL = 16;
  var BOARD_W = COLS * CELL;  // 256
  var BOARD_H = ROWS * CELL;  // 208
  var BX = (W - BOARD_W) / 2; // 32px left padding
  var BY = 0;
  var Q_H = H - BOARD_H;      // 32px question area at bottom

  var HALF = COLS / 2;  // 8

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
    g.gain.setValueAtTime(vol || 0.06, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.start(ac.currentTime); o.stop(ac.currentTime + dur);
  }
  function sndMove()   { tone(350,0.04,'square',0.04); }
  function sndRotate() { tone(550,0.06,'triangle',0.05); }
  function sndPlace()  { tone(280,0.08,'square',0.05); }
  function sndLine()   { tone(700,0.1,'sine',0.08); setTimeout(function(){tone(900,0.15,'sine',0.07);},100); }
  function sndWrong()  { tone(180,0.3,'sawtooth',0.12); setTimeout(function(){tone(130,0.35,'sawtooth',0.1);},200); }
  function sndCorrect(){ tone(523,0.12,'sine',0.09); setTimeout(function(){tone(659,0.12,'sine',0.08);},120); }
  function sndOver()   { for(var i=0;i<12;i++) setTimeout(function(i){ return function(){ tone(400-i*25,0.1,'sine',0.05); }; }(i), i*60); }

  // ── Tetrominos ─────────────────────────────────────────────────────────────
  var PIECES = [
    { shape:[[1,1,1,1]], color:'#4af' },           // I
    { shape:[[1,1],[1,1]], color:'#fa4' },          // O
    { shape:[[0,1,0],[1,1,1]], color:'#a4f' },      // T
    { shape:[[0,1,1],[1,1,0]], color:'#4fa' },      // S
    { shape:[[1,1,0],[0,1,1]], color:'#f44' },      // Z
    { shape:[[1,0,0],[1,1,1]], color:'#f84' },      // L
    { shape:[[0,0,1],[1,1,1]], color:'#48f' },      // J
  ];

  function randomPiece() {
    var t = PIECES[Math.floor(Math.random()*PIECES.length)];
    return {
      shape: t.shape.map(function(r){ return r.slice(); }),
      color: t.color,
      x: Math.floor(COLS/2) - Math.floor(t.shape[0].length/2),
      y: 0
    };
  }

  function rotateCW(shape) {
    var rows = shape.length, cols = shape[0].length;
    var out = [];
    for (var c2 = 0; c2 < cols; c2++) {
      out[c2] = [];
      for (var r = 0; r < rows; r++) out[c2][r] = shape[rows-1-r][c2];
    }
    return out;
  }

  // ── Board ──────────────────────────────────────────────────────────────────
  var board = [];
  function makeBoard() {
    board = [];
    for (var r = 0; r < ROWS; r++) { board[r] = []; for (var c2=0;c2<COLS;c2++) board[r][c2]=null; }
  }

  function fits(piece, ox, oy, shape) {
    shape = shape || piece.shape;
    for (var r=0; r<shape.length; r++) {
      for (var c2=0; c2<shape[r].length; c2++) {
        if (!shape[r][c2]) continue;
        var bx2 = piece.x + ox + c2, by2 = piece.y + oy + r;
        if (bx2 < 0 || bx2 >= COLS || by2 >= ROWS) return false;
        if (by2 >= 0 && board[by2][bx2]) return false;
      }
    }
    return true;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var current     = null;
  var qPool       = [];
  var qIdx        = 0;
  var currentQ    = null;
  var score       = 0;
  var lines       = 0;
  var penalty     = 0;
  var phase       = 'title';  // title | ready | playing | gameover
  var dropTimer   = 0;
  var DROP_RATE   = 60;
  var flashMsg    = '';
  var flashColor  = '#fff';
  var flashT      = 0;

  var keys      = {};
  var keyRepeat = {};
  var KEY_REPEAT = 10;

  function pressedWith(code) {
    if (!keys[code]) return false;
    if (!keyRepeat[code]) { keyRepeat[code]=1; return true; }
    keyRepeat[code]++;
    if (keyRepeat[code] >= KEY_REPEAT) { keyRepeat[code]=1; return true; }
    return false;
  }

  function nextQuestion() {
    if (!qPool.length) return null;
    var q = qPool[qIdx % qPool.length];
    qIdx++;
    return q;
  }

  function spawnNextPiece() {
    current = randomPiece();
    if (!fits(current, 0, 0)) {
      current = null;
      phase = 'gameover';
      sndOver();
    } else {
      phase = 'playing';
    }
  }

  function startGame() {
    initAudio();
    makeBoard();
    qPool = questions.slice().sort(function(){ return Math.random()-0.5; });
    qIdx=0; score=0; lines=0; penalty=0;
    currentQ = nextQuestion();
    current  = null;
    dropTimer = 0;
    keys = {}; keyRepeat = {};
    phase = 'ready';
  }

  function placePiece() {
    var trueCells=0, falseCells=0;
    for (var r=0; r<current.shape.length; r++) {
      for (var c2=0; c2<current.shape[r].length; c2++) {
        if (!current.shape[r][c2]) continue;
        var bx2=current.x+c2, by2=current.y+r;
        if (by2 >= 0) {
          board[by2][bx2] = current.color;
          if (bx2 < HALF) trueCells++; else falseCells++;
        }
      }
    }
    sndPlace();

    var playerTrue = trueCells >= falseCells;
    var correct    = (playerTrue === currentQ.answer);

    if (correct) { score += 50; sndCorrect(); flashMsg='✓ CORRECT!'; flashColor='#4f8'; }
    else          { penalty += 3; sndWrong(); flashMsg='✗ WRONG'; flashColor='#f44'; }
    flashT = 55;

    var cleared = 0;
    for (var row2=ROWS-1; row2>=0; row2--) {
      if (board[row2].every(function(x){ return x!==null; })) {
        board.splice(row2,1);
        board.unshift(new Array(COLS).fill(null));
        cleared++;
        row2++;
      }
    }
    if (cleared > 0) { lines += cleared; score += cleared*100; sndLine(); }

    currentQ = nextQuestion();
    current  = null;
    keys = {}; keyRepeat = {};
    phase = 'ready';
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  function update() {
    if (phase === 'ready') {
      if (pressedWith('Space')) {
        keys = {}; keyRepeat = {};
        spawnNextPiece();
      }
      return;
    }
    if (phase !== 'playing') return;

    var rate = Math.max(8, DROP_RATE - Math.floor(score/500));

    if (pressedWith('ArrowLeft')  && fits(current,-1,0)) { current.x--; sndMove(); }
    if (pressedWith('ArrowRight') && fits(current,1,0))  { current.x++; sndMove(); }
    if (pressedWith('ArrowDown')  && fits(current,0,1))  { current.y++; dropTimer=0; }

    if (pressedWith('ArrowUp')) {
      var rot = rotateCW(current.shape);
      if      (fits(current,0,0,rot))  { current.shape=rot; sndRotate(); }
      else if (fits(current,1,0,rot))  { current.shape=rot; current.x++; sndRotate(); }
      else if (fits(current,-1,0,rot)) { current.shape=rot; current.x--; sndRotate(); }
    }

    if (pressedWith('Space')) {
      while (fits(current,0,1)) current.y++;
      placePiece();
      return;
    }

    dropTimer++;
    if (dropTimer >= rate) {
      dropTimer = 0;
      if (fits(current,0,1)) { current.y++; }
      else { placePiece(); }
    }

    if (flashT > 0) flashT--;
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  function wrapText(text, cx2, cy2, maxW, lineH, maxL) {
    var words = text.split(' '), line='', lines2=[];
    words.forEach(function(w){
      var t2 = line+(line?' ':'')+w;
      if (tW(t2) > maxW && line) { lines2.push(line); line=w; }
      else line=t2;
    });
    if (line) lines2.push(line);
    if (maxL) lines2=lines2.slice(0,maxL);
    var sy = cy2 - (lines2.length-1)*lineH/2;
    lines2.forEach(function(l,i){ tText(l, cx2, sy+i*lineH); });
  }

  function drawBoard() {
    // TRUE/FALSE background tints (graphics)
    c.fillStyle = 'rgba(0,80,20,0.25)';
    c.fillRect(BX, BY, HALF*CELL, BOARD_H);
    c.fillStyle = 'rgba(80,0,0,0.25)';
    c.fillRect(BX + HALF*CELL, BY, HALF*CELL, BOARD_H);

    // Side labels (text canvas)
    tFont('bold 10px monospace');
    tFill('rgba(0,220,80,0.9)');
    tAlign('center');
    tText('TRUE', BX + HALF*CELL/2, 10);
    tFill('rgba(255,80,40,0.9)');
    tText('FALSE', BX + HALF*CELL + HALF*CELL/2, 10);

    // Center divider (graphics)
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = 1;
    c.setLineDash([3,4]);
    c.beginPath();
    c.moveTo(BX + HALF*CELL, BY);
    c.lineTo(BX + HALF*CELL, BY + BOARD_H);
    c.stroke();
    c.setLineDash([]);

    // Placed cells (graphics)
    for (var row=0; row<ROWS; row++) {
      for (var col=0; col<COLS; col++) {
        if (board[row][col]) {
          c.fillStyle = board[row][col];
          c.fillRect(BX + col*CELL+1, BY + row*CELL+1, CELL-2, CELL-2);
          c.fillStyle = 'rgba(255,255,255,0.2)';
          c.fillRect(BX + col*CELL+1, BY + row*CELL+1, CELL-2, 3);
        }
      }
    }

    // Grid lines (graphics)
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    for (var x=0; x<=COLS; x++) { c.beginPath(); c.moveTo(BX+x*CELL,BY); c.lineTo(BX+x*CELL,BY+BOARD_H); c.stroke(); }
    for (var y=0; y<=ROWS; y++) { c.beginPath(); c.moveTo(BX,BY+y*CELL); c.lineTo(BX+BOARD_W,BY+y*CELL); c.stroke(); }

    c.strokeStyle = 'rgba(255,255,255,0.3)';
    c.lineWidth = 1;
    c.strokeRect(BX, BY, BOARD_W, BOARD_H);
  }

  function drawPiece() {
    if (!current) return;
    var ghost = { x:current.x, y:current.y, shape:current.shape };
    while (fits(ghost, 0, 1)) ghost.y++;
    c.globalAlpha = 0.2;
    c.fillStyle = current.color;
    for (var r=0; r<ghost.shape.length; r++) {
      for (var cc=0; cc<ghost.shape[r].length; cc++) {
        if (!ghost.shape[r][cc]) continue;
        c.fillRect(BX+(ghost.x+cc)*CELL+1, BY+(ghost.y+r)*CELL+1, CELL-2, CELL-2);
      }
    }
    c.globalAlpha = 1;

    c.fillStyle = current.color;
    for (var r2=0; r2<current.shape.length; r2++) {
      for (var cc2=0; cc2<current.shape[r2].length; cc2++) {
        if (!current.shape[r2][cc2]) continue;
        var px = BX + (current.x+cc2)*CELL, py = BY + (current.y+r2)*CELL;
        c.fillRect(px+1, py+1, CELL-2, CELL-2);
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(px+1, py+1, CELL-2, 3);
        c.fillStyle = current.color;
      }
    }
  }

  function drawHUD() {
    // Side strips (graphics)
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, BX-1, BOARD_H);
    c.fillRect(BX + BOARD_W + 1, 0, W - BX - BOARD_W - 1, BOARD_H);

    // HUD text (text canvas)
    var lx = BX / 2;  // 16px center of left strip
    tAlign('center');

    tFont('8px monospace');
    tFill('#ccc');
    tText('SCR', lx, 18);
    tFont('bold 10px monospace');
    tFill('#ffdd44');
    tText(score, lx, 29);

    tFont('8px monospace');
    tFill('#ccc');
    tText('LN', lx, 45);
    tFont('bold 10px monospace');
    tFill('#88ddff');
    tText(lines, lx, 56);

    tFont('8px monospace');
    tFill('#ccc');
    tText('PNL', lx, 72);
    tFont('bold 10px monospace');
    tFill('#ff8888');
    tText(penalty, lx, 83);

    var rx = BX + BOARD_W + (W - BX - BOARD_W) / 2;
    tFont('8px monospace');
    tFill('rgba(0,220,80,0.95)');
    tText('\u25c4T', rx, BOARD_H/2 - 6);
    tFill('rgba(255,80,40,0.95)');
    tText('F\u25ba', rx, BOARD_H/2 + 8);
  }

  function drawQuestion() {
    var qy = BOARD_H;
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillRect(0, qy, W, Q_H);
    c.strokeStyle = '#224';
    c.lineWidth = 1;
    c.strokeRect(0, qy, W, Q_H);

    if (!currentQ) return;

    tFont('bold 10px monospace');
    tFill('rgba(0,220,80,1)');
    tAlign('left');
    tText('T', 4, qy + 14);
    tFill('rgba(255,80,40,1)');
    tAlign('right');
    tText('F', W-4, qy + 14);

    tFont('8px monospace');
    tFill('#ddeeff');
    tAlign('center');
    wrapText(currentQ.question, W/2, qy + Q_H/2, W-40, 10, 3);
  }

  function drawFeedback() {
    if (flashT <= 0) return;
    tAlpha(Math.min(1, flashT / 15) * 0.75);
    tFont('bold 14px monospace');
    tFill(flashColor);
    tAlign('center');
    tText(flashMsg, W/2, BOARD_H/2 + 6);
    tAlpha(1);
  }

  function drawTitle() {
    c.fillStyle = '#04040f';
    c.fillRect(0, 0, W, H);

    tFont('bold 26px monospace');
    tFill('#ffdd44');
    tAlign('center');
    tText('QUESTRIS', W/2, 55);

    tFont('10px monospace');
    tFill('#ccc');
    tText('True/False Tetris', W/2, 75);

    c.fillStyle = 'rgba(0,80,20,0.5)';
    c.fillRect(W/2-70, 90, 60, 18);
    tFont('bold 11px monospace');
    tFill('#4f8');
    tAlign('center');
    tText('TRUE', W/2-40, 103);

    c.fillStyle = 'rgba(80,0,0,0.5)';
    c.fillRect(W/2+10, 90, 60, 18);
    tFill('#f44');
    tText('FALSE', W/2+40, 103);

    tFont('8px monospace');
    tFill('#bbb');
    tText('\u2190\u2192 move  \u2191 rotate  \u2193 soft drop', W/2, 125);
    tText('[A] hard drop', W/2, 137);

    tFont('10px monospace');
    tFill((Date.now()%900<500)?'#ffdd44':'#aa8800');
    tText('[B / Enter] to start', W/2, 175);
  }

  function drawReadyOverlay() {
    c.fillStyle = 'rgba(0,0,0,0.75)';
    c.fillRect(0, BOARD_H - 24, W, 24);
    tFont('bold 11px monospace');
    tFill('#ffe066');
    tAlign('center');
    tText('Press A to start', W/2, BOARD_H - 10);
  }

  function drawGameOver() {
    c.globalAlpha = 0.7;
    c.fillStyle = '#000';
    c.fillRect(BX, BY, BOARD_W, BOARD_H);
    c.globalAlpha = 1;

    tFont('bold 17px monospace');
    tFill('#ff4444');
    tAlign('center');
    tText('GAME OVER', W/2, BOARD_H/2 - 20);

    tFont('11px monospace');
    tFill('#ffdd44');
    tText('Score: '+score, W/2, BOARD_H/2);
    tFill('#ccc');
    tText('Lines: '+lines+'  Pen: '+penalty, W/2, BOARD_H/2+14);

    var t = Date.now();
    var coinY = BOARD_H/2 + 30 + 20 * Math.abs(Math.sin(t / 300));
    tFont('17px monospace');
    tText('\uD83E\uDE99', W/2, coinY);

    tFont('10px monospace');
    tFill((t%900<500)?'#ffdd44':'#aa8800');
    tText('[B] drop a coin', W/2, BOARD_H/2+62);
  }

  function draw() {
    tClear();
    c.fillStyle = '#04040f';
    c.fillRect(0, 0, W, H);

    if (phase === 'title') {
      drawTitle();
      return;
    }

    drawBoard();
    drawPiece();
    drawHUD();
    drawQuestion();
    if (phase === 'ready')    { drawReadyOverlay(); }
    drawFeedback();

    if (phase === 'gameover') { drawGameOver(); }
  }

  // ── Keys ───────────────────────────────────────────────────────────────────
  function onKey(e) {
    if (e.type === 'keydown') {
      initAudio();
      keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code) !== -1) e.preventDefault();

      if (phase === 'title'    && e.code === 'Enter') { startGame(); return; }
      if (phase === 'gameover' && e.code === 'Enter') { startGame(); return; }
    } else {
      keys[e.code] = false;
      keyRepeat[e.code] = 0;
    }
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  function loop() {
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
