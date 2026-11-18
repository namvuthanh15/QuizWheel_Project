// blackjack-render.js – VẼ bàn Blackjack từ trạng thái do engine đưa (M2). KHÔNG quyết định thắng/thua, KHÔNG chạy hoạt ảnh.
// API: mount(container, {onAction}) · render(state, view) · getAnchors() · cardElement(key) · relabel() · unmount()
//  • onAction(act) được gọi với "hit" | "stand" | "new" | "exit" (một listener ủy quyền duy nhất, mount lại không nhân đôi listener).
//  • view (tuỳ chọn): { busy, showPlayerScore, showDealerScore, showResult, message } – lớp hoạt ảnh (M3) dùng để giấu điểm / kết quả
//    cho tới khi lá bài thật sự đã tới nơi. Mặc định hiện tất cả.
//  • Chữ: dùng data-i18n + I18n.apply nên đổi ngôn ngữ khi đang mở vẫn cập nhật (M4 nối I18n.onChange -> relabel()).
//    FALLBACK_VI chỉ dùng khi chưa có I18n (trang xem trước); khi gắn thật các khóa bj.* nằm trong js/i18n.js.
(function (root) {
  "use strict";
  const Cards = root.BlackjackCards;

  const FALLBACK_VI = {
    "bj.title": "Blackjack", "bj.exit": "Thoát", "bj.dealer": "Nhà cái", "bj.player": "Bạn",
    "bj.hit": "Rút bài", "bj.stand": "Dừng bài", "bj.new": "Chia bài", "bj.deck": "Bộ bài", "bj.balance": "Số dư", "bj.bet": "Cược", "bj.difficulty": "Độ khó", "bj.rules": "Luật",
    "bj.msg.idle": "Chọn mức cược rồi nhấn \"Chia bài\"", "bj.msg.dealing": "Đang chia bài…",
    "bj.msg.yourTurn": "Đến lượt bạn", "bj.msg.dealerTurn": "Lượt của nhà cái",
    "bj.badge.blackjack": "Blackjack!", "bj.badge.bust": "Quá 21",
    "bj.result.win": "Bạn thắng!", "bj.result.lose": "Bạn thua", "bj.result.push": "Hòa",
    "bj.result.blackjack": "Blackjack! Bạn thắng!", "bj.result.dealerBlackjack": "Nhà cái Blackjack", "bj.result.bust": "Bạn quá 21"
  };
  function tr(key) {
    const I = root.I18n;
    if (I && typeof I.t === "function") { const s = I.t(key); if (s && s !== key) return s; }
    return FALLBACK_VI[key] || key;
  }
  // Khung luật nổi (không đẩy bảng cược / nút Chia bài)
  function setRules(open) {
    if (!refs) return;
    refs.rules.hidden = !open;
    const b = host.querySelector('[data-act="rules"]');
    if (b) b.setAttribute("aria-expanded", String(!!open));
  }

  // 1,5K (vi) / 1.5K (en); bỏ số 0 thừa. Số dư/cược là bội của 0,05 nên 2 chữ số thập phân là đủ.
  function fmtK(n) {
    let t = (Math.round(Number(n) * 100) / 100).toFixed(2).replace(/\.?0+$/, "");
    if (root.I18n && typeof root.I18n.lang === "function" && root.I18n.lang() === "vi") t = t.replace(".", ",");
    return t + "K";
  }
  // Gán chữ + đánh dấu khóa để I18n.apply() dịch lại khi đổi ngôn ngữ
  function setText(el, key) { if (el.dataset.i18n !== key) el.dataset.i18n = key; const s = tr(key); if (el.textContent !== s) el.textContent = s; }

  // kết quả engine -> khóa chữ + nhóm màu
  const RESULT_VIEW = {
    PLAYER_WIN: ["bj.result.win", "win"], DEALER_WIN: ["bj.result.lose", "lose"], PUSH: ["bj.result.push", "push"],
    PLAYER_BLACKJACK: ["bj.result.blackjack", "blackjack"], DEALER_BLACKJACK: ["bj.result.dealerBlackjack", "lose"], PLAYER_BUST: ["bj.result.bust", "lose"]
  };

  const LANTERN = '<svg viewBox="0 0 40 80" aria-hidden="true" focusable="false"><path d="M20 0v12" stroke="#3a1000" stroke-width="3"/><rect x="11" y="10" width="18" height="6" rx="2" fill="#ffd21f" stroke="#3a1000" stroke-width="2.5"/><ellipse cx="20" cy="34" rx="17" ry="20" fill="#e5251b" stroke="#3a1000" stroke-width="2.5"/><path d="M13 16q-8 18 0 36M27 16q8 18 0 36M20 14v40" fill="none" stroke="#c3140d" stroke-width="2.5"/><rect x="11" y="52" width="18" height="6" rx="2" fill="#ffd21f" stroke="#3a1000" stroke-width="2.5"/><path d="M20 58v14" stroke="#ffd21f" stroke-width="3"/><circle cx="20" cy="74" r="4" fill="#ffd21f" stroke="#3a1000" stroke-width="2"/></svg>';

  const TEMPLATE =
    '<div class="bj-root">' +
      '<div class="bj-head">' +
        '<div class="bj-head-side"><button type="button" class="btn btn-secondary bj-exit" data-act="exit" data-i18n="bj.exit">Thoát</button></div>' +
        '<h2 class="bj-title game-text" data-i18n="bj.title">Blackjack</h2>' +
        '<div class="bj-head-side"></div>' +
      '</div>' +
      '<div class="bj-table" data-phase="IDLE">' +
        '<span class="bj-lantern l">' + LANTERN + '</span><span class="bj-lantern r">' + LANTERN + '</span>' +
        '<section class="bj-zone bj-dealer">' +
          '<div class="bj-label"><span class="bj-who" data-i18n="bj.dealer">Nhà cái</span><span class="bj-score" data-ref="dScore" hidden></span><span class="bj-badge" data-ref="dBadge" hidden></span></div>' +
          '<div class="bj-hand" data-ref="dHand" data-count="0"></div>' +
        '</section>' +
        '<div class="bj-center">' +
          '<div class="bj-deck" data-ref="deck" role="img" data-i18n-aria="bj.deck" aria-label="Bộ bài"></div>' +
          '<p class="bj-msg" data-ref="msg" aria-live="polite"></p>' +
        '</div>' +
        '<section class="bj-zone bj-player">' +
          '<div class="bj-hand" data-ref="pHand" data-count="0"></div>' +
          '<div class="bj-label"><span class="bj-who" data-i18n="bj.player">Bạn</span><span class="bj-score" data-ref="pScore" hidden></span><span class="bj-badge" data-ref="pBadge" hidden></span></div>' +
        '</section>' +
        '<div class="bj-result" data-ref="result" hidden role="status"><span class="bj-result-text" data-ref="resultText"></span><span class="bj-result-delta" data-ref="resultDelta" hidden></span></div>' +
      '</div>' +
      '<div class="bj-bet" data-ref="betBox" hidden>' +
        '<div class="bj-bet-top">' +
          '<span class="bj-bal"><span data-i18n="bj.balance">Số dư</span>: <b data-ref="bal"></b></span>' +
          '<span class="bj-diff" data-ref="diff" hidden><span data-i18n="bj.difficulty">Độ khó</span> <span class="bj-diff-bar" data-ref="diffBar" role="img"></span></span>' +
          '<button type="button" class="bj-rules-btn" data-act="rules" data-i18n="bj.rules" aria-expanded="false">Luật</button>' +
        '</div>' +
        '<div class="bj-bet-row" data-ref="betRow"><label class="bj-bet-label" for="bj-bet-range" data-i18n="bj.bet">Cược</label>' +
          '<input type="range" id="bj-bet-range" class="bj-range" data-ref="betRange" min="1" max="1" step="1" value="1">' +
          '<b class="bj-bet-val" data-ref="betVal"></b></div>' +
        '<div class="bj-rules" data-ref="rules" role="region" aria-labelledby="bj-rules-title" hidden>' +
          '<b class="bj-rules-title" id="bj-rules-title" data-i18n="bj.rules.title">Luật Blackjack</b>' +
          '<ul>' +
            '<li><b data-i18n="bj.rules.k1">Cược</b> <span data-i18n="bj.rules.v1">từ ¼ số dư đến hết (bước 0,1K)</span></li>' +
            '<li><b data-i18n="bj.rules.k2">Tiền</b> <span data-i18n="bj.rules.v2">Thắng +1× · Blackjack +1,5× · Hòa hoàn cược · Thua mất cược</span></li>' +
            '<li><b data-i18n="bj.rules.k3">Độ khó</b> <span data-i18n="bj.rules.v3">thắng liên tiếp thì tăng, thua thì giảm dần</span></li>' +
            '<li><b data-i18n="bj.rules.k4">Thoát giữa ván</b> <span data-i18n="bj.rules.v4">hoặc tải lại trang là tính thua</span></li>' +
          '</ul>' +
          '<small data-i18n="bj.rules.note">Trò may rủi, hãy cược vừa sức.</small>' +
        '</div>' +
      '</div>' +
      '<div class="bj-actions">' +
        '<button type="button" class="btn bj-btn" data-act="hit" data-ref="hit" data-i18n="bj.hit" disabled>Rút bài</button>' +
        '<button type="button" class="btn btn-secondary bj-btn" data-act="stand" data-ref="stand" data-i18n="bj.stand" disabled>Dừng bài</button>' +
        '<button type="button" class="btn bj-btn" data-act="new" data-ref="newRound" data-i18n="bj.new" hidden>Ván mới</button>' +
      '</div>' +
    '</div>';

  let host = null, refs = null, handler = null, clickFn = null, inputFn = null, docFn = null;

  function mount(container, opts) {
    if (!container) throw new Error("BlackjackRender.mount: thiếu container");
    if (host && host !== container) unmount();
    handler = opts && typeof opts.onAction === "function" ? opts.onAction : null;
    if (host === container) return refs; // đã mount: không dựng lại, không nhân đôi listener
    host = container;
    host.innerHTML = TEMPLATE;
    refs = { root: host.firstChild };
    host.querySelectorAll("[data-ref]").forEach(function (el) { refs[el.dataset.ref] = el; });
    refs.table = host.querySelector(".bj-table");
    // bộ bài giữa bàn: 4 lá úp chồng lệch nhau một chút
    for (let i = 0; i < 4; i++) { const b = Cards.createBackElement(); b.style.setProperty("--i", i); refs.deck.appendChild(b); }
    clickFn = function (e) {
      const b = e.target.closest("[data-act]");
      if (refs.rules && !refs.rules.hidden && !(b && b.dataset.act === "rules") && !e.target.closest(".bj-rules")) setRules(false); // bấm chỗ khác trong màn hình: đóng khung luật
      if (!b || !host.contains(b) || b.disabled || b.hidden) return;
      if (b.dataset.act === "rules") { setRules(refs.rules.hidden); return; } // chỉ là bật/tắt khung luật
      if (handler) handler(b.dataset.act);
    };
    inputFn = function (e) {
      if (e.target === refs.betRange && handler) handler("bet", Number(e.target.value) / 10);
    };
    docFn = function (e) {
      if (!refs || refs.rules.hidden) return;
      if (e.type === "keydown") { if (e.key === "Escape") { setRules(false); const rb = host.querySelector('[data-act="rules"]'); if (rb) rb.focus(); } return; }
      if (!e.target.closest(".bj-rules, [data-act=\"rules\"]")) setRules(false); // bấm ra ngoài toàn trang
    };
    host.addEventListener("click", clickFn);
    host.addEventListener("input", inputFn);
    document.addEventListener("click", docFn);
    document.addEventListener("keydown", docFn);
    relabel();
    return refs;
  }

  function unmount() {
    if (host && clickFn) host.removeEventListener("click", clickFn);
    if (host && inputFn) host.removeEventListener("input", inputFn);
    if (docFn) { document.removeEventListener("click", docFn); document.removeEventListener("keydown", docFn); }
    if (host) host.innerHTML = "";
    host = refs = handler = clickFn = inputFn = docFn = null;
  }

  function relabel() { if (host && root.I18n && typeof root.I18n.apply === "function") root.I18n.apply(host); }

  // Đồng bộ các lá trong một tay với danh sách mong muốn; GIỮ NGUYÊN phần tử đã có (key = id lá) để M3 còn di chuyển được.
  // Riêng lá úp của nhà cái có key "dealer-hole": khi được lật thì dùng lại chính phần tử đó, chỉ gắn mặt trước.
  function syncHand(handEl, items) {
    const have = {};
    Array.prototype.forEach.call(handEl.children, function (el) { have[el.dataset.key] = el; });
    const wanted = {};
    items.forEach(function (it, i) {
      let el = have[it.key];
      if (!el && !it.hidden && i === 1 && have["dealer-hole"] && !wanted["dealer-hole"]) { // lá úp vừa lộ mặt
        el = have["dealer-hole"]; delete have["dealer-hole"];
        Cards.setCardFace(el, it.card); el.dataset.key = it.key;
      }
      if (!el) {
        el = Cards.createCardElement(it.hidden ? null : it.card, { faceDown: !!it.hidden });
        el.dataset.key = it.key;
      }
      el.classList.toggle("is-down", !!it.hidden);
      wanted[it.key] = el;
    });
    Object.keys(have).forEach(function (k) { if (!wanted[k] && have[k].parentNode === handEl) handEl.removeChild(have[k]); });
    // đặt đúng thứ tự (chỉ chạm DOM khi thật sự lệch)
    items.forEach(function (it, i) { if (handEl.children[i] !== wanted[it.key]) handEl.insertBefore(wanted[it.key], handEl.children[i] || null); });
    handEl.dataset.count = String(items.length);
  }

  function showScore(pill, badge, score, opts) {
    if (!score || opts.hide) { pill.hidden = true; badge.hidden = true; return; }
    pill.hidden = false;
    pill.textContent = String(score.total) + (opts.more ? " + ?" : "");
    pill.dataset.state = score.bust ? "bust" : (score.blackjack ? "blackjack" : (score.soft ? "soft" : ""));
    if (score.bust) { badge.hidden = false; badge.dataset.kind = "bust"; setText(badge, "bj.badge.bust"); }
    else if (score.blackjack) { badge.hidden = false; badge.dataset.kind = "blackjack"; setText(badge, "bj.badge.blackjack"); }
    else badge.hidden = true;
  }

  function render(state, view) {
    if (!host) return;
    view = view || {};
    const busy = !!view.busy;
    refs.table.dataset.phase = state.phase;

    syncHand(refs.pHand, state.player.cards.map(function (c) { return { key: c.id, card: c }; }));
    syncHand(refs.dHand, state.dealer.cards.map(function (c, i) { return c.hidden ? { key: "dealer-hole", hidden: true } : { key: c.id, card: c }; }));

    // Điểm: giấu khi view yêu cầu (M3 chưa cho lộ trước khi lá bài tới nơi). Điểm nhà cái chỉ tính lá ngửa; còn lá úp -> "n + ?"
    showScore(refs.pScore, refs.pBadge, state.player.cards.length ? state.player.score : null, { hide: view.showPlayerScore === false });
    showScore(refs.dScore, refs.dBadge, state.dealer.score, { hide: view.showDealerScore === false, more: state.dealer.holeHidden && state.dealer.cards.length > 1 });

    // Kết quả
    const rv = state.result && view.showResult !== false ? RESULT_VIEW[state.result.result] : null;
    refs.result.hidden = !rv;
    if (rv) { refs.result.dataset.kind = rv[1]; setText(refs.resultText, rv[0]); }

    refs.resultDelta.hidden = !rv || typeof view.delta !== "number";
    if (!refs.resultDelta.hidden) {
      const d = view.delta;
      refs.resultDelta.dataset.sign = d > 0 ? "pos" : d < 0 ? "neg" : "zero";
      if (d === 0) setText(refs.resultDelta, "bj.delta.zero");
      else { delete refs.resultDelta.dataset.i18n; refs.resultDelta.textContent = (d > 0 ? "+" : "−") + fmtK(Math.abs(d)); }
    }

    // Bảng cược: chỉ khi controller cung cấp view.bet (chế độ server). Chưa vào ván: chọn cược; đang chơi: chỉ hiện tiền cược đã khóa.
    const bet = view.bet;
    refs.betBox.hidden = !bet;
    if (bet) {
      const idleNow = state.phase === "IDLE" || state.phase === "ROUND_COMPLETE";
      refs.bal.textContent = bet.balance == null ? "…" : fmtK(bet.balance);
      refs.diff.hidden = !bet.diff;
      if (bet.diff) {
        refs.diffBar.textContent = "";
        for (let i = 1; i <= bet.diff.steps; i++) { const t = document.createElement("i"); if (i <= bet.diff.step) t.className = "on"; refs.diffBar.appendChild(t); }
        refs.diffBar.setAttribute("aria-label", bet.diff.step + "/" + bet.diff.steps);
      }
      refs.betRow.hidden = false;
      const lo = Math.round(bet.min * 10), hi = Math.round(bet.max * 10);
      refs.betRange.min = String(Math.min(lo, hi)); refs.betRange.max = String(hi); refs.betRange.step = "1";
      refs.betRange.value = String(Math.round(bet.value * 10));
      refs.betRange.disabled = !idleNow || busy || hi < 1 || lo >= hi;
      refs.betVal.textContent = hi < 1 ? "—" : fmtK(bet.value);
    }

    // Dòng trạng thái ở giữa bàn (ẩn khi đang hiện kết quả)
    let msgKey = view.message;
    if (!msgKey) msgKey = { IDLE: "bj.msg.idle", DEALING: "bj.msg.dealing", PLAYER_TURN: "bj.msg.yourTurn", DEALER_REVEAL: "bj.msg.dealerTurn", DEALER_TURN: "bj.msg.dealerTurn" }[state.phase] || "";
    if (view.messageText) { delete refs.msg.dataset.i18n; refs.msg.textContent = view.messageText; refs.msg.hidden = !!rv; } // thông báo thô (đã dịch sẵn), vd lỗi từ server
    else { refs.msg.hidden = !msgKey || !!rv; if (msgKey) setText(refs.msg, msgKey); }

    // Nút
    const idle = state.phase === "IDLE" || state.phase === "ROUND_COMPLETE";
    refs.hit.hidden = refs.stand.hidden = idle;
    refs.newRound.hidden = !idle;
    refs.hit.disabled = busy || !state.canHit;
    refs.stand.disabled = busy || !state.canStand;
    refs.newRound.disabled = busy || !!view.disableNew;
  }

  function getAnchors() {
    return host ? { root: refs.root, table: refs.table, deck: refs.deck, dealerHand: refs.dHand, playerHand: refs.pHand, msg: refs.msg, result: refs.result,
      buttons: { hit: refs.hit, stand: refs.stand, newRound: refs.newRound } } : null;
  }
  function cardElement(key) { return host ? host.querySelector('.bj-card[data-key="' + String(key).replace(/"/g, "") + '"]') : null; }

  root.BlackjackRender = { mount: mount, unmount: unmount, render: render, relabel: relabel, getAnchors: getAnchors, cardElement: cardElement };
})(typeof window !== "undefined" ? window : globalThis);
