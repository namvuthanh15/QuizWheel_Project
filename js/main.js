// main.js – điểm khởi động: gắn sự kiện, điều phối màn hình, đăng nhập bằng tên + PIN, xác nhận trước khi dùng lượt.
// Từ phiên bản Supabase: mọi thứ quan trọng (lượt, câu hỏi, đáp án, kết quả quay) nằm ở server; file này chỉ điều phối giao diện.
(function () {
  const session = { player: null, busy: false };
  const NEED_LOGIN = ["levels", "count", "quiz", "typed", "wheel", "history"];

  /* ---------- Người chơi hiện tại + thanh trạng thái ---------- */
  function setPlayer(p) { session.player = p || null; paintUser(); }
  function paintUser() {
    const p = session.player;
    UI.$("#userbar").hidden = !p;
    if (!p) return;
    UI.$("#user-name").textContent = p.name;
    UI.$("#user-turns").textContent = I18n.t("user.turns", { n: p.turns }) + (p.freeLeft > 0 ? " · " + I18n.t("user.free", { n: p.freeLeft }) : "");
  }
  async function refreshState() {
    const r = await Api.state();
    if (r.ok) setPlayer(r.player); else if (r.error === "auth") { setPlayer(null); showLogin(I18n.t("err.auth")); }
    return r;
  }
  async function refreshConfig() { const c = await Api.config(); if (c.ok) { Store.setRemote(c); refreshPrices(); } return c; }

  /* ---------- Điều phối màn hình ---------- */
  // opts chỉ dùng cho màn hình vòng quay: { level, once, playId }
  function go(name, opts) {
    if (NEED_LOGIN.indexOf(name) >= 0 && Api.configured && !session.player) { name = "login"; }
    if (name !== "quiz") Quiz.reset();
    if (name === "host" && !Store.isHostMode()) return;
    if (name === "host") Host.open();
    if (name === "settings") Lang.close();
    if (name === "levels") { refreshPrices(); refreshState(); refreshConfig(); }
    if (name === "count") buildCount(opts && opts.level);
    if (name === "history") buildHistory();
    if (name === "wheel") Wheel.open(opts); else Wheel.stop();
    UI.showScreen(name);
    Sfx.screen(name);
  }

  function showLogin(msg) {
    UI.$("#login-error").textContent = msg || "";
    UI.$("#login-pin").value = "";
    go("login");
  }

  function refreshPrices() {
    document.querySelectorAll(".level-btn").forEach(function (btn) {
      const level = btn.dataset.level, price = Store.LEVEL_PRICES[level];
      const span = btn.querySelector(".level-price");
      if (span) span.textContent = price;
      btn.setAttribute("aria-label", I18n.t("levels.aria", { level: Store.LEVEL_NAMES[level], price: price }));
    });
  }

  /* ---------- Đăng nhập / đăng xuất / khôi phục ván dở ---------- */
  async function afterLogin(st) {
    setPlayer(st.player);
    if (st.active) { UI.toast(I18n.t("main.resume")); runQuiz({ playId: st.active.playId, level: st.active.level, total: st.active.total }); return; }
    if (st.pendingSpin) { UI.toast(I18n.t("main.resume")); playWheel(st.pendingSpin.playId, st.pendingSpin.wheel); return; }
    go("home");
  }

  async function doLogin(e) {
    e.preventDefault();
    if (session.busy) return;
    const name = UI.$("#login-name").value.trim(), pin = UI.$("#login-pin").value;
    if (!name || !pin) { UI.$("#login-error").textContent = I18n.t("err.invalid"); return; }
    session.busy = true; UI.$("#login-submit").disabled = true; UI.$("#login-error").textContent = "";
    try {
      const r = await Api.login(name, pin);
      if (!r.ok) { UI.$("#login-error").textContent = Api.errText(r.error); UI.$("#login-pin").value = ""; return; }
      UI.$("#login-pin").value = "";
      const st = await Api.state();
      if (!st.ok) { UI.$("#login-error").textContent = Api.errText(st.error); return; }
      await refreshConfig();
      await afterLogin(st);
    } finally { session.busy = false; UI.$("#login-submit").disabled = false; }
  }

  async function doLogout() {
    await Api.logout();
    setPlayer(null);
    showLogin("");
  }

  async function boot() {
    if (!Api.configured) { showLogin(I18n.t("err.config")); return; }
    const c = await refreshConfig();
    if (!c.ok) { showLogin(Api.errText(c.error)); return; }
    if (Api.hasToken()) {
      const st = await Api.state();
      if (st.ok) { await afterLogin(st); return; }
    }
    showLogin("");
  }

  /* ---------- Luồng chơi ---------- */
  function playWheel(playId, wheel) { go("wheel", { level: wheel, once: true, playId: playId }); }

  function runQuiz(play) {
    Wheel.stop(); Sfx.screen("quiz");
    Quiz.run(play, function (res) { if (res.wheel) playWheel(res.playId, res.wheel); });
  }

  // Lỗi khi bắt đầu ván. Còn ván dở (hoặc vòng quay chưa quay) thì đưa người chơi về đúng chỗ đó.
  async function startFailed(r) {
    UI.toast(Api.errText(r.error));
    if (r.error === "active" || r.error === "pending_spin") { const st = await Api.state(); if (st.ok) await afterLogin(st); }
    else await refreshState();
  }

  // Hỏi xác nhận rồi mới gọi server (server trừ lượt NGAY khi bắt đầu, nên phải hỏi trước)
  async function askAndStart(level, count) {
    if (session.busy) return;
    const cost = Store.cost(level), turns = session.player ? session.player.turns : 0;
    if (turns < cost) { UI.toast(Api.errText("no_turns")); return; }
    const msg = cost > 0
      ? I18n.t("confirm.quiz", { level: Store.LEVEL_NAMES[level], n: count, cost: cost, turns: turns, after: turns - cost })
      : I18n.t("confirm.quizFree", { level: Store.LEVEL_NAMES[level], n: count });
    if (!(await UI.confirm(msg))) return;
    session.busy = true;
    try {
      const r = await Api.start(level, count);
      if (!r.ok) { await startFailed(r); return; }
      if (session.player) setPlayer(Object.assign({}, session.player, { turns: r.turns }));
      runQuiz({ playId: r.playId, level: r.level, total: r.total });
    } finally { session.busy = false; }
  }

  async function askAndSpinFree() {
    if (session.busy) return;
    const left = session.player ? session.player.freeLeft : 0;
    if (left < 1) { UI.toast(Api.errText("free_used")); return; }
    if (!(await UI.confirm(I18n.t("confirm.free", { left: left })))) return;
    session.busy = true;
    try {
      const r = await Api.start("free");
      if (!r.ok) { await startFailed(r); return; }
      await refreshState();
      playWheel(r.playId, "free");
    } finally { session.busy = false; }
  }

  function playLevel(level) {
    if (level === "free") { askAndSpinFree(); return; }
    const rule = Quiz.rules[level];
    if (!rule) { UI.toast(I18n.t("main.later")); return; }
    if (rule.counts.length > 1) go("count", { level: level });
    else askAndStart(level, rule.counts[0]);
  }

  // Màn "Chọn số câu hỏi": ô nào kho câu hỏi chưa đủ thì bị khóa (số câu trong kho lấy từ server, không có nội dung câu hỏi)
  let countLevel = "";
  function buildCount(level) {
    const rule = Quiz.rules[level];
    if (!rule) return;
    countLevel = level;
    const have = Store.poolCount(level);
    UI.$("#count-level").textContent = Store.LEVEL_LABELS[level] || "";
    const grid = UI.$("#count-grid");
    grid.textContent = "";
    rule.counts.forEach(function (n) {
      const btn = UI.el("button", "count-btn"); btn.type = "button";
      btn.disabled = have < n;
      btn.setAttribute("aria-label", I18n.t("count.aria", { n: n }));
      btn.append(UI.el("span", "game-text count-num", String(n)), UI.el("span", "count-unit", I18n.t("count.unit")));
      if (have < n) btn.appendChild(UI.el("span", "count-locked", I18n.t("count.locked")));
      btn.addEventListener("click", function () { askAndStart(level, n); });
      grid.appendChild(btn);
    });
    UI.$("#count-note").textContent = have < rule.counts[0] ? I18n.t("main.poolLow", { count: rule.counts[0], have: have }) : "";
  }

  /* ---------- Lịch sử của người chơi ---------- */
  function fmtK(v) { return String(Math.round(Number(v) * 10) / 10) + "K"; }
  async function buildHistory() {
    const box = UI.$("#history-list"), sum = UI.$("#history-sum");
    box.textContent = ""; sum.textContent = I18n.t("history.loading");
    const r = await Api.history();
    if (!r.ok) { sum.textContent = Api.errText(r.error); return; }
    const owed = Math.max(0, Number(r.rewardK) - Number(r.paidK));
    sum.textContent = I18n.t("history.sum", { won: fmtK(r.rewardK), paid: fmtK(r.paidK), owed: fmtK(owed) });
    if (!r.items.length) { box.appendChild(UI.el("li", "host-empty", I18n.t("history.empty"))); return; }
    r.items.forEach(function (it) {
      const li = UI.el("li", "hist-item");
      const when = new Date(it.at).toLocaleString(I18n.lang() === "vi" ? "vi-VN" : "en-GB");
      const name = it.kind === "free" ? Store.LEVEL_NAMES.free : Store.LEVEL_NAMES[it.level] || it.level;
      const score = it.kind === "quiz" ? it.solved + "/" + (it.level === "impossible" ? 2 : it.total) : "";
      let result;
      if (it.rewardLabel) result = it.rewardLabel;
      else if (it.wheel && !it.spun) result = I18n.t("history.pendingSpin");
      else if (it.status === "active") result = I18n.t("history.active");
      else result = "—";
      li.append(UI.el("span", "hist-when", when), UI.el("span", "hist-name", name), UI.el("span", "hist-score", score), UI.el("b", "hist-result", result));
      box.appendChild(li);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    const hp = new URLSearchParams(location.search).get("host");
    if (hp === "1") Store.setHostMode(true); else if (hp === "0") { Store.setHostMode(false); Publish.clearToken(); }
    const hostOk = Store.isHostMode();
    document.querySelectorAll("[data-host-only]").forEach(function (el) { el.hidden = !hostOk; });

    document.addEventListener("click", function (e) {
      const target = e.target.closest("[data-nav]");
      if (!target) return;
      e.preventDefault();
      go(target.dataset.nav);
    });

    document.querySelectorAll(".img-btn, .level-btn").forEach(function (btn) {
      function inside(e) {
        const r = btn.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      }
      btn.addEventListener("pointerdown", function () { btn.classList.add("pressed"); });
      btn.addEventListener("pointermove", function (e) { btn.classList.toggle("pressed", e.buttons > 0 && inside(e)); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
        btn.addEventListener(ev, function () { btn.classList.remove("pressed"); });
      });
    });

    UI.$("#btn-start").addEventListener("click", function () { go("levels"); });
    UI.$("#btn-setting").addEventListener("click", function () { go("settings"); });
    UI.$("#login-form").addEventListener("submit", doLogin);
    UI.$("#btn-logout").addEventListener("click", doLogout);

    document.querySelectorAll(".level-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { playLevel(btn.dataset.level); });
    });

    UI.$("#quiz-continue").addEventListener("click", Quiz.proceed);
    refreshPrices();
    I18n.onChange(function () { refreshPrices(); paintUser(); });
    I18n.onChange(function () { if (countLevel && !UI.$("#screen-count").hidden) buildCount(countLevel); });

    const blanks = Array.from(document.querySelectorAll(".blank"));
    blanks.forEach(function (inp, i) {
      inp.addEventListener("input", function () {
        inp.value = inp.value.replace(/\D/g, "");
        if (inp.value.length >= inp.maxLength && blanks[i + 1]) blanks[i + 1].focus();
      });
      inp.addEventListener("keydown", function (e) {
        if ((e.key === "/" || e.key === "." || e.key === "-") && blanks[i + 1]) { e.preventDefault(); blanks[i + 1].focus(); }
        else if (e.key === "Backspace" && inp.value === "" && blanks[i - 1]) { e.preventDefault(); blanks[i - 1].focus(); }
      });
    });
    UI.$("#typed-form").addEventListener("submit", function (e) { e.preventDefault(); Quiz.submitTyped(); });
    UI.$("#quiz-next").addEventListener("click", Quiz.next);

    UI.$("#w-preview").addEventListener("click", function () { go("wheel", { level: UI.$("#w-level").value, once: false }); });
    UI.$("#wheel-edit").addEventListener("click", function () { go("host"); Host.showTab("wheel", Wheel.level()); });

    UI.$("#reveal").addEventListener("click", UI.hideReveal);
    Lang.init();
    Sfx.init();
    Wheel.init();
    Host.init();
    Publish.init();
    Settings.init();
    go("home");
    boot();
  });
})();
