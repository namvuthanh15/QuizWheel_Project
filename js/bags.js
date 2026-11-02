/* Mở bao lì xì thưởng (sau vòng quay): quay được N bao thì người chơi mở HẾT N bao và nhận TỔNG giá trị.
   Giá trị các bao do SERVER bốc sẵn lúc quay; lần mở đầu tiên server công bố và chốt tiền thưởng (gọi lại không cộng thêm). */
(function () {
  "use strict";
  const COLORS = ["#ffd34d", "#ff3b2f", "#ffffff", "#ff8a1f", "#fff3b0"];
  const state = { playId: "", n: 0, values: null, total: 0, opened: [], count: 0, done: false, loadP: null, allRunning: false, onGo: null };

  function el(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fmt(v) {
    const s = String(Math.round(Number(v) * 100) / 100);
    return (I18n.lang() === "vi" ? s.replace(".", ",") : s) + "K";
  }
  function cells() { return el("bags-grid").querySelectorAll(".lx"); }

  // Pháo giấy: mảnh nhỏ nhiều màu bay ra rồi rơi xuống (host phải có position: absolute/relative)
  function confetti(host, count) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (let k = 0; k < count; k++) {
      const c = document.createElement("i"); c.className = "lx-confetti";
      const a = Math.random() * Math.PI - Math.PI;                       // nửa vòng phía trên
      const d = 60 + Math.random() * 90;
      c.style.setProperty("--dx", Math.round(Math.cos(a) * d) + "px");
      c.style.setProperty("--dy", Math.round(Math.sin(a) * d * 0.8 + 90 + Math.random() * 60) + "px");
      c.style.setProperty("--rot", Math.round(Math.random() * 900 - 450) + "deg");
      c.style.background = COLORS[k % COLORS.length];
      c.style.animationDelay = (Math.random() * 0.15).toFixed(2) + "s";
      host.appendChild(c);
      setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 1700);
    }
  }

  // Gọi server một lần để lấy giá trị các bao (các lần sau dùng lại kết quả)
  function load() {
    if (!state.loadP) {
      state.loadP = Api.openBags(state.playId).then(function (r) {
        if (!r.ok) { state.loadP = null; return r; }
        state.values = r.values; state.total = r.total; return r;
      });
    }
    return state.loadP;
  }

  async function openOne(i) {
    if (state.done || state.opened[i]) return;
    state.opened[i] = true;                                              // chặn bấm đúp
    const r = await load();
    if (!r.ok) { state.opened[i] = false; UI.toast(Api.errText(r.error)); return; }
    const c = cells()[i];
    if (!c) return;
    c.querySelector(".lx-num").textContent = fmt(state.values[i]);
    c.classList.add("open", "win"); c.disabled = true;
    Lixi.sparks(c); confetti(c, 14);
    if (window.Sfx && Sfx.click) Sfx.click();
    state.count++;
    if (state.count >= state.n) { await sleep(900); finish(); }
  }

  async function openAll() {
    if (state.allRunning || state.done) return;
    state.allRunning = true; el("bags-all").hidden = true;
    const r = await load();
    if (!r.ok) { UI.toast(Api.errText(r.error)); state.allRunning = false; el("bags-all").hidden = false; return; }
    for (let i = 0; i < state.n; i++) {
      if (!state.opened[i]) { await openOne(i); await sleep(480); }
    }
  }

  function finish() {
    if (state.done) return;
    state.done = true;
    el("bags-all").hidden = true;
    const parts = state.values.map(fmt).join(" + ");
    const res = el("bags-result");
    res.textContent = I18n.t("bags.result", { x: fmt(state.total) + (state.n > 1 ? " (" + parts + ")" : "") });
    res.hidden = false;
    confetti(res, 40);
    if (window.Sfx && Sfx.wow) Sfx.wow();
    el("bags-go").hidden = false; el("bags-go").focus();
  }

  // opts: { playId, count }
  function show(opts, onGo) {
    opts = opts || {};
    const n = Math.max(1, Math.min(9, Number(opts.count) || 1));
    state.playId = opts.playId || ""; state.n = n; state.values = null; state.total = 0; state.opened = []; state.count = 0;
    state.done = false; state.loadP = null; state.allRunning = false; state.onGo = onGo || null;
    const grid = el("bags-grid"); grid.textContent = "";
    grid.style.gridTemplateColumns = "repeat(" + Math.min(n, 3) + ", 1fr)";
    grid.style.maxWidth = (n >= 3 ? 420 : n * 150) + "px";
    for (let i = 0; i < n; i++) grid.appendChild(Lixi.envelope(i, I18n.t("bags.unit"), openOne));
    el("bags-hint").textContent = I18n.t(n > 1 ? "bags.hint" : "bags.hint1", { n: n });
    el("bags-all").hidden = n < 2;
    el("bags-result").hidden = true; el("bags-go").hidden = true;
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("bags-go").addEventListener("click", function () { if (state.onGo) state.onGo(); });
    el("bags-all").addEventListener("click", openAll);
  });
  window.Bags = { show: show };
})();
