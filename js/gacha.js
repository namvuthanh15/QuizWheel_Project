// gacha.js – máy GACHA (quay số ba cuộn, chủ đề Tết) cho mức Impossible + bảng chọn "Trả lời quiz / GACHA".
// KẾT QUẢ DO SERVER QUYẾT ĐỊNH (api_gacha_spin). File này chỉ vẽ máy và cho ba cuộn xoay rồi dừng đúng ba số server trả về
// (số 0..5; ba số 0 = ba bao lì xì đỏ = thắng lớn). Chỉ chứa chuỗi SVG tĩnh do mình viết, không chèn dữ liệu người dùng vào HTML.
(function () {
  // Thứ tự biểu tượng trên mỗi cuộn (mỗi cuộn một thứ tự khác nhau cho tự nhiên); số vòng xoay trước khi dừng
  const ORDER = [[0, 3, 1, 5, 2, 4], [0, 4, 2, 5, 1, 3], [0, 2, 4, 1, 5, 3]];
  const CYCLES = [4, 5, 6];
  const INK = "#3a1000";
  const S = 'stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"';
  const SYMBOLS = [
    // 0 bao lì xì đỏ (biểu tượng thắng lớn)
    '<svg viewBox="0 0 64 64"><rect x="14" y="6" width="36" height="52" rx="5" fill="#e5251b" ' + S + '/><path d="M14 11 Q32 36 50 11" fill="#c3140d" ' + S + '/><circle cx="32" cy="36" r="8" fill="#ffd21f" ' + S + '/><path d="M28 36h8M32 32v8" stroke="#c3140d" stroke-width="2.5" stroke-linecap="round"/></svg>',
    // 1 hoa mai
    '<svg viewBox="0 0 64 64"><g fill="#ffd21f" ' + S + '><circle cx="32" cy="16" r="10"/><circle cx="48" cy="28" r="10"/><circle cx="42" cy="47" r="10"/><circle cx="22" cy="47" r="10"/><circle cx="16" cy="28" r="10"/></g><circle cx="32" cy="34" r="7" fill="#ff8a1f" ' + S + '/></svg>',
    // 2 hoa đào
    '<svg viewBox="0 0 64 64"><g fill="#ff7eb6" ' + S + '><circle cx="32" cy="16" r="10"/><circle cx="48" cy="28" r="10"/><circle cx="42" cy="47" r="10"/><circle cx="22" cy="47" r="10"/><circle cx="16" cy="28" r="10"/></g><circle cx="32" cy="34" r="7" fill="#ffe0ec" ' + S + '/></svg>',
    // 3 đồng tiền vàng
    '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#ffd21f" ' + S + '/><circle cx="32" cy="32" r="19" fill="none" stroke="#c8920a" stroke-width="2.5"/><rect x="25" y="25" width="14" height="14" fill="#fff6dc" ' + S + '/></svg>',
    // 4 đèn lồng
    '<svg viewBox="0 0 64 64"><path d="M32 3v8" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/><rect x="22" y="10" width="20" height="6" rx="2" fill="#ffd21f" ' + S + '/><ellipse cx="32" cy="33" rx="21" ry="18" fill="#e5251b" ' + S + '/><path d="M24 17q-7 16 0 32M40 17q7 16 0 32M32 15v36" fill="none" stroke="#c3140d" stroke-width="2.5"/><rect x="22" y="50" width="20" height="6" rx="2" fill="#ffd21f" ' + S + '/><path d="M32 56v6" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/></svg>',
    // 5 thỏi vàng
    '<svg viewBox="0 0 64 64"><path d="M6 28 Q32 56 58 28 L52 20 Q32 28 12 20 Z" fill="#ffd21f" ' + S + '/><path d="M22 20 Q32 6 42 20 Q32 25 22 20Z" fill="#ffe46b" ' + S + '/><path d="M18 30q14 10 28 0" fill="none" stroke="#c8920a" stroke-width="2.5" stroke-linecap="round"/></svg>'
  ];
  const LANTERN = '<svg viewBox="0 0 40 80"><path d="M20 0v12" stroke="' + INK + '" stroke-width="3"/><rect x="11" y="10" width="18" height="6" rx="2" fill="#ffd21f" ' + S + '/><ellipse cx="20" cy="34" rx="17" ry="20" fill="#e5251b" ' + S + '/><path d="M13 16q-8 18 0 36M27 16q8 18 0 36M20 14v40" fill="none" stroke="#c3140d" stroke-width="2.5"/><rect x="11" y="52" width="18" height="6" rx="2" fill="#ffd21f" ' + S + '/><path d="M20 58v14" stroke="#ffd21f" stroke-width="3"/><circle cx="20" cy="74" r="4" fill="#ffd21f" ' + S + '/></svg>';
  // Đầu lân vàng đỏ làm "mão" trên đỉnh máy
  const LION = '<svg viewBox="0 0 240 130"><g fill="#e5251b" ' + S + '>' +
    [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(function (a) {
      const r = a * Math.PI / 180; return '<circle cx="' + (120 + 50 * Math.cos(r)).toFixed(1) + '" cy="' + (78 + 42 * Math.sin(r)).toFixed(1) + '" r="15"/>';
    }).join("") + '</g>' +
    '<circle cx="120" cy="78" r="40" fill="#ffd21f" ' + S + '/>' +
    '<path d="M104 40 Q120 4 136 40" fill="#ffe46b" ' + S + '/><circle cx="120" cy="14" r="9" fill="#e5251b" ' + S + '/><circle cx="117" cy="11" r="3" fill="#fff"/>' +
    '<path d="M86 56 Q101 44 112 56" fill="none" stroke="#c3140d" stroke-width="6" stroke-linecap="round"/><path d="M154 56 Q139 44 128 56" fill="none" stroke="#c3140d" stroke-width="6" stroke-linecap="round"/>' +
    '<ellipse cx="102" cy="68" rx="12" ry="14" fill="#fff" ' + S + '/><ellipse cx="138" cy="68" rx="12" ry="14" fill="#fff" ' + S + '/>' +
    '<circle cx="104" cy="70" r="6" fill="' + INK + '"/><circle cx="136" cy="70" r="6" fill="' + INK + '"/><circle cx="106" cy="67" r="2" fill="#fff"/><circle cx="138" cy="67" r="2" fill="#fff"/>' +
    '<circle cx="90" cy="92" r="7" fill="#ff7eb6" opacity=".7"/><circle cx="150" cy="92" r="7" fill="#ff7eb6" opacity=".7"/>' +
    '<path d="M112 84 Q120 78 128 84 Q126 94 120 94 Q114 94 112 84Z" fill="#e5251b" ' + S + '/>' +
    '<path d="M100 102 Q120 118 140 102" fill="#c3140d" ' + S + '/><path d="M110 107l4 8 4-8M122 107l4 8 4-8" fill="#fff" ' + S + '/></svg>';

  const st = { built: false, busy: false, done: false, run: 0, ctx: null, outcome: null };
  let strips = [], reels = [];

  const reduced = function () { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); };
  const prize = function () { const r = Store.remote(); return (r && r.impossiblePrize) || Store.LEVEL_PRICES.impossible; };
  const cost = function () { const r = Store.remote(); return (r && Number(r.gachaCost)) || 1; };

  /* ---------- Bảng chọn: Trả lời quiz hay GACHA ---------- */
  // info: { turns, gachaLeft }. Trả về Promise<"quiz" | "gacha" | null>
  function choose(info) {
    return new Promise(function (resolve) {
      const m = UI.$("#imp-modal"), q = UI.$("#imp-quiz"), g = UI.$("#imp-gacha"), c = UI.$("#imp-cancel"), note = UI.$("#imp-note");
      const p = prize(), k = cost();
      UI.$("#imp-quiz-desc").textContent = I18n.t("imp.quizDesc", { prize: p });
      UI.$("#imp-gacha-desc").textContent = I18n.t("imp.gachaDesc", { prize: p, cost: k });
      let why = "";
      if (info.gachaLeft < 1) why = I18n.t("imp.gachaUsed"); else if (info.turns < k) why = I18n.t("imp.gachaNoTurns", { cost: k });
      g.disabled = !!why; note.textContent = why;
      m.hidden = false; (g.disabled ? q : g).focus();
      function done(v) {
        m.hidden = true;
        q.removeEventListener("click", onQ); g.removeEventListener("click", onG); c.removeEventListener("click", onC); document.removeEventListener("keydown", onKey);
        resolve(v);
      }
      function onQ() { done("quiz"); } function onG() { done("gacha"); } function onC() { done(null); }
      function onKey(e) { if (e.key === "Escape") done(null); }
      q.addEventListener("click", onQ); g.addEventListener("click", onG); c.addEventListener("click", onC); document.addEventListener("keydown", onKey);
    });
  }

  /* ---------- Dựng máy (một lần) ---------- */
  function build() {
    if (st.built) return;
    const root = UI.$("#gacha-machine");
    let dots = ""; for (let i = 0; i < 11; i++) dots += "<i></i>";
    root.innerHTML =
      '<div class="gm-top" aria-hidden="true"><span class="gm-lantern l">' + LANTERN + '</span><span class="gm-crest">' + LION + '</span><span class="gm-lantern r">' + LANTERN + '</span></div>' +
      '<div class="gm-body"><div class="gm-pillar l" aria-hidden="true"></div><div class="gm-pillar r" aria-hidden="true"></div>' +
      '<div class="gm-marquee" aria-hidden="true">' + dots + '</div>' +
      '<div class="gm-window" id="gacha-window" role="img"><div class="gm-reel"><div class="gm-strip"></div></div><div class="gm-reel"><div class="gm-strip"></div></div><div class="gm-reel"><div class="gm-strip"></div></div><div class="gm-line" aria-hidden="true"></div></div>' +
      '<div class="gm-tray" aria-hidden="true"></div>' +
      '<button class="gm-lever" type="button" id="gacha-lever"><span class="gm-stick"></span><span class="gm-knob"></span></button></div>' +
      '<div class="gm-confetti" id="gacha-confetti" aria-hidden="true"></div>';
    reels = Array.from(root.querySelectorAll(".gm-reel"));
    strips = Array.from(root.querySelectorAll(".gm-strip"));
    strips.forEach(function (strip, r) {
      const total = (CYCLES[r] + 3) * 6;
      for (let i = 0; i < total; i++) {
        const cell = UI.el("div", "gm-cell"); cell.dataset.sym = String(ORDER[r][i % 6]); cell.innerHTML = SYMBOLS[ORDER[r][i % 6]];
        strip.appendChild(cell);
      }
    });
    UI.$("#gacha-spin").addEventListener("click", onSpin);
    UI.$("#gacha-lever").addEventListener("click", onSpin);
    UI.$("#gacha-back").addEventListener("click", function () { if (!st.busy && st.ctx) st.ctx.onExit(); });
    st.built = true;
  }

  function cellH() { return strips[0].firstElementChild.getBoundingClientRect().height; }
  function resetReels() {
    strips.forEach(function (s, r) { s.style.transform = "translateY(0px)"; reels[r].classList.remove("fast"); delete reels[r].dataset.stopped; });   // item số 1 nằm ở hàng giữa
    UI.$("#gacha-confetti").textContent = "";
    UI.$("#gacha-machine").classList.remove("win", "miss", "spinning");
    delete UI.$("#gacha-machine").dataset.outcome;
    document.querySelectorAll(".gm-cell.hit").forEach(function (c) { c.classList.remove("hit"); });
  }

  /* ---------- Mở màn hình ---------- */
  // ctx: { onResult(r), onError(code), onExit() }
  function open(ctx) {
    build();
    st.run++; st.ctx = ctx; st.busy = false; st.done = false; st.outcome = null;
    resetReels();
    UI.$("#gacha-sub").textContent = I18n.t("gacha.sub", { prize: prize() });
    UI.$("#gacha-result").textContent = "";
    UI.$("#gacha-spin").disabled = false; UI.$("#gacha-spin").textContent = I18n.t("gacha.spin");
    UI.$("#gacha-lever").setAttribute("aria-label", I18n.t("gacha.lever"));
    UI.$("#gacha-back").disabled = false;
    UI.$("#gacha-window").setAttribute("aria-label", I18n.t("gacha.window"));
  }

  // Rời màn hình giữa lúc đang quay: dừng hoạt ảnh. Server đã chốt kết quả nên báo cho người chơi biết kết quả được ghi ở Lịch sử.
  function stop() {
    if (!st.built) return;
    st.run++;
    if (st.busy && st.outcome) UI.toast(I18n.t("gacha.left", { text: st.outcome.win ? I18n.t("gacha.win", { prize: st.outcome.prizeLabel || prize() }) : I18n.t("gacha.miss") }));
    st.busy = false;
  }

  /* ---------- Quay ---------- */
  async function onSpin() {
    if (st.busy || st.done) return;
    if (!(await UI.confirm(I18n.t("confirm.gacha", { cost: cost() })))) return;
    if (st.busy || st.done) return;
    st.busy = true; const my = ++st.run;
    UI.$("#gacha-spin").disabled = true; UI.$("#gacha-back").disabled = true;
    UI.$("#gacha-result").textContent = I18n.t("gacha.spinning");
    const r = await Api.gachaSpin();
    if (my !== st.run) return;                                   // đã rời màn hình trong lúc chờ server
    if (!r.ok || !Array.isArray(r.reels) || r.reels.length !== 3) {
      st.busy = false; UI.$("#gacha-spin").disabled = false; UI.$("#gacha-back").disabled = false; UI.$("#gacha-result").textContent = "";
      if (st.ctx) st.ctx.onError(r.error || "server");
      return;
    }
    st.outcome = r;
    UI.$("#gacha-machine").classList.add("spinning");
    const finished = await animate(r.reels, my);
    if (!finished || my !== st.run) return;
    showResult(r);
  }

  function easeOutBack(t) { const c1 = 1.1, c3 = c1 + 1, x = t - 1; return 1 + c3 * x * x * x + c1 * x * x; }

  // Cho ba cuộn xoay rồi dừng lần lượt (trái -> phải) đúng ở ba biểu tượng reels[0..2]
  function animate(syms, my) {
    return new Promise(function (resolve) {
      const cell = cellH(), quick = reduced();
      const plan = syms.map(function (sym, r) {
        let k = 1 + CYCLES[r] * 6; while (ORDER[r][k % 6] !== sym) k++;        // k = số thứ tự biểu tượng sẽ nằm ở hàng giữa khi dừng
        return { k0: 1, k: k, dur: quick ? 450 + r * 150 : 2300 + r * 650, done: false };
      });
      const t0 = performance.now(); let stopped = 0;
      function frame(now) {
        if (my !== st.run) { resolve(false); return; }
        plan.forEach(function (p, r) {
          if (p.done) return;
          const t = Math.min(1, (now - t0) / p.dur);
          const pos = p.k0 + (p.k - p.k0) * (quick ? t : easeOutBack(t));
          strips[r].style.transform = "translateY(" + (-(pos - 1) * cell).toFixed(2) + "px)";
          reels[r].classList.toggle("fast", t < 0.8);
          if (t >= 1) { p.done = true; stopped++; reels[r].dataset.stopped = String(syms[r]); Sfx.click(); }
        });
        if (stopped < 3) requestAnimationFrame(frame); else resolve(true);
      }
      requestAnimationFrame(frame);
    });
  }

  function showResult(r) {
    st.busy = false; st.done = true;
    const m = UI.$("#gacha-machine");
    m.classList.remove("spinning"); m.classList.add(r.win ? "win" : "miss"); m.dataset.outcome = r.win ? "win" : "miss";
    const names = r.reels.map(function (s) { return I18n.t("gacha.sym" + s); }).join(", ");
    UI.$("#gacha-window").setAttribute("aria-label", I18n.t("gacha.reels", { names: names }));
    if (r.win) {
      const p = r.prizeLabel || prize();
      strips.forEach(function (s) {                                          // tô sáng ba ô trên đường trúng
        const k = Math.round(-parseFloat(s.style.transform.replace(/[^\d.-]/g, "")) / cellH()) + 1;
        if (s.children[k]) s.children[k].classList.add("hit");
      });
      UI.$("#gacha-result").textContent = I18n.t("gacha.winMsg", { prize: p });
      confetti(); Sfx.omg(); UI.reveal(I18n.t("gacha.win", { prize: p }));
    } else {
      UI.$("#gacha-result").textContent = I18n.t("gacha.missMsg");
      Sfx.catLaugh();
    }
    UI.$("#gacha-spin").textContent = I18n.t("gacha.done");
    UI.$("#gacha-back").disabled = false;
    if (st.ctx) st.ctx.onResult(r);
  }

  function confetti() {
    const box = UI.$("#gacha-confetti"); box.textContent = "";
    for (let i = 0; i < 36; i++) {
      const p = UI.el("i", "c" + (i % 3));
      p.style.left = (Math.random() * 100).toFixed(1) + "%"; p.style.animationDelay = (Math.random() * 1.2).toFixed(2) + "s"; p.style.animationDuration = (1.8 + Math.random() * 1.6).toFixed(2) + "s";
      box.appendChild(p);
    }
  }

  window.Gacha = { choose: choose, open: open, stop: stop };
})();
