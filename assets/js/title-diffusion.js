// Resolves the about-page title the way a diffusion LM resolves a sequence: every
// position starts as noise and they settle in random order, not left to right.
(function () {
  const DURATION = 1400; // ms until the last character has settled
  const FLAP_MS = 45; // how often an unsettled character is re-rolled
  const NOISE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$&@%";

  const title = document.querySelector(".post-header .post-title");
  if (!title) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const original = title.innerHTML;
  const cells = [];

  // Wrap every visible character, leaving whitespace and the bold span untouched
  // so the markup keeps rendering exactly as it does without this script.
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);

  texts.forEach(function (node) {
    const frag = document.createDocumentFragment();
    let run = "";
    let word = null;
    const flush = function () {
      if (run) {
        frag.appendChild(document.createTextNode(run));
        run = "";
      }
    };
    Array.prototype.forEach.call(node.data, function (ch) {
      if (/\s/.test(ch)) {
        word = null;
        run += ch;
        return;
      }
      flush();
      if (!word) {
        // Per-character inline-blocks are each a break opportunity, so on a narrow
        // screen a line could otherwise fall inside a word. Keep words atomic.
        word = document.createElement("span");
        word.style.whiteSpace = "nowrap";
        frag.appendChild(word);
      }
      const span = document.createElement("span");
      span.textContent = ch;
      word.appendChild(span);
      cells.push({ span: span, ch: ch });
    });
    flush();
    node.parentNode.replaceChild(frag, node);
  });

  if (!cells.length) return;

  const measure = document.createElement("canvas").getContext("2d");

  // A cell is locked to the width of its final glyph, so noise wider than that
  // would spill over its neighbours. Keep only the glyphs that fit.
  const fittingNoise = function (span, width) {
    const s = window.getComputedStyle(span);
    measure.font = s.fontStyle + " " + s.fontWeight + " " + s.fontSize + " " + s.fontFamily;
    const fits = [];
    let narrowest = { ch: NOISE.charAt(0), w: Infinity };
    for (let i = 0; i < NOISE.length; i++) {
      const ch = NOISE.charAt(i);
      const w = measure.measureText(ch).width;
      if (w <= width + 0.5) fits.push(ch);
      if (w < narrowest.w) narrowest = { ch: ch, w: w };
    }
    return fits.length ? fits : [narrowest.ch];
  };

  const pick = function (pool) {
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const start = function () {
    // Pin each character to its own width, so swapping in another glyph
    // cannot shift the rest of the line while the title is resolving.
    cells.forEach(function (c) {
      const w = c.span.getBoundingClientRect().width;
      c.pool = fittingNoise(c.span, w);
      c.span.style.display = "inline-block";
      c.span.style.width = w + "px";
      c.span.style.textAlign = "center";
      c.span.style.opacity = "0.5";
      c.span.textContent = pick(c.pool);
    });

    // Random settle order is what makes it read as diffusion rather than typing.
    const order = cells.map(function (_, i) {
      return i;
    });
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    order.forEach(function (idx, rank) {
      cells[idx].lockAt = (rank / cells.length) * DURATION * 0.85 + Math.random() * DURATION * 0.15;
    });

    const t0 = performance.now();
    let lastFlap = -Infinity;

    const step = function (now) {
      const t = now - t0;
      const flap = t - lastFlap >= FLAP_MS;
      if (flap) lastFlap = t;

      let pending = false;
      cells.forEach(function (c) {
        if (c.settled) return;
        if (t >= c.lockAt) {
          c.settled = true;
          c.span.textContent = c.ch;
          c.span.style.opacity = "";
          return;
        }
        pending = true;
        if (flap) c.span.textContent = pick(c.pool);
      });

      if (!pending) {
        title.innerHTML = original; // drop the scaffolding once it has resolved
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // Widths are only meaningful once the webfont is in place.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
  else start();
})();
