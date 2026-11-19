// blackjack.js – BỘ ĐIỀU KHIỂN Blackjack (M3). Nối Engine (luật) + Render (vẽ bàn) + Animation (hoạt ảnh) + thao tác người chơi.
// KHÔNG chứa luật chơi: mọi quyết định (điểm, bust, nhà cái rút, kết quả) lấy từ BlackjackEngine.
//
// M6 – CHẾ ĐỘ SERVER: khi init({ api }) có API (window.Api) thì tiền cược, bộ bài và kết toán do SERVER giữ (sql/12-blackjack.sql). Engine ở trình duyệt
//   chỉ là máy trạng thái + tính điểm cho giao diện: mỗi lá bài server đưa được nạp vào engine (feed / setHole) rồi phát lại bằng đúng các hàm cũ.
//   Sau mỗi ván so khớp kết quả engine với kết quả server; lệch thì coi là lỗi đồng bộ, tải lại số dư (server luôn là bên đúng).
//   startNewRound({ deck }) với bộ bài chỉ định (test/xem trước) vẫn chạy chế độ LOCAL không cược, không gọi server.
// API: init({ container, onExit, api?, onAuth?, confirm? }) · open() · stop() · startNewRound({ deck? }) · refresh() · getState() · isBusy() · setSpeed(x)
//  • open(): dựng bàn (nếu chưa) và đặt về ván trống. stop(): hủy mọi hoạt ảnh, dọn bàn về trạng thái trống (gọi khi thoát / điều hướng đi nơi khác).
//  • Mỗi hành động (ván mới / HIT / STAND) là một "phiên" hoạt ảnh. Chỉ một phiên chạy tại một thời điểm (cờ busy), bấm dồn bị bỏ qua.
//  • Phiên bị hủy (stop / mở lại) tự thoát êm; phiên lỗi bất ngờ -> reset về ván trống để nút không bao giờ bị khóa vĩnh viễn.
(function (root) {
  "use strict";
  const E = root.BlackjackEngine, R = root.BlackjackRender, A = root.BlackjackAnimation;

  let container = null, onExit = null, game = null, sess = null, busy = false, opened = false;
  let api = null, onAuth = null, confirmFn = null;
  let acct = null;          // { ready, enabled, balance, min, max, value, diff } – số dư & thanh cược (chế độ server)
  let srvRound = null;      // ván đang chạy theo server: { delta } (null = ván local / không có ván)
  let notice = null;        // hàm trả về thông báo (đã dịch) hiện ở giữa bàn; null = không có
  let lastDelta;            // tiền thắng/thua của ván vừa xong (K), hiện ở banner kết quả
  let epoch = 0;            // tăng mỗi lần mở/đóng: bỏ qua kết quả trả về muộn của lần mở cũ
  const OUT = { win: "PLAYER_WIN", blackjack: "PLAYER_BLACKJACK", push: "PUSH", lose: "DEALER_WIN", bust: "PLAYER_BUST", dealer_blackjack: "DEALER_BLACKJACK" };
  const PLACEHOLDERS = ["clubs-2", "clubs-3", "clubs-4", "clubs-5", "diamonds-2", "diamonds-3", "diamonds-4", "hearts-2", "hearts-3", "spades-2"]; // lá giữ chỗ cho lá úp (giá trị <= 6 nên không bao giờ tạo Blackjack)

  // kết quả engine -> loại hiệu ứng
  const FX = { PLAYER_WIN: "win", PLAYER_BLACKJACK: "blackjack", DEALER_WIN: "lose", DEALER_BLACKJACK: "lose", PLAYER_BUST: "lose", PUSH: "push" };

  function noop() {}
  function betView() {
    if (!api || !acct) return null;
    return { balance: acct.ready ? acct.balance : null, min: acct.min, max: acct.max, value: acct.value, diff: acct.diff, locked: !!srvRound };
  }
  function view(extra) {
    return Object.assign({ busy: busy, bet: srvMode() ? betView() : undefined, messageText: busy || !isIdle() ? undefined : (notice ? notice() : autoNotice()),
      delta: lastDelta, disableNew: srvMode() && !!acct && (!acct.ready || acct.max < 0.1 || !acct.enabled) }, extra);
  }
  function srvMode() { return !!api; }
  // Thông báo của tài khoản (lỗi, số dư...) chỉ hiện khi bàn rảnh; đang chơi thì dòng giữa bàn là của ván
  function isIdle() { const ph = game && game.getState().phase; return ph === E.PHASE.IDLE || ph === E.PHASE.ROUND_COMPLETE; }
  function say(key) { notice = function () { return tr(key); }; }
  // Thông báo tự động khi đang rảnh: Blackjack tắt / chưa đủ số dư
  function autoNotice() {
    if (!api || !acct || !acct.ready) return acct && !acct.ready ? tr("bj.msg.loading") : undefined;
    if (!acct.enabled) return tr("bj.msg.disabled");
    if (acct.max < 0.1) return tr("bj.msg.noBalance");
    return undefined;
  }
  // Ván server còn mở (chưa kết toán): thoát lúc này = bỏ ván = thua
  function inProgress() { const st = game && game.getState().phase; return !!srvRound && !srvRound.settled && st !== E.PHASE.IDLE && st !== E.PHASE.ROUND_COMPLETE; }
  function tr(key) { return root.I18n && root.I18n.t ? root.I18n.t(key) : key; }
  function errMsg(code) { return root.Api && root.Api.errText ? root.Api.errText(code) : String(code); }
  function draw(extra, state) { if (opened) R.render(state || game.getState(), view(extra)); }
  function anchors() { return R.getAnchors(); }

  // Trạng thái "cắt" để hoạt ảnh chia bài từng lá: chỉ hiện np lá của người chơi, nd lá của nhà cái (lá úp vẫn là chỗ giữ chỗ)
  function partial(st, np, nd) {
    const pc = st.player.cards.slice(0, np), dc = st.dealer.cards.slice(0, nd);
    const vis = dc.filter(function (c) { return !c.hidden; });
    return Object.assign({}, st, {
      player: { cards: pc, score: E.calculateScore(pc) },
      dealer: { cards: dc, holeHidden: st.dealer.holeHidden && nd > 1, score: vis.length ? E.calculateScore(vis) : null },
      result: null
    });
  }

  // ---------- Số dư & thanh cược (chế độ server) ----------
  function snap01(v) { return Math.round(Number(v) * 10) / 10; }
  function applyState(r) {
    const prev = acct && acct.value;
    acct = { ready: true, enabled: r.enabled !== false, balance: Number(r.balanceK), min: Number(r.minBet), max: Number(r.maxBet), diff: r.difficulty || null, value: 0 };
    acct.value = acct.max < 0.1 ? acct.min : Math.min(acct.max, Math.max(acct.min, snap01(prev || acct.min)));
  }
  // Tải lại số dư / độ khó từ server. Trả về phản hồi gốc; lỗi auth -> báo ra ngoài (về màn đăng nhập)
  async function loadAcct() {
    const my = epoch;
    const r = await api.bjState();
    if (my !== epoch) return r;
    if (r && r.ok) applyState(r);
    else if (r && r.error === "auth" && onAuth) onAuth();
    return r;
  }
  function setBet(v) {
    if (!acct || !acct.ready || busy || !opened) return;
    acct.value = Math.min(acct.max, Math.max(acct.min, snap01(v)));
    draw({});
  }
  function fail(code) { notice = function () { return errMsg(code); }; if (code === "auth" && onAuth) onAuth(); }

  function must(r, what) { if (!r || !r.ok) throw new Error("Blackjack: " + what + " bị từ chối (" + (r && r.error) + ")"); return r; }
  function sync(ok, what) { if (!ok) { const e = new Error("Blackjack: lệch đồng bộ với server (" + what + ")"); e.sync = true; throw e; } }

  // ---------- Chạy một hành động như một phiên hoạt ảnh ----------
  function run(fn) {
    if (busy || !opened) return Promise.resolve(false);
    busy = true;
    const s = sess = A.newSession(anchors());
    draw({ showResult: undefined });
    return Promise.resolve().then(function () { return fn(s); }).then(function () { return true; }, function (e) {
      if (A.isCancel(e) || s !== sess) return false; // bị hủy: thoát êm, không đụng gì tới bàn
      console.error("[Blackjack]", e);
      try { game.reset(); A.clearEffects(anchors()); } catch (x) { /* bỏ qua */ }
      if (srvMode() && srvRound) { srvRound = null; say("bj.msg.syncError"); return loadAcct().then(function () { return false; }, function () { return false; }); }
      return false;
    }).then(function (ok) {
      if (s === sess) { busy = false; sess = null; draw({}); } // luôn nhả khóa và vẽ lại -> nút không kẹt
      return ok;
    });
  }

  // ---------- Các bước dùng chung ----------
  // Lật lá úp của nhà cái (engine.revealDealer) kèm hoạt ảnh
  async function revealHole(s) {
    s.check();
    const rv = must(game.revealDealer(), "revealDealer");
    draw({ showDealerScore: false, showResult: false });
    const el = R.cardElement(rv.card.id);
    if (el) await s.flip(el);
    s.check();
    draw({ showResult: false }); // điểm thật của nhà cái hiện ra sau khi lật
    await s.wait(A.duration("revealPause"));
  }

  // Hiện kết quả + hiệu ứng, rồi chốt ván (ROUND_COMPLETE)
  async function finishRound(s, server) {
    s.check();
    const st = game.getState();
    if (!st.result) throw new Error("Blackjack: ván chưa có kết quả");
    if (server) { sync(OUT[server.outcome] === st.result.result, "kết quả " + server.outcome + " ≠ " + st.result.result); lastDelta = Number(server.delta); }
    draw({ showResult: true }, st);
    await s.effect(FX[st.result.result] || "push");
    s.check();
    must(game.completeRound(), "completeRound");
    if (server) { srvRound = null; await loadAcct(); }   // ván đã kết toán: lấy số dư & độ khó mới
  }

  // ---------- Ván mới ----------
  function pickPlaceholder(known) { for (let i = 0; i < PLACEHOLDERS.length; i++) if (known.indexOf(PLACEHOLDERS[i]) < 0) return PLACEHOLDERS[i]; return "clubs-6"; }

  function startNewRound(opts) {
    const local = !srvMode() || !!(opts && opts.deck);
    return run(async function (s) {
      notice = null; lastDelta = undefined;
      let resp = null, deckArg = opts && opts.deck ? opts.deck : undefined;
      if (!local) {                                   // 0) xin server chia bài (trừ cược) TRƯỚC khi đụng vào bàn: lỗi thì bàn giữ nguyên
        if (!acct || !acct.ready || !acct.enabled || acct.max < 0.1) return;
        resp = await api.bjStart(acct.value);
        try { s.check(); } catch (e) { if (resp && resp.ok && !resp.done) api.bjAbandon(); throw e; } // thoát khi đang chờ server: ván vừa mở bị tính thua
        if (!resp || !resp.ok) { fail(resp && resp.error); if (resp && /^(no_balance|bad_bet|disabled|game_open)$/.test(resp.error)) await loadAcct(); return; }
        srvRound = { settled: !!resp.done };
        acct.balance = Number(resp.balanceK);
        const hole = resp.dealer[1] || pickPlaceholder([resp.player[0], resp.player[1], resp.dealer[0]]);
        deckArg = [resp.player[0], resp.dealer[0], resp.player[1], hole];
      }
      let st = game.getState();
      if (st.phase !== E.PHASE.IDLE && st.phase !== E.PHASE.ROUND_COMPLETE) { game.reset(); st = game.getState(); } // gọi giữa ván local = bỏ ván
      const an = anchors();
      if (st.player.cards.length || st.dealer.cards.length) {
        A.clearEffects(an);
        await s.collect();
        s.check();
      }
      R.render(partial(st, 0, 0), view({ showPlayerScore: false, showDealerScore: false, showResult: false }));

      const r = must(game.startRound(deckArg ? { deck: deckArg } : undefined), "startRound");
      st = game.getState(); // DEALING: đủ 4 lá nhưng ta chỉ vẽ dần
      const V = { showPlayerScore: false, showDealerScore: false, showResult: false, message: "bj.msg.dealing" };
      R.render(partial(st, 0, 0), view(V));
      await s.wait(A.duration("startDelay"));

      let np = 0, nd = 0;
      const last = { player: null, dealer: null }, flights = [];
      for (let i = 0; i < r.deal.length; i++) {
        const d = r.deal[i];
        if (last[d.to]) await last[d.to]; // lá trước của CÙNG tay phải tới nơi rồi mới thêm lá mới (tránh trượt chồng chéo)
        s.check();
        const snap = s.snapshot(d.to === "player" ? an.playerHand : an.dealerHand);
        if (d.to === "player") np++; else nd++;
        R.render(partial(st, np, nd), view(V));
        const key = d.faceDown ? "dealer-hole" : (d.to === "player" ? st.player.cards[np - 1].id : st.dealer.cards[nd - 1].id);
        const el = R.cardElement(key);
        if (!el) throw new Error("Blackjack: thiếu phần tử lá " + key);
        last[d.to] = s.fly(el, { faceDown: !!d.faceDown, snap: snap });
        flights.push(last[d.to]);
        if (i < r.deal.length - 1) await s.wait(A.duration("dealInterval"));
      }
      await Promise.all(flights);
      s.check();

      // Chia xong: hiện điểm, rồi vào lượt người chơi (hoặc xử lý ngay Blackjack tự nhiên)
      const bt = must(game.beginPlayerTurn(), "beginPlayerTurn");
      if (resp) sync(bt.naturalResolved === !!resp.done, "Blackjack tự nhiên");
      draw({ showResult: false });
      if (bt.naturalResolved) {
        await s.wait(A.duration("revealPause"));
        if (resp && resp.done) { /* lá úp thật đã nằm sẵn trong bộ bài giả lập */ }
        await revealHole(s);
        await finishRound(s, resp ? { outcome: resp.outcome, delta: resp.delta } : undefined);
      }
    });
  }

  // ---------- HIT ----------
  function hit() {
    return run(async function (s) {
      notice = null;
      let resp = null;
      if (srvRound) {                                 // server rút lá (và báo nếu quá 21); lỗi thì bàn giữ nguyên
        resp = await api.bjHit();
        s.check();
        if (!resp || !resp.ok) { await handleActionError(resp); return; }
        if (resp.done) { srvRound.settled = true; must(game.setHole(resp.dealer[1]), "setHole"); }
        must(game.feed([resp.card]), "feed");
      }
      const snap = s.snapshot(anchors().playerHand);
      const r = must(game.playerHit(), "playerHit");
      if (resp) sync(r.bust === (resp.outcome === "bust") && r.score.total === resp.playerScore, "HIT");
      const st = game.getState();
      R.render(st, view({ showPlayerScore: false, showResult: false }));
      const el = R.cardElement(r.card.id);
      if (el) await s.fly(el, { snap: snap, duration: "hitDuration" });
      s.check();
      R.render(st, view({ showResult: false })); // lá đã tới: bây giờ mới hiện điểm
      if (r.bust) {
        await s.wait(A.duration("revealPause"));
        await revealHole(s);
        await finishRound(s, resp ? { outcome: resp.outcome, delta: resp.delta } : undefined);
      } else if (resp && r.reached21) {               // đủ 21: server không cho rút thêm -> tự dừng bài
        await s.wait(A.duration("revealPause"));
        await doStand(s);
      }
    });
  }

  // Server báo lỗi cho một hành động giữa ván: hiện thông báo; mất ván (no_game) thì dọn bàn và tải lại số dư
  async function handleActionError(resp) {
    const code = resp && resp.error;
    fail(code);
    if (code === "no_game" || code === "auth") { game.reset(); srvRound = null; await loadAcct(); }
  }

  // ---------- STAND: lật lá úp, nhà cái rút tới khi đủ, ra kết quả ----------
  async function doStand(s) {
    let resp = null;
    if (srvRound) {                                   // server dựng lá úp + các lá nhà cái rút, kết toán
      resp = await api.bjStand();
      s.check();
      if (!resp || !resp.ok) { await handleActionError(resp); return; }
      srvRound.settled = true;
      must(game.setHole(resp.dealer[1]), "setHole");
      if (resp.dealer.length > 2) must(game.feed(resp.dealer.slice(2)), "feed");
    }
    must(game.playerStand(), "playerStand");
    draw({ showResult: false });
    await s.wait(A.duration("dealerPause"));
    await revealHole(s);
    for (;;) {
      s.check();
      const snap = s.snapshot(anchors().dealerHand);
      const step = must(game.dealerStep(), "dealerStep");
      if (step.card) {
        const st = game.getState();
        R.render(st, view({ showDealerScore: false, showResult: false }));
        const el = R.cardElement(step.card.id);
        if (el) await s.fly(el, { snap: snap, duration: "hitDuration" });
        s.check();
        R.render(st, view({ showResult: false }));
        await s.wait(A.duration("dealerPause"));
      }
      if (step.done) break;
    }
    if (resp) sync(game.getState().dealer.cards.length === resp.dealer.length, "số lá nhà cái");
    await finishRound(s, resp ? { outcome: resp.outcome, delta: resp.delta } : undefined);
  }
  function stand() { return run(function (s) { notice = null; return doStand(s); }); }

  // ---------- Vòng đời ----------
  function onAction(act) {
    if (act === "exit") {
      if (inProgress()) { const cf = confirmFn || (typeof root.confirm === "function" ? root.confirm.bind(root) : null); if (cf && !cf(tr("bj.confirmExit"))) return; }
      stop(); if (typeof onExit === "function") onExit(); return;
    }
    if (busy || !opened) return; // đang chạy hoạt ảnh: bấm dồn bị bỏ qua
    if (act === "bet") { setBet(arguments[1]); return; }
    if (act === "new") startNewRound();
    else if (act === "hit") hit();
    else if (act === "stand") stand();
  }

  function init(opts) {
    if (!opts || !opts.container) throw new Error("Blackjack.init: thiếu container");
    container = opts.container;
    onExit = typeof opts.onExit === "function" ? opts.onExit : null;
    api = opts.api || null;                      // có api => chế độ SERVER (cược bằng số dư); không có => chỉ chạy local/thử
    onAuth = typeof opts.onAuth === "function" ? opts.onAuth : null;
    confirmFn = typeof opts.confirm === "function" ? opts.confirm : null;
    return pub;
  }

  function open() {
    if (!container) throw new Error("Blackjack.open: chưa gọi init()");
    A.cancelAll(); sess = null; busy = false;
    epoch++; notice = null; lastDelta = undefined; srvRound = null;
    acct = api ? { ready: false, enabled: true, balance: null, min: 0.1, max: 0, value: 0.1, diff: null } : null;
    game = E.createGame();
    R.mount(container, { onAction: onAction }); // mount lại chỉ cập nhật handler, không nhân đôi listener
    opened = true;
    A.setSfx(root.BlackjackAudio ? root.BlackjackAudio.play : null); // âm thanh Blackjack chỉ gắn khi màn hình đang mở
    draw({});
    if (api) loadOpenState(epoch);
  }

  // Vừa mở màn hình: lấy số dư; nếu còn ván dở (thoát đột ngột / tải lại trang) thì ván đó bị tính thua
  async function loadOpenState(my) {
    let r = await loadAcct();
    if (my !== epoch) return;
    if (r && r.ok && r.open) {
      await api.bjAbandon();
      if (my !== epoch) return;
      say("bj.msg.leftover");
      r = await loadAcct();
      if (my !== epoch) return;
    } else if (r && !r.ok && r.error !== "auth") { const code = r.error; notice = function () { return errMsg(code); }; if (acct) acct.ready = false; }
    draw({});
  }

  // Thoát / điều hướng đi nơi khác: hủy hoạt ảnh, bỏ ván đang chơi, dọn bàn
  function stop() {
    const abandon = srvMode() && inProgress();
    A.cancelAll(); sess = null; busy = false; epoch++;
    if (abandon) api.bjAbandon();               // thoát giữa ván = thua (cược đã trừ sẵn ở server); chạy ngầm, không chờ
    srvRound = null; notice = null; lastDelta = undefined;
    if (game) game.reset();
    if (opened) { A.clearEffects(anchors()); R.render(game.getState(), {}); }
    opened = false;
    A.setSfx(null);
  }

  // Đổi ngôn ngữ khi đang mở: dịch lại chữ tĩnh/động rồi vẽ lại theo trạng thái hiện tại
  function refresh() { if (!opened) return; R.relabel(); if (!busy) draw({}); } // đang chạy hoạt ảnh: chỉ dịch chữ, không vẽ lại (khỏi lộ điểm sớm)

  const pub = {
    init: init, open: open, stop: stop, startNewRound: startNewRound, refresh: refresh,
    getState: function () { return game ? game.getState() : null; },
    isBusy: function () { return busy; },
    setSpeed: A.setSpeed
  };
  root.Blackjack = pub;
})(typeof window !== "undefined" ? window : globalThis);
