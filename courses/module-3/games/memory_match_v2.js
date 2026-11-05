// ── Memory Match v2 ───────────────────────────────────────────────────────────
// Flip card pairs to find matching Q/A pairs.
// Controls: Arrow keys = move cursor, A/Space = flip card, B/Enter = restart (game over).
// Uses memory_match_data from data.json.  Canvas: 320×240

window.Game_memory_match = function (canvas, ctx, data, textCtx) {
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

  var pairs = [];
  if (data && data.memory_match_data) {
    pairs = data.memory_match_data.slice(0, 10);
  }
  if (!pairs.length) {
    pairs = [
      { question:'Sample Q1', answer:'Answer 1'},
      { question:'Sample Q2', answer:'Answer 2'},
      { question:'Sample Q3', answer:'Answer 3'},
      { question:'Sample Q4', answer:'Answer 4'},
    ];
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
    o.frequency.value = freq; o.type = type || 'sine';
    g.gain.setValueAtTime(vol || 0.08, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.start(ac.currentTime); o.stop(ac.currentTime + dur);
  }
  function sndFlip()    { tone(550, 0.08, 'sine', 0.07); }
  function sndMatch()   { tone(523,0.15,'sine',0.1); setTimeout(function(){tone(659,0.15,'sine',0.09);},130); setTimeout(function(){tone(784,0.2,'sine',0.08);},260); }
  function sndNoMatch() { tone(200, 0.25, 'sawtooth', 0.12); }
  function sndWin()     { [523,659,784,1047].forEach(function(f,i){ setTimeout(function(){tone(f,0.25,'sine',0.1);},i*120); }); }
  function sndMove()    { tone(400, 0.04, 'square', 0.04); }

  // ── Grid layout ────────────────────────────────────────────────────────────
  var N = pairs.length * 2;
  var COLS, ROWS;
  if (N <= 12) { COLS = 4; ROWS = Math.ceil(N / 4); }
  else         { COLS = 5; ROWS = Math.ceil(N / 5); }

  var HUD_H = 22;
  var MARGIN_X = 6, MARGIN_Y = 4;
  var GAP = 4;
  var CARD_W = Math.floor((W - MARGIN_X*2 - GAP*(COLS-1)) / COLS);
  var CARD_H = Math.floor((H - HUD_H - MARGIN_Y*2 - GAP*(ROWS-1)) / ROWS);

  // ── Card data ──────────────────────────────────────────────────────────────
  var cards = [];
  function buildCards() {
    var deck = [];
    pairs.forEach(function(p, i){
      deck.push({ pairId:i, type:'question', text:p.question, matched:false, faceUp:false, flipT:0, flipPhase:0 });
      deck.push({ pairId:i, type:'answer',   text:p.answer,   matched:false, faceUp:false, flipT:0, flipPhase:0 });
    });
    for (var i = deck.length-1; i > 0; i--) {
      var j = Math.floor(Math.random()*(i+1));
      var t = deck[i]; deck[i]=deck[j]; deck[j]=t;
    }
    while (deck.length < COLS * ROWS) deck.push(null);
    cards = deck;
  }

  function cardAt(col, row) {
    return cards[row * COLS + col] || null;
  }

  function cardPos(col, row) {
    return {
      x: MARGIN_X + col * (CARD_W + GAP),
      y: HUD_H + MARGIN_Y + row * (CARD_H + GAP)
    };
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var curCol = 0, curRow = 0;
  var flipped1 = null, flipped2 = null;
  var lockT = 0;
  var LOCK_T = 50;
  var matches = 0;
  var moves   = 0;
  var winScreen = false;
  var FLIP_T = 8;

  var PAIR_COLORS = ['#cc4444','#44aa44','#4444cc','#cc8800','#aa44aa',
                     '#44aaaa','#887700','#885533','#336688','#668833'];

  // ── Input ──────────────────────────────────────────────────────────────────
  var keys = {};
  var keyRepeat = {};
  var KEY_REPEAT_DELAY = 12;

  function onKey(e) {
    if (e.type === 'keydown') {
      initAudio();
      keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault();
    } else {
      keys[e.code] = false;
      keyRepeat[e.code] = 0;
    }
  }

  function pressedWith(code) {
    if (!keys[code]) return false;
    if (!keyRepeat[code]) { keyRepeat[code] = 1; return true; }
    keyRepeat[code]++;
    if (keyRepeat[code] >= KEY_REPEAT_DELAY) { keyRepeat[code] = 1; return true; }
    return false;
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  function findNextCard(dc, dr) {
    var col = ((curCol + dc) % COLS + COLS) % COLS;
    var row = ((curRow + dr) % ROWS + ROWS) % ROWS;
    if (cardAt(col, row) !== null) return { col: col, row: row };
    return { col: curCol, row: curRow };
  }

  function tryFlip() {
    if (lockT > 0) return;
    var card = cardAt(curCol, curRow);
    if (!card || card.matched || card.faceUp || card.flipPhase !== 0) return;

    card.flipPhase = 1;
    card.flipT = 0;
    sndFlip();

    if (!flipped1) {
      flipped1 = card;
    } else if (!flipped2 && card !== flipped1) {
      flipped2 = card;
      moves++;
    }
  }

  function update() {
    if (winScreen) return;

    cards.forEach(function(card){
      if (!card || card.flipPhase === 0) return;
      card.flipT++;
      if (card.flipPhase === 1) {
        if (card.flipT >= FLIP_T) { card.faceUp = !card.faceUp; card.flipPhase = 2; card.flipT = 0; }
      } else if (card.flipPhase === 2) {
        if (card.flipT >= FLIP_T) { card.flipPhase = 0; card.flipT = 0; }
      }
    });

    if (flipped2 && flipped2.flipPhase === 0 && flipped1.flipPhase === 0 && lockT === 0) {
      if (flipped1.pairId === flipped2.pairId) {
        flipped1.matched = true;
        flipped2.matched = true;
        sndMatch();
        matches++;
        flipped1 = null; flipped2 = null;
        if (matches === pairs.length) {
          winScreen = true;
          sndWin();
        }
      } else {
        lockT = LOCK_T;
        sndNoMatch();
      }
    }

    if (lockT > 0) {
      lockT--;
      if (lockT === 0 && flipped1 && flipped2) {
        [flipped1, flipped2].forEach(function(card){
          card.flipPhase = 1; card.flipT = 0;
        });
        flipped1 = null; flipped2 = null;
      }
    }

    if (lockT === 0) {
      var nxt;
      if (pressedWith('ArrowLeft'))  { nxt = findNextCard(-1,0); curCol=nxt.col; curRow=nxt.row; sndMove(); }
      if (pressedWith('ArrowRight')) { nxt = findNextCard(1,0);  curCol=nxt.col; curRow=nxt.row; sndMove(); }
      if (pressedWith('ArrowUp'))    { nxt = findNextCard(0,-1); curCol=nxt.col; curRow=nxt.row; sndMove(); }
      if (pressedWith('ArrowDown'))  { nxt = findNextCard(0,1);  curCol=nxt.col; curRow=nxt.row; sndMove(); }
      if (pressedWith('Space'))      { tryFlip(); }
    }

    if (pressedWith('Enter')) {
      if (winScreen) { restart(); }
    }
  }

  function restart() {
    buildCards();
    curCol = 0; curRow = 0;
    flipped1 = null; flipped2 = null;
    lockT = 0; matches = 0; moves = 0;
    winScreen = false;
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  function wrapText(text, cx, cy, maxW, lineH, maxL) {
    var words = text.split(' '), line='', lines=[];
    words.forEach(function(w){
      var t = line+(line?' ':'')+w;
      if (tW(t) > maxW && line) { lines.push(line); line=w; }
      else line=t;
    });
    if (line) lines.push(line);
    if (maxL) lines = lines.slice(0,maxL);
    var startY = cy - (lines.length-1)*lineH/2;
    lines.forEach(function(l,i){ tText(l, cx, startY+i*lineH); });
  }

  function drawCard(card, col, row) {
    var pos = cardPos(col, row);
    var x = pos.x, y = pos.y;
    var isCurrent = (col === curCol && row === curRow);

    if (!card) return;

    var scaleX = 1;
    if (card.flipPhase === 1) scaleX = 1 - card.flipT / FLIP_T;
    else if (card.flipPhase === 2) scaleX = card.flipT / FLIP_T;

    // Card body (graphics canvas, scaled)
    c.save();
    c.translate(x + CARD_W/2, y + CARD_H/2);
    c.scale(scaleX, 1);
    c.translate(-CARD_W/2, -CARD_H/2);

    if (card.matched) {
      c.fillStyle = PAIR_COLORS[card.pairId % PAIR_COLORS.length];
      c.globalAlpha = 0.75;
    } else if (card.faceUp) {
      c.fillStyle = card.type === 'question' ? '#1a2a4a' : '#1a3a2a';
    } else {
      c.fillStyle = '#2a2a2a';
    }
    c.beginPath();
    c.roundRect(0, 0, CARD_W, CARD_H, 4);
    c.fill();
    c.globalAlpha = 1;

    if (isCurrent && !winScreen) {
      c.strokeStyle = (Date.now() % 600 < 300) ? '#ffff44' : '#ff8800';
      c.lineWidth = 2;
    } else if (card.matched) {
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 1;
    } else {
      c.strokeStyle = '#444';
      c.lineWidth = 1;
    }
    c.beginPath();
    c.roundRect(0, 0, CARD_W, CARD_H, 4);
    c.stroke();

    // Card back pattern (graphics canvas, inside transform)
    if (!card.faceUp && !card.matched) {
      c.fillStyle = '#444';
      for (var di = 0; di < CARD_W; di += 8) {
        for (var dj = 0; dj < CARD_H; dj += 8) {
          c.fillRect(di + 3, dj + 3, 2, 2);
        }
      }
    }
    c.restore();

    // Text (text canvas, absolute world coords, fades with scaleX)
    if (card.faceUp || card.matched) {
      tAlpha(scaleX);
      var wcx = x + CARD_W/2;
      var label = card.type === 'question' ? 'Q' : 'A';
      tFont('7px monospace');
      tAlign('center');
      tFill(card.matched ? 'rgba(255,255,255,0.6)' : '#666');
      tText(label, wcx, y + 8);

      tFill(card.matched ? '#fff' : (card.type === 'question' ? '#aaccff' : '#aaffcc'));
      wrapText(card.text, wcx, y + CARD_H/2 + 2, CARD_W - 6, 8, 4);
      tAlpha(1);
    }
  }

  function draw() {
    tClear();
    c.fillStyle = '#0a0a1e';
    c.fillRect(0, 0, W, H);

    if (winScreen) {
      drawWin();
      return;
    }

    // HUD (graphics bar)
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(0, 0, W, HUD_H);

    // HUD text (text canvas)
    tFont('8px monospace');
    tFill('#ccc');
    tAlign('left');
    tText('MATCHES: ' + matches + '/' + pairs.length, 6, 14);
    tAlign('right');
    tText('MOVES: ' + moves, W - 6, 14);

    // Cards
    for (var row = 0; row < ROWS; row++) {
      for (var col = 0; col < COLS; col++) {
        var card = cardAt(col, row);
        if (card) drawCard(card, col, row);
      }
    }
  }

  function drawWin() {
    var t = Date.now();
    for (var i = 0; i < 30; i++) {
      var bx = (i*97+t*0.03)%W, by=(i*61+t*0.02)%H;
      c.fillStyle = 'rgba(255,255,255,'+(0.3+0.3*Math.sin(t*0.005+i))+')';
      c.fillRect(bx,by,1.5,1.5);
    }
    tFont('bold 22px monospace');
    tFill('#ffdd44');
    tAlign('center');
    tText('YOU WIN!', W/2, 80);
    tFont('11px monospace');
    tFill('#ccc');
    tText('Matched all ' + pairs.length + ' pairs', W/2, 105);
    tFill('#bbb');
    tText('in ' + moves + ' moves', W/2, 120);
    tFont('10px monospace');
    tFill((t%900<500) ? '#ffdd44' : '#aa8800');
    tText('[B / Enter] to play again', W/2, 165);
  }

  // ── Loop ───────────────────────────────────────────────────────────────────
  function loop() {
    update();
    draw();
    raf = requestAnimationFrame(loop);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  this.start = function () {
    buildCards();
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
