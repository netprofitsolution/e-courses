// ── Flip Cards v2 ────────────────────────────────────────────────────────────
// Flash card study mode: Left/Right arrows to navigate, A/Space to flip card,
// B/Enter to go to next card. Uses memory_match_data from data.json.
// Canvas: 320×240

window.Game_flip_cards = function (canvas, ctx, data, textCtx) {
  this.canvas = canvas;
  this.ctx    = ctx;

  // ── Hi-res text canvas (2×) ────────────────────────────────────────────────
  var TC = textCtx, TS = 2;
  function tClear() { TC.clearRect(0, 0, 640, 480); }
  function tFont(f) { TC.font = f.replace(/(\d+(?:\.\d+)?)px/, function(_,n){ return (n*TS)+'px'; }); }
  function tFill(v) { TC.fillStyle = v; }
  function tAlign(a){ TC.textAlign = a; }
  function tBase(b) { TC.textBaseline = b; }
  function tAlpha(a){ TC.globalAlpha = a; }
  function tText(t,x,y){ TC.fillText(t, x*TS, y*TS); }
  function tW(t)    { return TC.measureText(t).width / TS; }

  var cards = (data && data.memory_match_data) ? data.memory_match_data.slice() : [
    { question: 'No data loaded', answer: 'Check data.json' }
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  var idx        = 0;
  var flipped    = false;   // false = question side, true = answer side
  var reviewed   = new Set();
  var flipAnim   = 0;       // 0→1 flip-in, 1 = done, negative = flip-out
  var flipDir    = 1;       // +1 = flipping to answer, -1 = flipping to question
  var flipPhase  = 0;       // 0 = idle, 1 = flip-out, 2 = flip-in
  var flipTimer  = 0;
  var FLIP_T     = 12;      // frames per half
  var winScreen  = false;
  var raf        = null;
  var keys       = {};

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
  function sndFlip()    { tone(520, 0.08, 'sine', 0.07); }
  function sndNext()    { tone(600, 0.06, 'sine', 0.06); }
  function sndPrev()    { tone(450, 0.06, 'sine', 0.06); }
  function sndWin()     {
    [523,659,784,1047].forEach(function(f,i){ setTimeout(function(){ tone(f,0.2,'sine',0.1); },i*100); });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function wrapText(text, x, y, maxW, lineH) {
    var words = text.split(' '), line = '', lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line + (line ? ' ' : '') + words[i];
      if (tW(test) > maxW && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    var totalH = lines.length * lineH;
    var startY = y - totalH / 2 + lineH / 2;
    lines.forEach(function(l, i){ tText(l, x, startY + i * lineH); });
    return lines.length;
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  function draw() {
    var c = ctx, W = 320, H = 240;
    tClear();
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#0a0a1e';
    c.fillRect(0, 0, W, H);

    if (winScreen) { drawWinScreen(); return; }

    // ── HUD bar ──────────────────────────────────────────────────────────────
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(0, 0, W, 22);
    tFont('8px monospace'); tFill('#ccc');
    tAlign('left');  tText('CARD ' + (idx+1) + '/' + cards.length, 6, 14);
    tAlign('right'); tText('SEEN: ' + reviewed.size, W-6, 14);
    var pct = reviewed.size / cards.length;
    c.fillStyle = '#1a3a1a'; c.fillRect(W/2-50, 7, 100, 8);
    c.fillStyle = '#33cc55'; c.fillRect(W/2-50, 7, pct*100, 8);
    c.strokeStyle = '#555'; c.lineWidth = 1; c.strokeRect(W/2-50, 7, 100, 8);

    // ── Card ─────────────────────────────────────────────────────────────────
    var cx = W/2, cy = 135, cw = 290, ch = 170;
    var half = cw / 2, hch = ch / 2;

    // Rotation angle: 0→π/2 (phase 1) then π/2→π (phase 2)
    var D = 800; // focal distance (larger = flatter perspective)
    var t01 = (flipPhase === 1 || flipPhase === 2) ? flipTimer / FLIP_T : 0;
    var theta = flipPhase === 0 ? 0 :
                flipPhase === 1 ? t01 * Math.PI / 2 :
                                  Math.PI / 2 + t01 * Math.PI / 2;
    var cosT = Math.cos(theta);
    var sinT = Math.sin(theta);

    // Full 3D perspective projection for each card edge.
    // A point at local (lx, ly) on the card maps to:
    //   screen_x = cx + lx * cosT * D / (D + lx * sinT)
    //   screen_y = cy + ly        * D / (D + lx * sinT)
    // Scale factor per edge:
    var scaleL = D / (D + (-half) * sinT);  // near side (lx = -half): > 1 → larger
    var scaleR = D / (D + ( half) * sinT);  // far  side (lx = +half): < 1 → smaller

    // Four perspective-projected corners
    var TLx = cx + (-half) * cosT * scaleL,  TLy = cy + (-hch) * scaleL;
    var TRx = cx + ( half) * cosT * scaleR,  TRy = cy + (-hch) * scaleR;
    var BRx = TRx,                            BRy = cy + ( hch) * scaleR;
    var BLx = TLx,                            BLy = cy + ( hch) * scaleL;

    var projW = Math.abs(TLx - TRx);
    var showAnswer = flipPhase === 2 ? !flipped : flipped;

    // Shadow
    c.save();
    c.globalAlpha = 0.25 * projW / cw;
    c.fillStyle = '#000';
    c.beginPath();
    c.moveTo(TLx+4, TLy+4); c.lineTo(TRx+4, TRy+4);
    c.lineTo(BRx+4, BRy+4); c.lineTo(BLx+4, BLy+4);
    c.closePath(); c.fill();
    c.restore();

    if (flipPhase === 0) {
      // ── Idle: full rounded card ─────────────────────────────────────────
      c.save();
      var grad = c.createLinearGradient(TLx, TLy, BRx, BRy);
      if (showAnswer) { grad.addColorStop(0,'#1a2a3a'); grad.addColorStop(1,'#0d1a2a'); }
      else            { grad.addColorStop(0,'#2a1a3a'); grad.addColorStop(1,'#1a0d2a'); }
      c.fillStyle = grad;
      c.beginPath(); c.roundRect(cx-half, cy-hch, cw, ch, 12); c.fill();
      c.strokeStyle = showAnswer ? '#4488cc' : '#aa44cc'; c.lineWidth = 2;
      c.beginPath(); c.roundRect(cx-half, cy-hch, cw, ch, 12); c.stroke();
      c.fillStyle = showAnswer ? '#1a3a5a' : '#3a1a5a';
      c.beginPath(); c.roundRect(cx-half+12, cy-hch+10, showAnswer?56:64, 18, 8); c.fill();
      c.restore();
    } else if (projW > 0) {
      // ── Animating: full perspective quad ────────────────────────────────
      c.save();
      c.beginPath();
      c.moveTo(TLx, TLy); c.lineTo(TRx, TRy);
      c.lineTo(BRx, BRy); c.lineTo(BLx, BLy);
      c.closePath();
      c.clip();

      // Fill
      var grad = c.createLinearGradient(TLx, TLy, BRx, BRy);
      if (showAnswer) { grad.addColorStop(0,'#1a2a3a'); grad.addColorStop(1,'#0d1a2a'); }
      else            { grad.addColorStop(0,'#2a1a3a'); grad.addColorStop(1,'#1a0d2a'); }
      c.fillStyle = grad;
      // fillRect covering full quad bounding box (clipped to quad shape)
      var yMin = Math.min(TLy, TRy) - 1, yMax = Math.max(BLy, BRy) + 1;
      var xMin = Math.min(TLx, TRx) - 1, xMax = Math.max(TLx, TRx) + 1;
      c.fillRect(xMin, yMin, xMax - xMin, yMax - yMin);

      // Perspective shading: near edge lighter, far edge darker
      // When cosT>=0: TLx is near (left); when cosT<0: TRx is near (left-visually)
      var sGrad = c.createLinearGradient(Math.min(TLx,TRx), 0, Math.max(TLx,TRx), 0);
      var nearStop = cosT >= 0 ? 0 : 1;
      sGrad.addColorStop(    nearStop, 'rgba(255,255,255,0.09)');
      sGrad.addColorStop(1 - nearStop, 'rgba(0,0,0,0.25)');
      c.fillStyle = sGrad;
      c.fillRect(xMin, yMin, xMax - xMin, yMax - yMin);
      c.restore();

      // Border
      c.strokeStyle = showAnswer ? '#4488cc' : '#aa44cc'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(TLx, TLy); c.lineTo(TRx, TRy);
      c.lineTo(BRx, BRy); c.lineTo(BLx, BLy);
      c.closePath(); c.stroke();

      // Chip (project its local x corners the same way)
      var chipW = showAnswer ? 56 : 64;
      var cLlx = -half + 12, cRlx = cLlx + chipW;
      var cLscale = D / (D + cLlx * sinT);
      var cRscale = D / (D + cRlx * sinT);
      var chipX1 = cx + cLlx * cosT * cLscale;
      var chipX2 = cx + cRlx * cosT * cRscale;
      var chipY1 = cy + (-hch + 10) * cLscale;
      var chipY2 = cy + (-hch + 28) * cLscale;
      c.fillStyle = showAnswer ? '#1a3a5a' : '#3a1a5a';
      c.beginPath();
      c.moveTo(chipX1, chipY1); c.lineTo(chipX2, chipY1);
      c.lineTo(chipX2, chipY2); c.lineTo(chipX1, chipY2);
      c.closePath(); c.fill();
    }

    // ── Text canvas — perspective scale at card center (lx=0) ───────────────
    // At lx=0 the x-scale is exactly cosT and y-scale is 1, so |cosT| is correct.
    TC.save();
    TC.translate(cx * TS, cy * TS);
    TC.scale(Math.abs(cosT), 1);
    TC.translate(-cx * TS, -cy * TS);

    tFont('bold 10px monospace');
    tFill(showAnswer ? '#88bbff' : '#cc88ff'); tAlign('left');
    tText(showAnswer ? 'ANSWER' : 'QUESTION', cx-cw/2+18, cy-ch/2+21);

    var card = cards[idx];
    var cardText = showAnswer ? card.answer : card.question;
    tFont(showAnswer ? 'bold 17px monospace' : '12px monospace');
    tFill('#eee'); tAlign('center');
    wrapText(cardText, cx, cy+(showAnswer?8:12), cw-40, showAnswer?20:15);

    if (flipPhase === 0) {
      tFont('8px monospace'); tFill('rgba(210,210,210,0.9)'); tAlign('center');
      tText(showAnswer ? '[A] flip back' : '[A] reveal answer', cx, cy+ch/2-14);
    }
    TC.restore();

    // Controls hint (always full opacity)
    tFont('8px monospace'); tFill('#888'); tAlign('center');
    tText('\u25c4 prev   [A] flip   next \u25ba', cx, H-5);
  }

  function drawWinScreen() {
    var c = ctx, W = 320, H = 240, t = Date.now();
    for (var i = 0; i < 40; i++) {
      c.fillStyle = 'rgba(255,255,255,' + (0.2+0.3*Math.sin(t*0.003+i)) + ')';
      c.fillRect((i*137+t*0.02)%W, (i*79+t*0.01)%H, 1, 1);
    }
    tFont('bold 24px monospace'); tFill('#ffdd44'); tAlign('center');
    tText('ALL DONE!', 160, 80);
    tFont('12px monospace'); tFill('#ccc');
    tText('You reviewed all ' + cards.length + ' cards.', 160, 110);
    tFont('10px monospace'); tFill('#88ff88');
    tText('[B / Enter] to start over', 160, 160);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function startFlip() {
    if (flipPhase !== 0) return;
    flipPhase = 1;
    flipTimer = 0;
    sndFlip();
    initAudio();
  }

  function goNext() {
    if (flipPhase !== 0 || winScreen) return;
    initAudio();
    reviewed.add(idx);
    if (flipped) {
      // unflip first, then advance
      flipPhase = 1;
      flipTimer = 0;
      // after unflip, advance
      sndNext();
    } else {
      idx = (idx + 1) % cards.length;
      reviewed.add(idx);
      sndNext();
      if (reviewed.size >= cards.length) {
        winScreen = true;
        sndWin();
      }
    }
  }

  function goPrev() {
    if (flipPhase !== 0 || winScreen) return;
    if (idx === 0 && !flipped) return;
    initAudio();
    sndPrev();
    if (flipped) {
      _pendingPrev = idx > 0;
      flipPhase = 1; flipTimer = 0;
    } else {
      idx = idx - 1;
    }
  }

  function restart() {
    idx = 0; flipped = false; reviewed.clear();
    flipPhase = 0; flipTimer = 0; winScreen = false;
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  function update() {
    if (flipPhase === 1) {
      flipTimer++;
      if (flipTimer >= FLIP_T) {
        // Switch face
        flipped = !flipped;
        flipPhase = 2;
        flipTimer = 0;
      }
    } else if (flipPhase === 2) {
      flipTimer++;
      if (flipTimer >= FLIP_T) {
        flipPhase = 0;
        flipTimer = 0;
        // If was unflipping as part of navigation
        if (!flipped && _pendingNext) {
          _pendingNext = false;
          idx = (idx + 1) % cards.length;
          reviewed.add(idx);
          if (reviewed.size >= cards.length) { winScreen = true; sndWin(); }
        } else if (!flipped && _pendingPrev) {
          _pendingPrev = false;
          if (idx > 0) idx = idx - 1;
        }
      }
    }
  }

  var _pendingNext = false;
  var _pendingPrev = false;

  // ── Input ──────────────────────────────────────────────────────────────────
  function onKey(e) {
    if (e.type === 'keydown') {
      initAudio();
      if (winScreen) {
        if (e.code === 'Enter') restart();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        startFlip();
      } else if (e.code === 'Enter') {
        if (flipped && flipPhase === 0) {
          // Unflip + advance
          _pendingNext = true;
          flipPhase = 1;
          flipTimer = 0;
          sndNext();
        } else if (flipPhase === 0) {
          idx = (idx + 1) % cards.length;
          reviewed.add(idx);
          sndNext();
          if (reviewed.size >= cards.length) { winScreen = true; sndWin(); }
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (flipped && flipPhase === 0) {
          _pendingNext = true;
          flipPhase = 1; flipTimer = 0;
          sndNext();
        } else if (flipPhase === 0) {
          idx = (idx + 1) % cards.length;
          reviewed.add(idx);
          sndNext();
          if (reviewed.size >= cards.length) { winScreen = true; sndWin(); }
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
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
    reviewed.add(0);
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
