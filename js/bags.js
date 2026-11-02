/* Rút bao lì xì thưởng (sau vòng quay): hiện đúng số bao quay được, người chơi chọn 1 bao, chỉ bao đó được lật.
   Giá trị trong bao do SERVER bốc sẵn khi quay; chọn bao nào cũng như nhau. */
(function () {
  "use strict";
  const state = { busy: false, done: false, playId: "", onGo: null };
  const COLORS = ["#ffd34d", "#ff3b2f", "#ffffff", "#ff8a1f", "#fff3b0"];

  function el(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fmt(v) {
    const s = String(Math.round(Number(v) * 100) / 100);
    return (I18n.lang() === "vi" ? s.replace(".", ",") : s) + "K";
  }

  // Pháo giấy: mảnh nhỏ nhiều màu bay ra rồi rơi xuống
  function confetti(host) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let k = 0; k < 26; k++) {
      const c = document.createElement("i"); c.className = "lx-confetti";
      const a = Math.random() * Math.PI - Math.PI;                       // nửa vòng phía trên
      const d = 70 + Math.random() * 90;
      c.style.setProperty("--dx", Math.round(Math.cos(a) * d) + "px");
      c.style.setProperty("--dy", Math.round(Math.sin(a) * d * 0.8 + 90 + Math.random() * 60) + "px");
      c.style.setProperty("--rot", Math.round(Math.random() * 900 - 450) + "deg");
      c.style.background = COLORS[k % COLORS.length];
      c.style.animationDelay = (Math.random() * 0.15).toFixed(2) + "s";
      host.appendChild(c);
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 1700);
    }
  }

  async function pick(i) {
    if (state.busy || state.done) return;
    state.busy = true;
    const grid = el("bags-grid"); grid.classList.add("busy");
    const r = await Api.pickBag(state.playId, i);
    if (!r.ok) {
      UI.toast(Api.errText(r.error)); state.busy = false; grid.classList.remove("busy"); return;
    }
    const cells = grid.querySelectorAll(".lx");
    const slot = typeof r.slot === "number" ? r.slot : i;                // nếu đã chọn từ trước thì hiện đúng bao cũ
    const me = cells[slot];
    me.querySelector(".lx-num").textContent = fmt(r.amount);
    me.classList.add("open", "win");
    Lixi.sparks(me); confetti(me);
    if (window.Sfx && Sfx.wow) Sfx.wow();
    await sleep(1500);
    state.done = true; state.busy = false;
    grid.classList.remove("busy");
    cells.forEach(function (c, j) { c.disabled = true; c.classList.add("done"); if (j !== slot) c.classList.add("rest"); });
    const res = el("bags-result");
    res.textContent = I18n.t("bags.result", { x: fmt(r.amount) });
    res.hidden = false;
    el("bags-go").hidden = false; el("bags-go").focus();
  }

  // opts: { playId, count }
  function show(opts, onGo) {
    if (state.busy) return;
    opts = opts || {};
    const n = Math.max(1, Math.min(9, Number(opts.count) || 1));
    state.busy = false; state.done = false; state.playId = opts.playId || ""; state.onGo = onGo || null;
    const grid = el("bags-grid"); grid.textContent = ""; grid.classList.remove("busy");
    grid.style.gridTemplateColumns = "repeat(" + Math.min(n, 3) + ", 1fr)";
    grid.style.maxWidth = (n >= 3 ? 420 : n * 150) + "px";
    for (let i = 0; i < n; i++) grid.appendChild(Lixi.envelope(i, I18n.t("bags.unit"), pick));
    el("bags-hint").textContent = I18n.t("bags.hint", { n: n });
    el("bags-result").hidden = true; el("bags-go").hidden = true;
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("bags-go").addEventListener("click", function () { if (state.onGo) state.onGo(); });
  });
  window.Bags = { show: show };
})();
