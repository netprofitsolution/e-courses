// Block Blast v2
// 8×8 grid puzzle: move pieces with arrows, place with [A].
// Complete rows OR columns to clear them.  Board full → answer a question to save yourself.
// Controls: ◄►▲▼ move piece   [A]/Space = place   [B]/Enter = restart
// Uses fact_man_data from data.json.  Canvas: 320×240

window.Game_block_blast = function (canvas, ctx, data, textCtx) {
  var c = ctx, W = 320, H = 240;
  var raf = null;

  /* ── Hi-res text canvas (2×) ──────────────────────────────────────────── */
  var TC = textCtx, TS = 2;
  function tClear()     { TC.clearRect(0, 0, 640, 480); }
  function tFont(f)     { TC.font = f.replace(/(\d+(?:\.\d+)?)px/, function(_,n){ return (n*TS)+'px'; }); }
  function tFill(v)     { TC.fillStyle = v; }
  function tAlign(a)    { TC.textAlign = a; }
  function tAlpha(a)    { TC.globalAlpha = a; }
  function tText(t,x,y) { TC.fillText(t, x*TS, y*TS); }
  function tW(t)        { return TC.measureText(t).width / TS; }

  /* ── Questions ────────────────────────────────────────────────────────── */
  var questions = [];
  if (data && data.fact_man_data) questions = data.fact_man_data.slice();
  if (!questions.length) {
    questions = [
      { question:'What is 2+2?',         options:['3','4','5','6'],    correct:1 },
      { question:'Sky color?',            options:['Red','Blue','Green','Yellow'], correct:1 },
    ];
  }

  /* ── Layout ───────────────────────────────────────────────────────────── */
  var COLS = 8, ROWS = 8, CELL = 24;
  var BOARD_W = COLS * CELL;                          // 192
  var BOARD_H = ROWS * CELL;                          // 192
  var BX = Math.floor((W - BOARD_W) / 2);            // 64
  var BY = Math.floor((H - BOARD_H) / 2);            // 24

  /* ── Answer colours ───────────────────────────────────────────────────── */
  var ANS_COLORS = ['#ff4444','#ff88cc','#44ddff','#ffaa44'];
  var ANS_LABELS = ['A','B','C','D'];

  /* ── Audio ────────────────────────────────────────────────────────────── */
  var ac = null;
  function initAudio() { if(ac) return; try{ ac=new(window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
  function tone(freq,dur,type,vol) {
    if(!ac) return;
    var o=ac.createOscillator(),g=ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.frequency.value=freq; o.type=type||'square';
    g.gain.setValueAtTime(vol||0.06,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+dur);
    o.start(); o.stop(ac.currentTime+dur);
  }
  function sndMove()   { tone(380,0.04,'square',0.03); }
  function sndPlace()  { tone(300,0.08,'square',0.06); }
  function sndClear()  { [500,650,820].forEach(function(f,i){ setTimeout(function(){ tone(f,0.12,'sine',0.08); },i*70); }); }
  function sndSave()   { [523,659,784,1047].forEach(function(f,i){ setTimeout(function(){ tone(f,0.15,'sine',0.10); },i*80); }); }
  function sndWrong()  { tone(180,0.40,'sawtooth',0.15); setTimeout(function(){ tone(130,0.35,'sawtooth',0.10); },200); }
  function sndOver()   { for(var i=0;i<10;i++) setTimeout((function(i){ return function(){ tone(380-i*28,0.10,'sine',0.05); }; })(i),i*70); }
  function sndSelect() { tone(440,0.05,'sine',0.04); }

  /* ── Pieces ───────────────────────────────────────────────────────────── */
  var PIECES = [
    // lines
    { shape:[[1,1,1,1,1]],             color:'#4af' },
    { shape:[[1],[1],[1],[1],[1]],     color:'#4af' },
    { shape:[[1,1,1,1]],               color:'#a4f' },
    { shape:[[1],[1],[1],[1]],         color:'#a4f' },
    { shape:[[1,1,1]],                 color:'#4fa' },
    { shape:[[1],[1],[1]],             color:'#4fa' },
    { shape:[[1,1]],                   color:'#aaf' },
    { shape:[[1],[1]],                 color:'#aaf' },
    { shape:[[1]],                     color:'#eee' },
    // squares
    { shape:[[1,1,1],[1,1,1],[1,1,1]], color:'#f84' },
    { shape:[[1,1],[1,1]],             color:'#fa4' },
    // L shapes
    { shape:[[1,0],[1,0],[1,1]],       color:'#ff8' },
    { shape:[[0,1],[0,1],[1,1]],       color:'#ff8' },
    { shape:[[1,1],[1,0],[1,0]],       color:'#f66' },
    { shape:[[1,1],[0,1],[0,1]],       color:'#f66' },
    // small L
    { shape:[[1,0],[1,1]],             color:'#4ff' },
    { shape:[[0,1],[1,1]],             color:'#4ff' },
    { shape:[[1,1],[0,1]],             color:'#f4f' },
    { shape:[[1,1],[1,0]],             color:'#f4f' },
    // T shapes
    { shape:[[1,1,1],[0,1,0]],         color:'#88f' },
    { shape:[[0,1,0],[1,1,1]],         color:'#88f' },
    { shape:[[1,0],[1,1],[1,0]],       color:'#8f8' },
    { shape:[[0,1],[1,1],[0,1]],       color:'#8f8' },
  ];

  /* ── Board ────────────────────────────────────────────────────────────── */
  var board = [];
  function makeBoard() {
    board = [];
    for (var r = 0; r < ROWS; r++) board[r] = new Array(COLS).fill(null);
  }

  function fitsAt(piece, col, row) {
    for (var r = 0; r < piece.shape.length; r++) {
      for (var cl = 0; cl < piece.shape[r].length; cl++) {
        if (!piece.shape[r][cl]) continue;
        var br = row+r, bc = col+cl;
        if (br < 0 || br >= ROWS || bc < 0 || bc >= COLS) return false;
        if (board[br][bc]) return false;
      }
    }
    return true;
  }

  function canFitAnywhere(piece) {
    var ph = piece.shape.length, pw = piece.shape[0].length;
    for (var r = 0; r <= ROWS-ph; r++)
      for (var cl = 0; cl <= COLS-pw; cl++)
        if (fitsAt(piece, cl, r)) return true;
    return false;
  }

  /* ── State ────────────────────────────────────────────────────────────── */
  var current = null;
  var cursorCol = 0, cursorRow = 0;
  var qPool = [], qIdx = 0;
  var currentQ = null, saveOptions = null, selectedOpt = 0;
  var score = 0, lives = 3;
  var phase = 'title';
  var flashMsg = '', flashColor = '#fff', flashT = 0;
  var keys = {}, keyRepeat = {}, KEY_REPEAT = 9;

  function pressedWith(code) {
    if (!keys[code]) return false;
    if (!keyRepeat[code]) { keyRepeat[code]=1; return true; }
    keyRepeat[code]++;
    if (keyRepeat[code] >= KEY_REPEAT) { keyRepeat[code]=1; return true; }
    return false;
  }

  function pickQuestion() {
    if (!qPool.length) return null;
    var q = qPool[qIdx % qPool.length]; qIdx++; return q;
  }

  function randomPiece() {
    return PIECES[Math.floor(Math.random()*PIECES.length)];
  }

  function clampCursor() {
    var ph = current.shape.length, pw = current.shape[0].length;
    if (cursorCol < 0) cursorCol = 0;
    if (cursorCol > COLS-pw) cursorCol = COLS-pw;
    if (cursorRow < 0) cursorRow = 0;
    if (cursorRow > ROWS-ph) cursorRow = ROWS-ph;
  }

  function spawnPiece() {
    current = randomPiece();
    cursorCol = Math.floor((COLS - current.shape[0].length) / 2);
    cursorRow = Math.floor((ROWS - current.shape.length)    / 2);
    if (!canFitAnywhere(current)) triggerSave();
  }

  function startGame() {
    initAudio();
    makeBoard();
    qPool = questions.slice().sort(function(){ return Math.random()-0.5; });
    qIdx=0; score=0; lives=3;
    flashMsg=''; flashT=0;
    keys={}; keyRepeat={};
    phase='playing';
    spawnPiece();
  }

  function doPlace() {
    if (!fitsAt(current, cursorCol, cursorRow)) return;
    sndPlace();

    // Stamp piece onto board
    for (var r = 0; r < current.shape.length; r++)
      for (var cl = 0; cl < current.shape[r].length; cl++)
        if (current.shape[r][cl]) board[cursorRow+r][cursorCol+cl] = current.color;

    // Detect completed rows and columns simultaneously
    var cleared = [];
    for (var ro = 0; ro < ROWS; ro++)
      if (board[ro].every(function(x){ return x!==null; })) cleared.push({type:'row', idx:ro});
    for (var cl2 = 0; cl2 < COLS; cl2++) {
      var full = true;
      for (var ri = 0; ri < ROWS; ri++) if (!board[ri][cl2]) { full=false; break; }
      if (full) cleared.push({type:'col', idx:cl2});
    }

    // Clear all completed rows and columns
    cleared.forEach(function(item) {
      if (item.type==='row') {
        for (var cl3=0; cl3<COLS; cl3++) board[item.idx][cl3]=null;
      } else {
        for (var ri2=0; ri2<ROWS; ri2++) board[ri2][item.idx]=null;
      }
    });

    if (cleared.length > 0) {
      sndClear();
      score += cleared.length * 100;
      var rCleared = cleared.filter(function(x){ return x.type==='row'; }).length;
      var cCleared = cleared.filter(function(x){ return x.type==='col'; }).length;
      var parts = [];
      if (rCleared) parts.push(rCleared + ' row' + (rCleared>1?'s':''));
      if (cCleared) parts.push(cCleared + ' col' + (cCleared>1?'s':''));
      flashMsg = '\u2713 Cleared ' + parts.join(' + ') + '!';
      flashColor = '#ffdd44'; flashT = 55;
    } else {
      score += 5;
    }

    spawnPiece();
  }

  function triggerSave() {
    var q = pickQuestion();
    if (!q) { phase='gameover'; sndOver(); return; }
    currentQ = q;
    var opts = q.options.map(function(text,i){ return {text:text, correct:i===q.correct}; });
    opts.sort(function(){ return Math.random()-0.5; });
    while (opts.length<4) opts.push({text:'?',correct:false});
    saveOptions = opts.slice(0,4);
    selectedOpt = 0;
    keys={}; keyRepeat={};
    phase='saving';
  }

  function confirmSave() {
    var ans = saveOptions[selectedOpt];
    if (ans && ans.correct) {
      sndSave();
      // Clear the 2 most-filled rows and 2 most-filled columns
      var rowCounts = [];
      for (var r=0; r<ROWS; r++)
        rowCounts.push({idx:r, n: board[r].filter(function(x){ return x!==null; }).length});
      rowCounts.sort(function(a,b){ return b.n-a.n; });
      rowCounts.slice(0,2).forEach(function(rc){ for(var cl=0; cl<COLS; cl++) board[rc.idx][cl]=null; });

      var colCounts = [];
      for (var cl2=0; cl2<COLS; cl2++) {
        var n=0; for(var r2=0; r2<ROWS; r2++) if(board[r2][cl2]) n++;
        colCounts.push({idx:cl2, n:n});
      }
      colCounts.sort(function(a,b){ return b.n-a.n; });
      colCounts.slice(0,2).forEach(function(cc){ for(var r3=0; r3<ROWS; r3++) board[r3][cc.idx]=null; });

      flashMsg = '\u2713 SAVED!  2 rows + 2 cols cleared';
      flashColor = '#3ddc84'; flashT = 65;
      keys={}; keyRepeat={};
      phase='playing';
      spawnPiece();
    } else {
      sndWrong();
      lives--;
      if (lives <= 0) {
        phase='gameover'; sndOver();
      } else {
        flashMsg = '\u2717 WRONG!  -1 LIFE  ('+lives+' left)';
        flashColor = '#e05252'; flashT = 65;
        makeBoard();
        keys={}; keyRepeat={};
        phase='playing';
        spawnPiece();
      }
    }
  }

  /* ── Update ───────────────────────────────────────────────────────────── */
  function update() {
    if (phase==='saving') {
      if (pressedWith('ArrowLeft'))  { selectedOpt=(selectedOpt+3)%4; sndSelect(); }
      if (pressedWith('ArrowRight')) { selectedOpt=(selectedOpt+1)%4; sndSelect(); }
      if (pressedWith('ArrowUp'))    { selectedOpt=selectedOpt<2?selectedOpt+2:selectedOpt-2; sndSelect(); }
      if (pressedWith('ArrowDown'))  { selectedOpt=selectedOpt<2?selectedOpt+2:selectedOpt-2; sndSelect(); }
      if (pressedWith('Space'))      { confirmSave(); }
      return;
    }
    if (phase!=='playing') return;

    var moved = false;
    if (pressedWith('ArrowLeft'))  { cursorCol--; moved=true; }
    if (pressedWith('ArrowRight')) { cursorCol++; moved=true; }
    if (pressedWith('ArrowUp'))    { cursorRow--; moved=true; }
    if (pressedWith('ArrowDown'))  { cursorRow++; moved=true; }
    if (moved) { clampCursor(); sndMove(); }

    if (pressedWith('Space')) doPlace();

    if (flashT>0) flashT--;
  }

  /* ── Draw helpers ─────────────────────────────────────────────────────── */
  function wrapText(text, cx, cy, maxW, lineH, maxL) {
    var words=text.split(' '), line='', lines2=[];
    words.forEach(function(w){
      var t2=line+(line?' ':'')+w;
      if (tW(t2)>maxW && line) { lines2.push(line); line=w; } else line=t2;
    });
    if (line) lines2.push(line);
    if (maxL) lines2=lines2.slice(0,maxL);
    var sy=cy-(lines2.length-1)*lineH/2;
    lines2.forEach(function(l,i){ tText(l, cx, sy+i*lineH); });
  }

  function drawBoard() {
    // Background + subtle grid
    c.fillStyle='#050510';
    c.fillRect(BX, BY, BOARD_W, BOARD_H);

    // Placed cells
    for (var ro=0; ro<ROWS; ro++) {
      for (var cl=0; cl<COLS; cl++) {
        if (!board[ro][cl]) continue;
        c.fillStyle=board[ro][cl];
        c.fillRect(BX+cl*CELL+2, BY+ro*CELL+2, CELL-4, CELL-4);
        c.fillStyle='rgba(255,255,255,0.22)';
        c.fillRect(BX+cl*CELL+2, BY+ro*CELL+2, CELL-4, 4);
      }
    }

    // Grid lines
    c.strokeStyle='rgba(255,255,255,0.06)'; c.lineWidth=1;
    for (var x=0; x<=COLS; x++) { c.beginPath(); c.moveTo(BX+x*CELL,BY); c.lineTo(BX+x*CELL,BY+BOARD_H); c.stroke(); }
    for (var y=0; y<=ROWS; y++) { c.beginPath(); c.moveTo(BX,BY+y*CELL); c.lineTo(BX+BOARD_W,BY+y*CELL); c.stroke(); }

    // Board border
    c.strokeStyle='rgba(100,150,255,0.45)'; c.lineWidth=1;
    c.strokeRect(BX, BY, BOARD_W, BOARD_H);
  }

  function drawCursor() {
    if (!current || phase!=='playing') return;
    var valid = fitsAt(current, cursorCol, cursorRow);

    for (var r=0; r<current.shape.length; r++) {
      for (var cl=0; cl<current.shape[r].length; cl++) {
        if (!current.shape[r][cl]) continue;
        var px = BX+(cursorCol+cl)*CELL, py = BY+(cursorRow+r)*CELL;
        // Fill
        c.fillStyle = valid ? current.color : 'rgba(255,60,60,0.85)';
        c.fillRect(px+2, py+2, CELL-4, CELL-4);
        // Top highlight
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(px+2, py+2, CELL-4, 4);
        // White outline — always visible so piece pops over placed blocks
        c.strokeStyle = 'white';
        c.lineWidth = 2;
        c.strokeRect(px+2, py+2, CELL-4, CELL-4);
      }
    }

    // Small placement hint text
    tFont('7px monospace');
    tFill(valid ? '#aaffaa' : '#ff8888');
    tAlign('center');
    tText(valid ? '[A] place' : 'blocked', W/2, BY+BOARD_H+15);
  }

  function drawHUD() {
    var lx = Math.floor(BX/2);                          // 32
    var rx = BX+BOARD_W+Math.floor((W-BX-BOARD_W)/2);  // 288
    c.fillStyle='rgba(0,0,0,0.50)';
    c.fillRect(0,0,BX-1,H); c.fillRect(BX+BOARD_W+1,0,W-BX-BOARD_W-1,H);

    tAlign('center');
    tFont('7px monospace');      tFill('#999');    tText('SCORE', lx, BY+14);
    tFont('bold 9px monospace'); tFill('#ffdd44'); tText(score,   lx, BY+24);

    tFont('7px monospace');      tFill('#999');    tText('LIVES', lx, BY+44);
    tFont('bold 10px monospace'); tFill('#ff6666');
    tText('\u2665'.repeat(Math.max(0,lives))+'\u2661'.repeat(Math.max(0,3-lives)), lx, BY+56);

    // Controls reminder on right strip
    tFont('7px monospace'); tFill('#445');
    tText('\u25b2\u25bc\u25c4\u25ba', rx, BY+14);
    tText('move', rx, BY+24);
    tText('[A]', rx, BY+42);
    tText('place', rx, BY+52);
  }

  function drawFeedback() {
    if (flashT<=0) return;
    tAlpha(Math.min(1, flashT/15));
    tFont('bold 11px monospace'); tFill(flashColor); tAlign('center');
    tText(flashMsg, W/2, BY+BOARD_H/2);
    tAlpha(1);
  }

  function drawSaveOverlay() {
    if (!currentQ || !saveOptions) return;
    c.fillStyle='rgba(0,0,15,0.90)'; c.fillRect(0,0,W,H);

    tFont('bold 11px monospace'); tFill('#ff6666'); tAlign('center');
    tText('\u26a0  SAVE YOURSELF  \u26a0', W/2, 20);
    c.strokeStyle='#442222'; c.lineWidth=1;
    c.beginPath(); c.moveTo(10,27); c.lineTo(W-10,27); c.stroke();

    tFont('8px monospace'); tFill('#ddeeff'); tAlign('center');
    wrapText(currentQ.question, W/2, 44, W-24, 11, 3);
    c.beginPath(); c.moveTo(10,66); c.lineTo(W-10,66); c.stroke();

    var optW=Math.floor((W-24)/2), optH=34, gX=8, gY=6;
    var gridX=8, gridY=72;

    for (var i=0; i<4; i++) {
      var col2=i%2, row2=Math.floor(i/2);
      var ox=gridX+col2*(optW+gX), oy=gridY+row2*(optH+gY);
      var sel=(i===selectedOpt), ans=saveOptions[i];

      c.fillStyle=sel?ANS_COLORS[i]+'bb':ANS_COLORS[i]+'22';
      c.fillRect(ox,oy,optW,optH);
      if (sel) { c.strokeStyle=ANS_COLORS[i]; c.lineWidth=2; c.strokeRect(ox,oy,optW,optH); }
      c.fillStyle=ANS_COLORS[i]; c.fillRect(ox,oy,4,optH);

      tFont('bold 9px monospace'); tFill(ANS_COLORS[i]); tAlign('left');
      tText(ANS_LABELS[i]+':', ox+8, oy+optH/2+1);

      tFont('8px monospace'); tFill(sel?'#fff':'#ccd'); tAlign('left');
      var txt=(ans&&ans.text)?String(ans.text):'?', orig=txt;
      while (tW(txt)>optW-30 && txt.length>2) txt=txt.slice(0,-1);
      if (txt!==orig) txt+='\u2026';
      tText(txt, ox+28, oy+optH/2+1);
    }

    tFont('7px monospace'); tFill('#556'); tAlign('center');
    tText('\u25c4\u25ba  select     [A]  confirm', W/2, gridY+2*optH+gY+14);
  }

  function drawTitle() {
    c.fillStyle='#04040f'; c.fillRect(0,0,W,H);
    tFont('bold 22px monospace'); tFill('#4af'); tAlign('center');
    tText('BLOCK BLAST', W/2, 44);
    tFont('9px monospace'); tFill('#aaa'); tText('8\u00d78 puzzle  \u2013  rows & columns clear', W/2, 60);

    c.fillStyle='rgba(255,80,80,0.18)'; c.fillRect(W/2-96,72,192,28);
    c.strokeStyle='rgba(255,80,80,0.35)'; c.lineWidth=1; c.strokeRect(W/2-96,72,192,28);
    tFont('8px monospace'); tFill('#ff9999');
    tText('Board full? Answer correctly', W/2, 83);
    tText('to clear 2 rows + 2 cols!', W/2, 94);

    tFont('7px monospace'); tFill('#888');
    tText('\u25c4\u25ba\u25b2\u25bc  move piece', W/2, 116);
    tText('[A] place piece', W/2, 128);
    tFont('10px monospace'); tFill((Date.now()%900<500)?'#ffdd44':'#aa8800');
    tText('[B / Enter] to start', W/2, 156);
  }

  function drawGameOver() {
    c.globalAlpha=0.78; c.fillStyle='#000'; c.fillRect(0,0,W,H); c.globalAlpha=1;
    tFont('bold 18px monospace'); tFill('#ff4444'); tAlign('center');
    tText('GAME OVER', W/2, H/2-24);
    tFont('10px monospace'); tFill('#ffdd44'); tText('Score: '+score, W/2, H/2-4);
    tFont('10px monospace'); tFill((Date.now()%900<500)?'#ffdd44':'#aa8800');
    tText('[B / Enter] to play again', W/2, H/2+22);
  }

  /* ── Main draw ────────────────────────────────────────────────────────── */
  function draw() {
    tClear();
    c.fillStyle='#04040f'; c.fillRect(0,0,W,H);
    if (phase==='title')    { drawTitle();    return; }
    if (phase==='gameover') { drawGameOver(); return; }
    drawBoard(); drawCursor(); drawHUD(); drawFeedback();
    if (phase==='saving') drawSaveOverlay();
  }

  /* ── Keys ─────────────────────────────────────────────────────────────── */
  function onKey(e) {
    if (e.type==='keydown') {
      initAudio(); keys[e.code]=true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code)!==-1) e.preventDefault();
      if ((phase==='title'||phase==='gameover') && e.code==='Enter') startGame();
    } else { keys[e.code]=false; keyRepeat[e.code]=0; }
  }

  function loop() { update(); draw(); raf=requestAnimationFrame(loop); }

  this.start   = function() { document.addEventListener('keydown',onKey); document.addEventListener('keyup',onKey); raf=requestAnimationFrame(loop); };
  this.destroy = function() { if(raf) cancelAnimationFrame(raf); document.removeEventListener('keydown',onKey); document.removeEventListener('keyup',onKey); };
};
