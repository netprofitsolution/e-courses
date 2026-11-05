/*
 * End-of-course certificate (SCOR-8613).
 *
 * Room loads this file only when the learner clicks "Certificate" on the last
 * screen, then calls OpenElmsCertificate.open(data). The learner confirms (or
 * types) their name, the certificate is drawn on a canvas - so a name or
 * course title in any script prints with the browser's own fonts - and saved
 * as a one-page A4 landscape PDF that holds the drawing as a JPEG. No server,
 * no library.
 *
 * data: {
 *   course:  course title
 *   learner: name from the LMS ("" when there is none; "Last, First" is turned round)
 *   minutes: learning time in minutes (0 = not set)
 *   cpd:     CPD course: prints CPD hours (minutes / 60, rounded up) instead of minutes
 *   logo:    course logo path relative to the page ("" = Open eLMS logo)
 *   accent:  colour for the frame and headings (#rrggbb)
 *
 *   SCOR-8614, the whole-Lesson CPD certificate in the mobile app. All optional;
 *   a course passes none of them, so its certificate is the 8613 one unchanged:
 *   dateText:  printed instead of today's date in the device's format (DD/MM/YYYY)
 *   extraLine: a second line under the detail line ("plus 30 minutes of further learning")
 *   courses:   [{ title, minutes, cpd }] listed on pages after the first, each row
 *              worded as that course's own certificate words it
 *   deliver:   function (blob, filename) that receives the PDF instead of a download
 *              (the app's WebView cannot save a download)
 * }
 */
(function () {
  "use strict";

  var PAGE_W = 842, PAGE_H = 595;      // A4 landscape in PDF points
  var W = 2339, H = 1654;              // canvas: A4 at ~200 dpi
  var DEFAULT_ACCENT = "#18362F";
  // The player's own copy, beside js/ (resolved from this script's URL).
  var FALLBACK_LOGO = (function () {
    var src = document.currentScript && document.currentScript.src;
    return (src ? src.replace(/js\/certificate\.js(\?.*)?$/, "") : "") + "assets/openelms-logo-white.svg";
  })();
  var SANS = "Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif";
  var SERIF = "Georgia, 'Times New Roman', 'Noto Serif', serif";

  function learnerName(raw) {
    var s = String(raw || "").trim();
    // SCORM 1.2 cmi.core.student_name is "Last, First".
    var m = /^([^,]+),\s*([^,]+)$/.exec(s);
    return m ? m[2].trim() + " " + m[1].trim() : s;
  }

  function accentOf(c) {
    return /^#[0-9a-f]{6}$/i.test(String(c || "")) ? c : DEFAULT_ACCENT;
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.onload = function () { resolve(img.naturalWidth ? img : null); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  /** The course logo, else the white Open eLMS logo recoloured to the accent. */
  function loadLogo(path, accent) {
    return loadImage(path).then(function (img) {
      if (img) return img;
      return fetch(FALLBACK_LOGO).then(function (r) { return r.ok ? r.text() : ""; }).then(function (svg) {
        if (!svg) return null;
        svg = svg.replace(/#fff(fff)?\b/gi, accent);
        return loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
      }, function () { return null; });
    });
  }

  function wrap(ctx, text, maxWidth, maxLines) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var lines = [], line = "";
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    // Scripts without spaces (Chinese, Japanese, Thai) come back as one long
    // line: break those by character.
    var out = [];
    lines.forEach(function (l) {
      while (ctx.measureText(l).width > maxWidth && l.length > 1) {
        var n = l.length;
        while (n > 1 && ctx.measureText(l.slice(0, n)).width > maxWidth) n--;
        out.push(l.slice(0, n));
        l = l.slice(n);
      }
      out.push(l);
    });
    if (out.length > maxLines) {
      out = out.slice(0, maxLines);
      out[maxLines - 1] = out[maxLines - 1].replace(/\s*\S{0,3}$/, "") + "…";
    }
    return out;
  }

  /** Largest font size (down to min) at which the text fits on one line. */
  function fitFont(ctx, text, weight, size, min, family, maxWidth) {
    for (; size > min; size -= 4) {
      ctx.font = weight + " " + size + "px " + family;
      if (ctx.measureText(text).width <= maxWidth) return size;
    }
    ctx.font = weight + " " + min + "px " + family;
    return min;
  }

  function detailLine(minutes, cpd) {
    minutes = Math.max(0, Math.round(Number(minutes) || 0));
    if (cpd) {
      if (!minutes) return "CPD certified";
      var hours = Math.max(1, Math.ceil(minutes / 60));
      return hours + " CPD hour" + (hours === 1 ? "" : "s") + " awarded";
    }
    return minutes ? minutes + " minute" + (minutes === 1 ? "" : "s") + " of learning" : "";
  }

  /** SCOR-8614: a course row, worded as that course's own certificate words it. */
  function rowText(course) {
    var line = detailLine(course.minutes, course.cpd);
    if (course.cpd) return line;
    return line ? line + " (not CPD)" : "not CPD";
  }

  var ROWS_PER_PAGE = 16; // the last row ends well above the "Page n of m" footer

  function listPages(courses) {
    var rows = Array.isArray(courses) ? courses : [];
    var pages = [];
    for (var i = 0; i < rows.length; i += ROWS_PER_PAGE) pages.push(rows.slice(i, i + ROWS_PER_PAGE));
    return pages;
  }

  /** A white A4 canvas with the certificate frame. */
  function page(accent) {
    var c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Frame: a heavy outer line and a fine inner one.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 22;
    ctx.strokeRect(70, 70, W - 140, H - 140);
    ctx.lineWidth = 4;
    ctx.strokeRect(112, 112, W - 224, H - 224);
    return { canvas: c, ctx: ctx };
  }

  /** SCOR-8614: one page of the course list. */
  function drawList(data, rows, n, total) {
    var accent = accentOf(data.accent);
    var p = page(accent), ctx = p.ctx;
    var left = 230, right = W - 230;

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = accent;
    ctx.font = "700 64px " + SANS;
    ctx.fillText("Courses completed", left, 290);
    ctx.fillStyle = "#555555";
    ctx.font = "400 40px " + SANS;
    ctx.fillText(wrap(ctx, data.course || "", right - left, 1)[0] || "", left, 360);

    var y = 470;
    rows.forEach(function (r) {
      var detail = rowText(r);
      ctx.font = "500 38px " + SANS;
      var dw = ctx.measureText(detail).width;
      ctx.textAlign = "right";
      ctx.fillStyle = r.cpd ? accent : "#555555";
      ctx.fillText(detail, right, y);
      ctx.textAlign = "left";
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "400 38px " + SANS;
      ctx.fillText(wrap(ctx, r.title || "", right - left - dw - 60, 1)[0] || "", left, y);
      ctx.strokeStyle = "#e2e2e2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, y + 22);
      ctx.lineTo(right, y + 22);
      ctx.stroke();
      y += 58;
    });

    ctx.textAlign = "right";
    ctx.fillStyle = "#777777";
    ctx.font = "400 32px " + SANS;
    ctx.fillText("Page " + n + " of " + total, right, H - 180);
    return p.canvas;
  }

  function draw(data, name, logo) {
    var accent = accentOf(data.accent);
    var p = page(accent), c = p.canvas, ctx = p.ctx;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    var cx = W / 2;
    var y = 220;

    if (logo) {
      var maxW = 620, maxH = 190;
      var s = Math.min(maxW / logo.naturalWidth, maxH / logo.naturalHeight);
      var lw = logo.naturalWidth * s, lh = logo.naturalHeight * s;
      ctx.drawImage(logo, cx - lw / 2, y, lw, lh);
      y += lh + 140;
    } else {
      y += 150;
    }

    ctx.fillStyle = accent;
    ctx.font = "700 92px " + SANS;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "10px";
    ctx.fillText("CERTIFICATE OF COMPLETION", cx, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    y += 120;
    ctx.fillStyle = "#555555";
    ctx.font = "400 46px " + SANS;
    ctx.fillText("This is to certify that", cx, y);

    y += 150;
    ctx.fillStyle = "#1a1a1a";
    fitFont(ctx, name, "italic 400", 120, 56, SERIF, W - 520);
    ctx.fillText(name, cx, y);
    ctx.strokeStyle = "#bbbbbb";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 640, y + 40);
    ctx.lineTo(cx + 640, y + 40);
    ctx.stroke();

    y += 130;
    ctx.fillStyle = "#555555";
    ctx.font = "400 46px " + SANS;
    ctx.fillText("has successfully completed", cx, y);

    y += 110;
    ctx.fillStyle = accent;
    ctx.font = "700 70px " + SANS;
    var lines = wrap(ctx, data.course || "", W - 560, 2);
    lines.forEach(function (l, i) { ctx.fillText(l, cx, y + i * 88); });
    y += (lines.length - 1) * 88;

    var detail = detailLine(data.minutes, data.cpd);
    if (detail) {
      y += 110;
      ctx.fillStyle = "#333333";
      ctx.font = "500 50px " + SANS;
      ctx.fillText(detail, cx, y);
    }
    if (data.extraLine) {
      y += 70;
      ctx.fillStyle = "#555555";
      ctx.font = "400 40px " + SANS;
      ctx.fillText(String(data.extraLine), cx, y);
    }

    // Date, bottom left inside the frame.
    var date = data.dateText
      ? String(data.dateText)
      : new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    ctx.textAlign = "left";
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "500 40px " + SANS;
    ctx.fillText(date, 230, H - 250);
    ctx.strokeStyle = "#bbbbbb";
    ctx.beginPath();
    ctx.moveTo(230, H - 228);
    ctx.lineTo(760, H - 228);
    ctx.stroke();
    ctx.fillStyle = "#777777";
    ctx.font = "400 32px " + SANS;
    ctx.fillText("Date", 230, H - 180);

    return c;
  }

  /* ---- PDF: one DCT (JPEG) image filling each page ---- */

  function pdfTitle(s) {
    // UTF-16BE hex string, so any script survives.
    var hex = "FEFF";
    for (var i = 0; i < s.length; i++) hex += ("000" + s.charCodeAt(i).toString(16)).slice(-4);
    return "<" + hex.toUpperCase() + ">";
  }

  /**
   * jpeg: one JPEG (Uint8Array) or, SCOR-8614, a list of them, one per page.
   * Page k uses objects 3+3k (page), 4+3k (content), 5+3k (image); the info
   * dictionary comes last. With one page that is exactly the 8613 file.
   */
  function buildPdf(jpeg, imgW, imgH, title) {
    var jpegs = Array.isArray(jpeg) ? jpeg : [jpeg];
    var enc = new TextEncoder();
    var parts = [], offsets = [], length = 0;
    function push(x) {
      var b = typeof x === "string" ? enc.encode(x) : x;
      parts.push(b);
      length += b.length;
    }
    function obj(n, body) {
      offsets[n] = length;
      push(n + " 0 obj\n" + body + "\nendobj\n");
    }
    var kids = jpegs.map(function (j, k) { return (3 + 3 * k) + " 0 R"; }).join(" ");
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [" + kids + "] /Count " + jpegs.length + " >>");
    var content = "q " + PAGE_W + " 0 0 " + PAGE_H + " 0 0 cm /Im0 Do Q";
    jpegs.forEach(function (img, k) {
      var pg = 3 + 3 * k, ct = pg + 1, im = pg + 2;
      obj(pg, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PAGE_W + " " + PAGE_H + "] " +
        "/Resources << /XObject << /Im0 " + im + " 0 R >> >> /Contents " + ct + " 0 R >>");
      obj(ct, "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
      offsets[im] = length;
      push(im + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + imgW + " /Height " + imgH +
        " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + img.length + " >>\nstream\n");
      push(img);
      push("\nendstream\nendobj\n");
    });
    var info = 3 + 3 * jpegs.length;
    obj(info, "<< /Title " + pdfTitle(title) + " /Producer (Open eLMS) >>");
    var xref = length;
    var x = "xref\n0 " + (info + 1) + "\n0000000000 65535 f \n";
    for (var i = 1; i <= info; i++) x += ("000000000" + offsets[i]).slice(-10) + " 00000 n \n";
    push(x + "trailer\n<< /Size " + (info + 1) + " /Root 1 0 R /Info " + info + " 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    return new Blob(parts, { type: "application/pdf" });
  }

  function save(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  function fileName(course) {
    var base = String(course || "Course").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    return "Certificate - " + (base || "Course") + ".pdf";
  }

  function make(data, name) {
    var accent = accentOf(data.accent);
    var fontsReady = document.fonts && document.fonts.load
      ? Promise.all([
          document.fonts.load("700 92px Roboto"),
          document.fonts.load("400 46px Roboto"),
          document.fonts.load("500 50px Roboto"),
        ]).catch(function () {})
      : Promise.resolve();
    function jpegOf(canvas) {
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error("canvas")); }, "image/jpeg", 0.92);
      }).then(function (b) { return b.arrayBuffer(); }).then(function (buf) { return new Uint8Array(buf); });
    }
    return Promise.all([loadLogo(data.logo, accent), fontsReady]).then(function (r) {
      var lists = listPages(data.courses);
      var canvases = [draw(data, name, r[0])].concat(lists.map(function (rows, i) {
        return drawList(data, rows, i + 2, lists.length + 1);
      }));
      // One page at a time, so a long course list never holds every canvas's JPEG twice.
      var jpegs = [];
      return canvases.reduce(function (chain, cv) {
        return chain.then(function () { return jpegOf(cv); }).then(function (j) { jpegs.push(j); });
      }, Promise.resolve()).then(function () { return jpegs; });
    }).then(function (jpegs) {
      var out = typeof data.deliver === "function" ? data.deliver : save;
      return out(buildPdf(jpegs.length === 1 ? jpegs[0] : jpegs, W, H, "Certificate - " + (data.course || "")), fileName(data.course));
    });
  }

  /* ---- Dialog: confirm or type the name ---- */

  var STYLE =
    ".oe-cert-back{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;font-family:" + SANS + "}" +
    ".oe-cert{background:#fff;color:#1a1a1a;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);width:100%;max-width:420px;padding:24px}" +
    ".oe-cert h2{margin:0 0 6px;font-size:20px;font-weight:700}" +
    ".oe-cert p{margin:0 0 16px;font-size:14px;line-height:1.45;color:#555}" +
    ".oe-cert label{display:block;font-size:13px;font-weight:500;margin-bottom:6px}" +
    ".oe-cert input{box-sizing:border-box;width:100%;font:inherit;font-size:16px;padding:10px 12px;border:1px solid #c8c8c8;border-radius:8px}" +
    ".oe-cert input:focus{outline:2px solid var(--oe-accent);outline-offset:1px;border-color:transparent}" +
    ".oe-cert .oe-row{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}" +
    ".oe-cert button{font:inherit;font-size:15px;padding:10px 16px;border-radius:8px;cursor:pointer;border:1px solid #c8c8c8;background:#fff;color:#1a1a1a}" +
    ".oe-cert button.oe-go{background:var(--oe-accent);border-color:var(--oe-accent);color:#fff;font-weight:600}" +
    ".oe-cert button:disabled{opacity:.55;cursor:default}" +
    ".oe-cert .oe-err{color:#b42318;font-size:13px;margin-top:8px;min-height:1em}";

  function open(data) {
    data = data || {};
    if (document.querySelector(".oe-cert-back")) return;
    if (!document.getElementById("oe-cert-style")) {
      var st = document.createElement("style");
      st.id = "oe-cert-style";
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    var back = document.createElement("div");
    back.className = "oe-cert-back";
    back.style.setProperty("--oe-accent", accentOf(data.accent));
    back.innerHTML =
      '<div class="oe-cert" role="dialog" aria-modal="true" aria-labelledby="oe-cert-title">' +
      '<h2 id="oe-cert-title">Your certificate</h2>' +
      "<p>Check your name as it should appear on the certificate, then download it as a PDF.</p>" +
      '<label for="oe-cert-name">Name</label>' +
      '<input id="oe-cert-name" type="text" autocomplete="name" maxlength="120">' +
      '<div class="oe-err" aria-live="polite"></div>' +
      '<div class="oe-row"><button type="button" class="oe-cancel">Cancel</button>' +
      '<button type="button" class="oe-go">Download PDF</button></div></div>';
    document.body.appendChild(back);

    var input = back.querySelector("input");
    var go = back.querySelector(".oe-go");
    var err = back.querySelector(".oe-err");
    input.value = learnerName(data.learner);

    // Room (Lime) listens for keys on the window and cancels some defaults
    // (space, arrows): catch them first, in the window's capture phase.
    var KEYS = ["keydown", "keyup", "keypress"];
    function close() {
      KEYS.forEach(function (t) { window.removeEventListener(t, onKey, true); });
      back.remove();
    }
    function onKey(e) {
      e.stopPropagation();
      if (e.type !== "keydown") return;
      if (e.key === "Escape") close();
      else if (e.key === "Enter" && document.activeElement === input) { e.preventDefault(); submit(); }
    }
    function submit() {
      var name = input.value.replace(/\s+/g, " ").trim();
      if (!name) {
        err.textContent = "Please enter your name.";
        input.focus();
        return;
      }
      go.disabled = true;
      go.textContent = "Preparing…";
      err.textContent = "";
      make(data, name).then(close, function () {
        go.disabled = false;
        go.textContent = "Download PDF";
        err.textContent = "The certificate could not be made in this browser.";
      });
    }

    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    back.querySelector(".oe-cancel").addEventListener("click", close);
    go.addEventListener("click", submit);
    KEYS.forEach(function (t) { window.addEventListener(t, onKey, true); });
    setTimeout(function () { input.focus(); input.select(); }, 0);
  }

  window.OpenElmsCertificate = {
    open: open, _detailLine: detailLine, _learnerName: learnerName, _buildPdf: buildPdf,
    _rowText: rowText, _listPages: listPages, _ROWS_PER_PAGE: ROWS_PER_PAGE, _make: make,
  };
})();
