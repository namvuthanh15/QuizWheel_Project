// blackjack-engine.js – LUẬT CHƠI Blackjack (M1). Thuần logic: không đụng DOM, không hoạt ảnh, không âm thanh.
//
// LUẬT (bản đơn giản hóa):
//  • 1 bộ 52 lá mỗi ván, xáo Fisher-Yates. Chia theo thứ tự: Người chơi, Nhà cái, Người chơi, Nhà cái (lá 2 của nhà cái úp).
//  • Ace tính 11 hoặc 1 tùy cái nào tốt nhất mà không quá 21. J/Q/K = 10.
//  • Blackjack tự nhiên = đúng 2 lá đầu cộng được 21 (21 từ 3 lá trở lên KHÔNG phải Blackjack).
//  • Nếu một bên có Blackjack tự nhiên thì ván kết thúc ngay sau khi chia (nhà cái lật lá úp rồi ra kết quả).
//  • Người chơi: HIT (rút 1 lá, quá 21 thì thua ngay) hoặc STAND. Không có Double / Split / Insurance.
//  • Nhà cái rút khi điểm < 17, dừng khi >= 17. NHÀ CÁI DỪNG Ở "SOFT 17" (A+6 = 17 thì không rút). Hằng số RULES bên dưới.
//  • Kết quả: người chơi quá 21 -> thua (kể cả nhà cái cũng sẽ quá); nhà cái quá 21 -> người chơi thắng;
//    Blackjack tự nhiên hơn 21 thường; cả hai tự nhiên -> hòa; còn lại so điểm, bằng nhau -> hòa.
//
// Hành động sai KHÔNG ném lỗi và KHÔNG đổi trạng thái: trả { ok:false, error:"..." }.
// Lá úp của nhà cái không bao giờ lọt ra ngoài qua getState()/kết quả hành động khi còn úp.
(function (root) {
  "use strict";

  const Cards = root.BlackjackCards || (typeof require === "function" ? require("./blackjack-cards.js") : null);
  if (!Cards) throw new Error("BlackjackEngine cần BlackjackCards nạp trước");

  const PHASE = Object.freeze({
    IDLE: "IDLE", DEALING: "DEALING", PLAYER_TURN: "PLAYER_TURN", DEALER_REVEAL: "DEALER_REVEAL",
    DEALER_TURN: "DEALER_TURN", ROUND_RESULT: "ROUND_RESULT", ROUND_COMPLETE: "ROUND_COMPLETE"
  });
  const RESULT = Object.freeze({
    PLAYER_WIN: "PLAYER_WIN", DEALER_WIN: "DEALER_WIN", PUSH: "PUSH",
    PLAYER_BLACKJACK: "PLAYER_BLACKJACK", DEALER_BLACKJACK: "DEALER_BLACKJACK", PLAYER_BUST: "PLAYER_BUST"
  });
  const RULES = Object.freeze({ target: 21, dealerStandsOn: 17, dealerHitsSoft17: false });
  const HIDDEN = Object.freeze({ hidden: true }); // chỗ giữ chỗ cho lá úp

  // ---------- Hàm thuần (không trạng thái) ----------

  // Điểm tốt nhất của một tay. Ace = 11, hạ về 1 từng lá khi đang quá 21.
  function calculateScore(cards) {
    if (!Array.isArray(cards)) throw new TypeError("calculateScore: cần mảng lá bài");
    let total = 0, aces = 0;
    for (let i = 0; i < cards.length; i++) {
      const v = Cards.rankValue(cards[i] && cards[i].rank);
      if (!(v >= 2)) throw new TypeError("calculateScore: lá bài không hợp lệ");
      total += v;
      if (v === 11) aces++;
    }
    while (total > RULES.target && aces > 0) { total -= 10; aces--; }
    return { total: total, soft: aces > 0, bust: total > RULES.target, blackjack: cards.length === 2 && total === RULES.target, count: cards.length };
  }

  // Nhà cái có phải rút thêm không (dừng ở soft 17 nên chỉ nhìn tổng điểm)
  function dealerShouldDraw(cards) {
    const s = calculateScore(cards);
    return s.total < RULES.dealerStandsOn || (RULES.dealerHitsSoft17 && s.total === RULES.dealerStandsOn && s.soft);
  }

  // Phân loại kết quả của hai tay ĐÃ HOÀN TẤT (đầy đủ lá, kể cả lá úp)
  function determineResult(playerCards, dealerCards) {
    const p = calculateScore(playerCards), d = calculateScore(dealerCards);
    let result;
    if (p.bust) result = RESULT.PLAYER_BUST;
    else if (d.bust) result = RESULT.PLAYER_WIN;
    else if (p.blackjack && d.blackjack) result = RESULT.PUSH;
    else if (p.blackjack) result = RESULT.PLAYER_BLACKJACK;
    else if (d.blackjack) result = RESULT.DEALER_BLACKJACK;
    else if (p.total > d.total) result = RESULT.PLAYER_WIN;
    else if (p.total < d.total) result = RESULT.DEALER_WIN;
    else result = RESULT.PUSH;
    return { result: result, playerTotal: p.total, dealerTotal: d.total, playerBust: p.bust, dealerBust: d.bust };
  }

  // ---------- Một ván chơi (đối tượng có trạng thái, đóng kín) ----------

  function fail(error) { return { ok: false, error: error }; }

  // Chuẩn hóa bộ bài do bên ngoài đưa vào (id hoặc đối tượng lá bài). Hợp lệ: lá có thật, không trùng, tối thiểu 4 lá
  function normalizeDeck(list) {
    if (!Array.isArray(list) || list.length < 4 || list.length > 52) return null;
    const seen = Object.create(null), out = [];
    for (let i = 0; i < list.length; i++) {
      const id = typeof list[i] === "string" ? list[i] : list[i] && list[i].id;
      const card = Cards.getCard(id);
      if (!card || seen[card.id]) return null;
      seen[card.id] = true; out.push(card);
    }
    return out;
  }

  function createGame(options) {
    const rng = options && typeof options.rng === "function" ? options.rng : undefined;
    let phase = PHASE.IDLE, deck = [], player = [], dealer = [];
    let holeHidden = false, naturalResolved = false, outcome = null, round = 0;

    function maskedDealer() { return dealer.map(function (c, i) { return i === 1 && holeHidden ? HIDDEN : c; }); }
    function visibleDealerCards() { return holeHidden ? dealer.slice(0, 1) : dealer.slice(); }

    function finalize() { outcome = determineResult(player, dealer); phase = PHASE.ROUND_RESULT; }

    function getState() {
      const pScore = calculateScore(player);
      const vis = visibleDealerCards();
      const showResult = phase === PHASE.ROUND_RESULT || phase === PHASE.ROUND_COMPLETE;
      return {
        phase: phase, round: round, deckRemaining: deck.length,
        player: { cards: player.slice(), score: pScore },
        dealer: { cards: maskedDealer(), holeHidden: holeHidden, score: vis.length ? calculateScore(vis) : null },
        canHit: phase === PHASE.PLAYER_TURN, canStand: phase === PHASE.PLAYER_TURN,
        naturalResolved: naturalResolved,
        // Kết quả chỉ lộ ra khi ván đã ra kết quả (dealerTotal có thể là điểm đầy đủ dù lá úp chưa lật: UI tự quyết khi nào hiện)
        result: showResult && outcome ? Object.assign({}, outcome) : null
      };
    }

    // IDLE / ROUND_COMPLETE -> DEALING. Chia logic 4 lá ngay; hoạt ảnh sẽ chạy theo danh sách deal trả về.
    function startRound(opts) {
      if (phase !== PHASE.IDLE && phase !== PHASE.ROUND_COMPLETE) return fail("INVALID_STATE");
      let d;
      if (opts && opts.deck !== undefined) { d = normalizeDeck(opts.deck); if (!d) return fail("INVALID_DECK"); } // bộ bài do server/test chỉ định
      else d = Cards.shuffle(Cards.createDeck(), rng);
      deck = d; player = []; dealer = []; outcome = null; naturalResolved = false;
      const p1 = deck.shift(), d1 = deck.shift(), p2 = deck.shift(), d2 = deck.shift();
      player.push(p1, p2); dealer.push(d1, d2);
      holeHidden = true; phase = PHASE.DEALING; round++;
      return {
        ok: true, phase: phase,
        deal: [{ to: "player", card: p1, faceDown: false }, { to: "dealer", card: d1, faceDown: false },
               { to: "player", card: p2, faceDown: false }, { to: "dealer", card: HIDDEN, faceDown: true }]
      };
    }

    // DEALING -> PLAYER_TURN (hoặc DEALER_REVEAL nếu có Blackjack tự nhiên). Gọi sau khi hoạt ảnh chia bài xong.
    function beginPlayerTurn() {
      if (phase !== PHASE.DEALING) return fail("INVALID_STATE");
      naturalResolved = calculateScore(player).blackjack || calculateScore(dealer).blackjack;
      phase = naturalResolved ? PHASE.DEALER_REVEAL : PHASE.PLAYER_TURN;
      return { ok: true, phase: phase, naturalResolved: naturalResolved };
    }

    function playerHit() {
      if (phase !== PHASE.PLAYER_TURN) return fail("INVALID_STATE");
      if (!deck.length) return fail("DECK_EMPTY");
      const card = deck.shift();
      player.push(card);
      const score = calculateScore(player);
      if (score.bust) finalize(); // quá 21: kết thúc ngay, lá úp của nhà cái vẫn úp cho tới khi UI gọi revealDealer()
      return { ok: true, card: card, score: score, bust: score.bust, reached21: score.total === RULES.target, phase: phase };
    }

    function playerStand() {
      if (phase !== PHASE.PLAYER_TURN) return fail("INVALID_STATE");
      phase = PHASE.DEALER_REVEAL;
      return { ok: true, phase: phase };
    }

    // Lật lá úp. Hợp lệ ở DEALER_REVEAL, hoặc ở ROUND_RESULT khi lá úp còn úp (người chơi quá 21 mà UI muốn lật cho đẹp)
    function revealDealer() {
      const pending = phase === PHASE.ROUND_RESULT && holeHidden;
      if (phase !== PHASE.DEALER_REVEAL && !pending) return fail("INVALID_STATE");
      holeHidden = false;
      const card = dealer[1];
      if (phase === PHASE.DEALER_REVEAL) { if (naturalResolved) finalize(); else phase = PHASE.DEALER_TURN; }
      return { ok: true, card: card, score: calculateScore(dealer), phase: phase };
    }

    // Một bước của nhà cái: rút 1 lá nếu cần. done=true khi nhà cái đã dừng (ván ra kết quả). Dùng cho hoạt ảnh từng lá.
    function dealerStep() {
      if (phase !== PHASE.DEALER_TURN) return fail("INVALID_STATE");
      if (!dealerShouldDraw(dealer)) { finalize(); return { ok: true, card: null, done: true, phase: phase }; }
      if (!deck.length) return fail("DECK_EMPTY");
      const card = deck.shift();
      dealer.push(card);
      const done = !dealerShouldDraw(dealer);
      if (done) finalize();
      return { ok: true, card: card, done: done, score: calculateScore(dealer), phase: phase };
    }

    // Nhà cái chơi trọn lượt trong một lần (cho test / chế độ không hoạt ảnh)
    function dealerPlay() {
      if (phase !== PHASE.DEALER_TURN) return fail("INVALID_STATE");
      const drawn = [];
      for (;;) {
        const s = dealerStep();
        if (!s.ok) return s;
        if (s.card) drawn.push(s.card);
        if (s.done) return { ok: true, cards: drawn, result: Object.assign({}, outcome), phase: phase };
      }
    }

    // ROUND_RESULT -> ROUND_COMPLETE (UI gọi khi hiệu ứng kết quả xong); từ đây mới được startRound()
    function completeRound() {
      if (phase !== PHASE.ROUND_RESULT) return fail("INVALID_STATE");
      holeHidden = false; phase = PHASE.ROUND_COMPLETE;
      return { ok: true, phase: phase };
    }

    // ----- Chế độ SERVER (M6): server giữ bộ bài và chỉ đưa từng lá một, engine chỉ làm máy trạng thái + tính điểm cho UI -----
    // Nhét thêm lá vào ĐẦU bộ bài để lần rút kế tiếp (HIT / nhà cái rút) lấy đúng các lá server đã đưa. Từ chối lá trùng với lá trên bàn / trong bộ bài.
    function feed(list) {
      if (phase === PHASE.IDLE || phase === PHASE.ROUND_COMPLETE) return fail("INVALID_STATE");
      const cs = normalizeAny(list);
      if (!cs) return fail("INVALID_CARD");
      const taken = Object.create(null);
      // Lá úp còn úp có thể là lá GIỮ CHỖ (server chưa đưa lá thật) nên không tính là "đã có trên bàn": lá thật server đưa sau đó được phép trùng id với nó
      player.concat(dealer.filter(function (c, i) { return !(i === 1 && holeHidden); }), deck).forEach(function (c) { taken[c.id] = true; });
      for (let i = 0; i < cs.length; i++) { if (taken[cs[i].id]) return fail("DUPLICATE_CARD"); taken[cs[i].id] = true; }
      deck = cs.concat(deck);
      return { ok: true, deckRemaining: deck.length };
    }
    // Thay lá úp (chỗ giữ chỗ) bằng lá thật server vừa đưa. Chỉ hợp lệ khi lá úp CÒN úp.
    function setHole(card) {
      if (!holeHidden || phase === PHASE.IDLE || phase === PHASE.ROUND_COMPLETE) return fail("INVALID_STATE");
      const cs = normalizeAny([card]);
      if (!cs) return fail("INVALID_CARD");
      const taken = Object.create(null);
      player.concat(dealer.filter(function (c, i) { return i !== 1; }), deck).forEach(function (c) { taken[c.id] = true; });
      if (taken[cs[0].id]) return fail("DUPLICATE_CARD");
      dealer[1] = cs[0];
      return { ok: true };
    }
    function normalizeAny(list) {
      if (!Array.isArray(list) || !list.length) return null;
      const out = [], seen = Object.create(null);
      for (let i = 0; i < list.length; i++) {
        const id = typeof list[i] === "string" ? list[i] : list[i] && list[i].id;
        const c = Cards.getCard(id);
        if (!c || seen[c.id]) return null;
        seen[c.id] = true; out.push(c);
      }
      return out;
    }

    // Bỏ ván / thoát màn hình: về IDLE từ bất kỳ trạng thái nào, xóa sạch bài trên bàn
    function reset() {
      phase = PHASE.IDLE; deck = []; player = []; dealer = [];
      holeHidden = false; naturalResolved = false; outcome = null;
      return { ok: true, phase: phase };
    }

    return {
      getState: getState, startRound: startRound, beginPlayerTurn: beginPlayerTurn, playerHit: playerHit,
      playerStand: playerStand, revealDealer: revealDealer, dealerStep: dealerStep, dealerPlay: dealerPlay,
      completeRound: completeRound, reset: reset, feed: feed, setHole: setHole
    };
  }

  root.BlackjackEngine = Object.freeze({
    PHASE: PHASE, RESULT: RESULT, RULES: RULES,
    createGame: createGame, calculateScore: calculateScore, determineResult: determineResult, dealerShouldDraw: dealerShouldDraw
  });
  if (typeof module !== "undefined" && module.exports) module.exports = root.BlackjackEngine;
})(typeof window !== "undefined" ? window : globalThis);
