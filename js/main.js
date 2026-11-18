// main.js – điểm khởi động: gắn sự kiện, điều phối màn hình, đăng nhập bằng tên + PIN, xác nhận trước khi dùng lượt.
// Từ phiên bản Supabase: mọi thứ quan trọng (lượt, câu hỏi, đáp án, kết quả quay) nằm ở server; file này chỉ điều phối giao diện.
(function () {
  const session = { player: null, busy: false };

  // Link host gửi có dạng index.html?u=Nam: chỉ điền sẵn ô Tên, KHÔNG tự đăng nhập (PIN vẫn phải gõ).
  const prefillName = (function () {
    const raw = new URLSearchParams(location.search).get("u");
    return raw ? raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 30) : "";
  })();
  // So tên kiểu đơn giản (bỏ dấu, bỏ hoa thường, gộp khoảng trắng) – chỉ dùng để đoán xem máy này đang đăng nhập đúng người trong link chưa.
  function normName(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/\s+/g, " ").trim();
  }
  const NEED_LOGIN = ["levels", "count", "quiz", "typed", "wheel", "history", "lixi", "bags", "gacha", "blackjack"];

  /* ---------- Người chơi hiện tại + thanh trạng thái ---------- */
  function setPlayer(p) { session.player = p || null; paintUser(); paintLocks(); }
  // Mức Impossible đã khóa (đã quay Gacha / đã thắng quiz): làm xám ảnh + dán nhãn "ĐÃ KHÓA" cho tới khi host mở lại
  function paintLocks() {
    const btn = document.querySelector('.level-btn[data-level="impossible"]');
    if (!btn) return;
    const locked = !!(session.player && session.player.impLocked);
    btn.classList.toggle("locked", locked);
    if (locked) btn.dataset.lockText = I18n.t("imp.lockedTag"); else delete btn.dataset.lockText;
  }
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
  async function refreshConfig() { const c = await Api.config(); if (c.ok) { Store.setRemote(c); refreshPrices(); paintBlackjackBtn(c.bjEnabled); } return c; }
  // Host tắt Blackjack (admin_bj_config) thì ẩn nút ở trang chủ; server cũ chưa có 12-blackjack.sql thì bjEnabled không có -> giữ nguyên nút
  function paintBlackjackBtn(enabled) { const b = UI.$("#btn-blackjack"); if (b) b.hidden = enabled === false; }

  /* ---------- Điều phối màn hình ---------- */
  // opts chỉ dùng cho màn hình vòng quay: { level, once, playId }
  function go(name, opts) {
    if (NEED_LOGIN.indexOf(name) >= 0 && Api.configured && !session.player) { name = "login"; }
    // Người chơi chưa rút lì xì thì phải rút trước khi vào các màn chơi thường
    if (session.player && session.player.lixiPending && (name === "levels" || name === "count" || name === "history")) name = "lixi";
    if (name !== "quiz") Quiz.reset();
    if (name === "lixi") Lixi.show(onLixiDone, function () { go("levels"); });
    if (name === "bags") Bags.show(opts, function () { go("levels"); });
    if (name === "settings") Lang.close();
    if (name === "levels") { refreshPrices(); refreshState(); refreshConfig(); }
    if (name === "count") buildCount(opts && opts.level);
    if (name === "history") buildHistory();
    if (name === "wheel") Wheel.open(opts); else Wheel.stop();
    if (name === "gacha") Gacha.open(gachaCtx()); else Gacha.stop();
    if (name === "blackjack") Blackjack.open(); else Blackjack.stop(); // rời màn Blackjack: hủy hoạt ảnh, dọn bàn
    UI.showScreen(name);
    Sfx.screen(name);
  }

  function showLogin(msg) {
    UI.$("#login-error").textContent = msg || "";
    UI.$("#login-pin").value = "";
    if (prefillName && !UI.$("#login-name").value) UI.$("#login-name").value = prefillName;
    go("login");
    setTimeout(function () {
      const el = UI.$(UI.$("#login-name").value ? "#login-pin" : "#login-name");
      if (el) el.focus();
    }, 0);
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
    if (st.pendingBag) { UI.toast(I18n.t("main.resume")); go("bags", { playId: st.pendingBag.playId, count: st.pendingBag.count }); return; }
    if (st.player && st.player.lixiPending) { go("lixi"); return; }
    go("home");
  }

  // Rút lì xì xong: cập nhật số lượt trên thanh trên cùng, mở khóa các màn chơi
  function onLixiDone(r) {
    if (session.player) { session.player.lixiPending = false; session.player.turns = r.turns; paintUser(); }
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
      if (st.ok) {
        // Mở link của người khác trên máy đang đăng nhập sẵn -> đăng xuất để họ nhập PIN của mình.
        if (prefillName && normName(st.player && st.player.name) !== normName(prefillName)) {
          await Api.logout(); setPlayer(null); showLogin(""); return;
        }
        await afterLogin(st); return;
      }
    }
    showLogin("");
  }

  /* ---------- Luồng chơi ---------- */
  // Vòng quay (Easy/Hard) quay ra số bao; bấm "Rút lì xì" thì sang màn chọn bao
  function playWheel(playId, wheel) {
    go("wheel", { level: wheel, once: true, playId: playId, onBags: function (pid, n) { go("bags", { playId: pid, count: n }); } });
  }

  // Sau khi người chơi xác nhận thoát ván: về màn chọn mức (nếu vì lý do nào đó còn ván dở / vòng quay chưa quay thì đưa về đúng chỗ đó)
  async function afterLeave() {
    const st = await Api.state();
    if (st.ok && (st.active || st.pendingSpin || st.pendingBag)) { await afterLogin(st); return; }
    go("levels");
  }

  function runQuiz(play) {
    Wheel.stop(); Sfx.screen("quiz");
    Quiz.run(play, function (res) { if (res.wheel) playWheel(res.playId, res.wheel); }, afterLeave);
  }

  // Lỗi khi bắt đầu ván. Còn ván dở (hoặc vòng quay chưa quay) thì đưa người chơi về đúng chỗ đó.
  async function startFailed(r) {
    UI.toast(Api.errText(r.error));
    if (r.error === "active" || r.error === "pending_spin") { const st = await Api.state(); if (st.ok) await afterLogin(st); }
    else await refreshState();
  }

  // Hỏi xác nhận rồi mới gọi server (server trừ lượt NGAY khi bắt đầu, nên phải hỏi trước)
  async function askAndStart(level, count, note) {
    if (session.busy) return;
    const cost = Store.cost(level), turns = session.player ? session.player.turns : 0;
    if (turns < cost) { UI.toast(Api.errText("no_turns")); return; }
    const msg = cost > 0
      ? I18n.t("confirm.quiz", { level: Store.LEVEL_NAMES[level], n: count, cost: cost, turns: turns, after: turns - cost })
      : I18n.t("confirm.quizFree", { level: Store.LEVEL_NAMES[level], n: count });
    const fullMsg = note ? msg + "\n\n" + note : msg;
    if (!(await UI.confirm(fullMsg))) return;
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

  // Mức Impossible: bảng chọn giữa trả lời quiz và GACHA (nếu mức đang khóa thì báo và dừng)
  async function impossibleEntry() {
    if (session.busy) return;
    session.busy = true;
    let choice;
    try {
      const st = await refreshState();
      if (!st.ok) { UI.toast(Api.errText(st.error)); return; }
      const p = session.player;
      if (p.impLocked) { UI.toast(I18n.t("imp.lockedMsg")); return; }
      choice = await Gacha.choose({ turns: p.turns, gachaLeft: p.gachaLeft });
    } finally { session.busy = false; }
    if (choice === "gacha") go("gacha");
    else if (choice === "quiz") askAndStart("impossible", Quiz.rules.impossible.counts[0], I18n.t("imp.quizWarn"));
  }

  // Máy Gacha báo lại cho main.js: kết quả (đã trừ lượt + khóa mức ở server), lỗi, thoát
  function gachaCtx() {
    return {
      onResult: function (r) { if (session.player) setPlayer(Object.assign({}, session.player, { turns: r.turns, impLocked: true, gachaLeft: 0 })); },
      onError: async function (code) { UI.toast(Api.errText(code)); await refreshState(); if (code !== "network" && code !== "server") afterLeave(); },
      onExit: function () { go("levels"); }
    };
  }

  function playLevel(level) {
    if (level === "free") { askAndSpinFree(); return; }
    if (level === "impossible") { impossibleEntry(); return; }
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
  function fmtK(v) { return String(Math.round(Number(v) * 100) / 100) + "K"; }
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
      const isBj = it.kind === "blackjack";
      const name = isBj ? I18n.t("history.blackjack") : it.kind === "free" ? Store.LEVEL_NAMES.free : (Store.LEVEL_NAMES[it.level] || it.level) + (it.kind === "gacha" ? " · " + I18n.t("history.gacha") : "");
      const score = it.kind === "quiz" ? it.solved + "/" + (it.level === "impossible" ? 2 : it.total) : "";
      let result;
      if (isBj) {                                   // 7A: ván Blackjack hiện kết quả + tiền thắng/thua (K)
        const k = Number(it.rewardK), out = it.abandoned ? "abandoned" : it.outcome;
        const lbl = out ? I18n.t("history.bj." + out) : I18n.t("history.active");
        result = lbl + (out && k !== 0 ? " " + (k > 0 ? "+" : "−") + fmtK(Math.abs(k)) : "");
      }
      else if (it.rewardLabel) result = it.rewardLabel;
      else if (it.kind === "gacha") result = I18n.t("history.gachaMiss");
      else if (it.bagPending) result = I18n.t("history.bagPending");
      else if (it.wheel && !it.spun) result = I18n.t("history.pendingSpin");
      else if (it.status === "active") result = I18n.t("history.active");
      else if (it.abandoned) result = I18n.t("history.abandoned");
      else result = "—";
      li.append(UI.el("span", "hist-when", when), UI.el("span", "hist-name", name), UI.el("span", "hist-score", score), UI.el("b", "hist-result", result));
      box.appendChild(li);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
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
    UI.$("#btn-blackjack").addEventListener("click", function () { go("blackjack"); });
    UI.$("#btn-setting").addEventListener("click", function () { go("settings"); });
    UI.$("#login-form").addEventListener("submit", doLogin);
    UI.$("#btn-logout").addEventListener("click", doLogout);

    document.querySelectorAll(".level-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { playLevel(btn.dataset.level); });
    });

    UI.$("#quiz-continue").addEventListener("click", Quiz.proceed);
    Blackjack.init({ container: UI.$("#bj-mount"), onExit: function () { go("home"); },
      api: Api.configured ? Api : null,              // có Supabase => cược bằng số dư lì xì, server giữ bài; không có => chỉ chạy local (thử)
      onAuth: function () { refreshState(); } });    // phiên hết hạn -> về màn đăng nhập (refreshState đã xử lý lỗi auth)
    refreshPrices();
    I18n.onChange(function () { refreshPrices(); paintUser(); paintLocks(); });
    I18n.onChange(function () { Blackjack.refresh(); });
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
    UI.$("#quiz-leave").addEventListener("click", Quiz.leave);
    UI.$("#typed-leave").addEventListener("click", Quiz.leave);

    UI.$("#reveal").addEventListener("click", UI.hideReveal);
    Lang.init();
    Sfx.init();
    Wheel.init();
    Settings.init();
    go("home");
    boot();
  });
})();
