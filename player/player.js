/* PrimeEdu — player local.
 * Lê window.DECK (gerado por tools/build_deck.py a partir de project/) e apresenta
 * os slides 1920×1080 com: escala automática, animações de entrada (data-build-in),
 * transições (fade | push | magic), ícones (x-icon), embeds (x-embed) e vídeos (data-video).
 *
 * Teclas: → / Espaço / PageDown / clique = avançar · ← / PageUp = voltar
 *         Home / End = primeiro / último · F = tela cheia · N = notas · número + Enter = ir para o slide
 */
(function () {
  "use strict";
  var W = 1920, H = 1080;
  var BUILD_MS = 380, FIRST_AUTO_MS = 600, NEXT_AUTO_MS = BUILD_MS + 140, TRANS_MS = 600;

  var deck = window.DECK, icons = window.ICONS || {};
  var stage = document.getElementById("stage");
  var notesEl = document.getElementById("notes");
  var hud = document.getElementById("hud");
  var order = deck.order.filter(function (id) { return deck.slides[id]; });
  var cur = -1, step = 0, steps = [], timer = null, busy = false, typed = "";

  document.title = deck.title || "Apresentação";

  /* ---------- scale ---------- */
  function fit() {
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.transform = "scale(" + s + ")";
    stage.style.left = (window.innerWidth - W * s) / 2 + "px";
    stage.style.top = (window.innerHeight - H * s) / 2 + "px";
    stage._scale = s;
  }
  window.addEventListener("resize", fit);

  /* ---------- build a slide element from its HTML ---------- */
  function makeSlide(id) {
    var tpl = document.createElement("template");
    tpl.innerHTML = deck.slides[id].trim();
    var sec = tpl.content.querySelector("section");

    // notes
    var aside = sec.querySelector("aside");
    sec._notes = aside ? aside.textContent.trim() : "";

    // icons
    sec.querySelectorAll("x-icon").forEach(function (el) {
      var span = document.createElement("span");
      span.className = "x-icon";
      span.setAttribute("style", el.getAttribute("style") || "");
      span.setAttribute("role", "img");
      span.setAttribute("aria-label", el.getAttribute("name"));
      var body = icons[el.getAttribute("name")] || icons.Star;
      span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + "</svg>";
      copyAttrs(el, span, ["id", "data-build-in", "data-build-out"]);
      el.replaceWith(span);
    });

    // embeds → iframes (srcdoc set when the slide is shown, so the animation restarts)
    sec.querySelectorAll("x-embed").forEach(function (el) {
      var f = document.createElement("iframe");
      f.className = "x-embed";
      f.setAttribute("sandbox", "allow-scripts");
      f.setAttribute("style", el.getAttribute("style") || "");
      f.setAttribute("scrolling", "no");
      f._srcdoc = el.innerHTML;
      copyAttrs(el, f, ["id", "data-build-in", "data-build-out"]);
      el.replaceWith(f);
    });

    // data-video images → <video>
    sec.querySelectorAll("img[data-video]").forEach(function (img) {
      var v = document.createElement("video");
      v.setAttribute("style", img.getAttribute("style") || "");
      v.muted = img.getAttribute("data-video-sound") !== "on";
      v.loop = true; v.playsInline = true; v.preload = "auto";
      v.poster = img.getAttribute("src");
      v.src = img.getAttribute("data-video");
      v._delay = parseFloat(img.getAttribute("data-video-delay") || "0") || 0;
      v.setAttribute("aria-label", img.getAttribute("alt") || "");
      copyAttrs(img, v, ["id", "data-build-in", "data-build-out", "data-crop", "data-pdf-link"]);
      if (!/object-fit/.test(v.getAttribute("style"))) v.style.objectFit = "cover";
      img.replaceWith(v);
      // data-video-click="pause": clicar no vídeo pausa/retoma (em vez de avançar); um selo de play aparece enquanto pausado.
      if (img.getAttribute("data-video-click") !== "pause") return;
      var badge = document.createElement("div");
      badge.className = "video-paused";
      ["left", "top", "width", "height"].forEach(function (k) { badge.style[k] = v.style[k]; });
      badge.innerHTML = '<span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>';
      v.after(badge);
      v._badge = badge;
      v.style.cursor = "pointer";
      v.addEventListener("click", function (e) {
        e.stopPropagation();
        if (firstGesture()) return;
        clearTimeout(v._t);
        if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); badge.classList.remove("on"); }
        else { v.pause(); badge.classList.add("on"); }
      });
    });

    // data-crop="ZOOM X% Y%" → object-position (+ zoom)
    sec.querySelectorAll("[data-crop]").forEach(function (el) {
      var p = el.getAttribute("data-crop").split(/\s+/);
      if (p.length >= 3) { el.style.objectFit = "cover"; el.style.objectPosition = p[1] + " " + p[2]; }
    });

    // builds
    var bmap = {};
    sec.querySelectorAll("[data-build-in]").forEach(function (el) {
      var parts = el.getAttribute("data-build-in").trim().split(/\s+/);
      var eff = parts[0], ord = 1, auto = false;
      parts.slice(1).forEach(function (t) { if (t === "auto") auto = true; else if (/^\d+$/.test(t)) ord = +t; });
      el._eff = eff;
      (bmap[ord] = bmap[ord] || { order: ord, auto: false, els: [] }).els.push(el);
      if (auto) bmap[ord].auto = true;
    });
    sec._steps = Object.keys(bmap).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return bmap[k]; });
    sec._transition = sec.getAttribute("data-transition") || "fade";
    return sec;
  }
  function copyAttrs(from, to, names) {
    names.forEach(function (n) { if (from.hasAttribute(n)) to.setAttribute(n, from.getAttribute(n)); });
  }

  /* ---------- builds ---------- */
  function hideBuilds(sec) {
    sec.classList.add("no-anim");
    sec._steps.forEach(function (s) { s.els.forEach(function (el) { el.classList.add("b-hidden", "b-" + el._eff); }); });
    void sec.offsetWidth;
    sec.classList.remove("no-anim");
  }
  function showStep(sec, i) {
    sec._steps[i].els.forEach(function (el) {
      if (el._eff === "pop") el.classList.add("b-pop-in");
      el.classList.remove("b-hidden");
    });
  }
  function showAll(sec) {
    sec.classList.add("no-anim");
    sec._steps.forEach(function (s) { s.els.forEach(function (el) { el.classList.remove("b-hidden"); }); });
    void sec.offsetWidth; sec.classList.remove("no-anim");
  }
  function scheduleAuto(sec, first) {
    clearTimeout(timer);
    if (step >= sec._steps.length || !sec._steps[step].auto) return;
    timer = setTimeout(function () { nextStep(); }, first ? FIRST_AUTO_MS : NEXT_AUTO_MS);
  }
  function nextStep() {
    var sec = stage._current;
    if (!sec || step >= sec._steps.length) return false;
    showStep(sec, step); step++;
    scheduleAuto(sec, false);
    return true;
  }

  /* ---------- media ---------- */
  function startMedia(sec) {
    sec.querySelectorAll("iframe.x-embed").forEach(function (f) { f.srcdoc = f._srcdoc; });
    sec.querySelectorAll("video").forEach(function (v) {
      try { v.currentTime = 0; } catch (e) {}
      clearTimeout(v._t);
      if (v._badge) v._badge.classList.remove("on");
      v._t = setTimeout(function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); }, v._delay * 1000);
    });
  }
  function stopMedia(sec) {
    sec.querySelectorAll("video").forEach(function (v) { clearTimeout(v._t); v.pause(); });
    sec.querySelectorAll("iframe.x-embed").forEach(function (f) { f.srcdoc = ""; });
  }

  /* ---------- navigation ---------- */
  function rectOf(el) {
    var s = stage._scale || 1, r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    return { x: (r.left - sr.left) / s, y: (r.top - sr.top) / s, w: r.width / s, h: r.height / s };
  }

  function go(i, opts) {
    opts = opts || {};
    if (i < 0 || i >= order.length || busy) return;
    clearTimeout(timer);
    var old = stage._current;
    var sec = makeSlide(order[i]);
    var forward = i > cur;
    var trans = old ? (forward ? old._transition : "fade") : "none";
    if (opts.instant) trans = "none";

    // magic move pairs (ids present in both slides)
    var pairs = [];
    if (trans === "magic" && old) {
      sec.querySelectorAll("[id]").forEach(function (el) {
        var o = old.querySelector("#" + CSS.escape(el.id));
        if (o && el.id !== sec.id) pairs.push([o, el]);
      });
    }
    var oldRects = pairs.map(function (p) { return rectOf(p[0]); });

    if (trans === "magic" && old) stage.insertBefore(sec, old); else stage.appendChild(sec);
    if (opts.built) { step = sec._steps.length; showAll(sec); }
    else { step = 0; hideBuilds(sec); }
    cur = i; stage._current = sec;
    notesEl.textContent = sec._notes; hud.textContent = (i + 1) + " / " + order.length;
    try { history.replaceState(null, "", "#" + (i + 1)); } catch (e) {}

    var done = function () {
      if (old && old.parentNode) { stopMedia(old); old.remove(); }
      sec.style.transition = ""; sec.style.opacity = ""; sec.style.translate = "";
      busy = false;
    };

    if (trans === "none" || !old) { done(); }
    else {
      busy = true;
      if (trans === "push") {
        var dir = forward ? 1 : -1;
        sec.style.translate = (W * dir) + "px 0";
        void sec.offsetWidth;
        sec.style.transition = old.style.transition = "translate " + TRANS_MS + "ms cubic-bezier(.65,0,.35,1)";
        sec.style.translate = "0 0"; old.style.translate = (-W * dir) + "px 0";
      } else if (trans !== "magic") {
        sec.style.opacity = 0;
        void sec.offsetWidth;
        sec.style.transition = "opacity " + TRANS_MS + "ms ease";
        sec.style.opacity = 1;
      } else {
        {
          pairs.forEach(function (p, k) {
            var el = p[1], a = oldRects[k], b = rectOf(el);
            if (!b.w || !b.h) return;
            p[0].style.visibility = "hidden";
            el.classList.remove("b-hidden");
            el.style.transformOrigin = "0 0";
            el.style.transition = "none";
            el.style.translate = (a.x - b.x) + "px " + (a.y - b.y) + "px";
            el.style.scale = (a.w / b.w) + " " + (a.h / b.h);
            void el.offsetWidth;
            el.style.transition = "translate " + TRANS_MS + "ms cubic-bezier(.65,0,.35,1), scale " + TRANS_MS + "ms cubic-bezier(.65,0,.35,1)";
            el.style.translate = "0 0"; el.style.scale = "1";
          });
          old.style.transition = "opacity " + TRANS_MS + "ms ease"; old.style.opacity = 0;
        }
      }
      setTimeout(done, TRANS_MS + 40);
    }
    startMedia(sec);
    if (!opts.built) scheduleAuto(sec, true);
  }

  function next() { if (busy) return; if (!nextStep()) go(cur + 1); }
  function prev() { if (busy) return; go(cur - 1, { built: true }); }

  // Tela cheia: o navegador só permite após um gesto, então o 1º clique/tecla de navegação entra em tela cheia (sem avançar).
  var canFs = !!document.documentElement.requestFullscreen;
  var autoFs = canFs;
  function enterFs() { autoFs = false; if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {}); }
  function toggleFs() { if (!document.fullscreenElement) enterFs(); else document.exitFullscreen(); }
  function firstGesture() { if (!autoFs) return false; enterFs(); return true; }
  var fsBtn = document.getElementById("fs-btn");
  if (canFs) fsBtn.addEventListener("click", function () { fsBtn.blur(); enterFs(); }); else fsBtn.remove();
  var pdfBtn = document.getElementById("pdf-btn");
  pdfBtn.addEventListener("click", function () { pdfBtn.blur(); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); if (!firstGesture()) next(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); if (!firstGesture()) prev(); }
    else if (e.key === "Home") go(0, { instant: true });
    else if (e.key === "End") go(order.length - 1, { instant: true, built: true });
    else if (e.key === "f" || e.key === "F") { if (canFs) toggleFs(); }
    else if (e.key === "n" || e.key === "N") notesEl.classList.toggle("on");
    else if (/^\d$/.test(e.key)) typed += e.key;
    else if (e.key === "Enter" && typed) { go(Math.max(0, Math.min(order.length - 1, +typed - 1)), { instant: true }); typed = ""; }
  });
  document.getElementById("viewport").addEventListener("click", function () { if (!firstGesture()) next(); });

  var helpEl = document.getElementById("help");
  setTimeout(function () { helpEl.style.opacity = 0; }, 5000);

  /* ---------- modo PDF (index.html?print): todos os slides montados, um por página ---------- */
  // Usado por tools/build_pdf.py. Vídeos viram a imagem de capa; com data-pdf-link ganham um link para assistir.
  var params = new URLSearchParams(location.search);
  if (params.has("print")) {
    var base = params.get("base") || location.href;
    document.documentElement.classList.add("print");
    order.forEach(function (id) {
      var sec = makeSlide(id);
      sec.querySelectorAll("video").forEach(function (v) {
        var img = document.createElement("img");
        img.setAttribute("style", v.getAttribute("style") || "");
        img.src = v.poster; img.alt = v.getAttribute("aria-label") || "";
        v.replaceWith(img);
        if (v._badge) v._badge.remove();
        if (!v.hasAttribute("data-pdf-link")) return;
        var a = document.createElement("a");
        a.className = "pdf-video-link";
        a.href = new URL(v.getAttribute("src"), base).href;
        a.innerHTML = '<span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' + v.getAttribute("data-pdf-link") + "</span>";
        sec.appendChild(a);
      });
      sec.querySelectorAll("iframe.x-embed").forEach(function (f) { f.srcdoc = f._srcdoc; });
      stage.appendChild(sec);
    });
    return;
  }

  fit();
  var start = parseInt((location.hash || "").slice(1), 10);
  var begin = function () { go(start > 0 ? Math.min(start, order.length) - 1 : 0, { instant: true }); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(begin); else begin();
})();
