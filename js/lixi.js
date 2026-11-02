/* Rút lì xì: sau khi đăng nhập lần đầu, người chơi chọn 1 trong 9 bao. Số lượt (2–10) do SERVER random, chỉ rút được 1 lần. */
(function () {
  "use strict";
  const COUNT = 9;
  const state = { busy: false, done: false, onDone: null, onGo: null };

  function el(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function envelope(i) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "lx"; b.dataset.slot = String(i); b.style.setProperty("--i", String(i));
    b.setAttribute("aria-label", I18n.t("lixi.aria", { n: i + 1 }));
    b.innerHTML = '<span class="lx-paper"><b class="lx-num"></b><small data-i18n="lixi.unit"></small></span>' +
      '<span class="lx-body"></span><span class="lx-flap"></span><span class="lx-seal">福</span>';
    b.querySelector("small").textContent = I18n.t("lixi.unit");
    b.addEventListener("click", function () { pick(i); });
    return b;
  }

  function sparks(host) {
    for (let k = 0; k < 12; k++) {
      const s = document.createElement("i"); s.className = "lx-spark";
      const a = (Math.PI * 2 * k) / 12 + Math.random() * 0.4, d = 60 + Math.random() * 40;
      s.style.setProperty("--dx", Math.round(Math.cos(a) * d) + "px");
      s.style.setProperty("--dy", Math.round(Math.sin(a) * d - 30) + "px");
      host.appendChild(s);
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1100);
    }
  }

  async function pick(i) {
    if (state.busy || state.done) return;
    state.busy = true;
    const grid = el("lixi-grid"); grid.classList.add("busy");
    el("lixi-hint").hidden = true;
    const r = await Api.lixiOpen(i);
    const cells = grid.querySelectorAll(".lx");
    if (!r.ok && r.error !== "already") {
      UI.toast(Api.errText(r.error)); state.busy = false; grid.classList.remove("busy"); el("lixi-hint").hidden = false; return;
    }
    if (!r.ok) {                                          // đã rút ở lần trước (mở trang ở hai tab...)
      finish(r.amount, null, -1, cells); return;
    }
    const me = cells[i];
    me.querySelector(".lx-num").textContent = "+" + r.amount;
    me.classList.add("open");
    sparks(me);
    if (window.Sfx && Sfx.wow) Sfx.wow();
    await sleep(1400);
    finish(r.amount, r.all, i, cells);
    if (state.onDone) state.onDone(r);
  }

  function finish(amount, all, picked, cells) {
    state.done = true; state.busy = false;
    el("lixi-grid").classList.remove("busy");
    cells.forEach(function (c, j) {
      c.disabled = true; c.classList.add("done");
      if (j === picked) c.classList.add("picked");
      if (j !== picked) {
        c.classList.add("dim");
        const v = all && all[j] != null ? all[j] : "?";
        c.querySelector(".lx-seal").textContent = "+" + v;
      }
    });
    const res = el("lixi-result");
    res.textContent = picked >= 0 ? I18n.t("lixi.result", { n: amount }) : I18n.t("lixi.already", { n: amount });
    res.hidden = false;
    el("lixi-go").hidden = false;
    el("lixi-go").focus();
  }

  function show(onDone, onGo) {
    if (state.busy) return;                               // đang mở bao thì không dựng lại màn
    state.busy = false; state.done = false; state.onDone = onDone || null; state.onGo = onGo || null;
    const grid = el("lixi-grid"); grid.textContent = ""; grid.classList.remove("busy");
    for (let i = 0; i < COUNT; i++) grid.appendChild(envelope(i));
    el("lixi-result").hidden = true; el("lixi-go").hidden = true; el("lixi-hint").hidden = false;
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("lixi-go").addEventListener("click", function () { if (state.onGo) state.onGo(); });
  });
  window.Lixi = { show: show };
})();
