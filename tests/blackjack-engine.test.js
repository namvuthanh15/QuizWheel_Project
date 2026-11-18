// Test engine Blackjack (M1). Chạy: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const Cards = require("../js/blackjack/blackjack-cards.js");
const E = require("../js/blackjack/blackjack-engine.js");
const { PHASE, RESULT } = E;

// Dựng bộ bài theo thứ tự điểm: ranks[0]=Người chơi 1, [1]=Nhà cái 1, [2]=Người chơi 2, [3]=Nhà cái 2 (úp), rồi các lá rút tiếp.
// Tự chọn chất chưa dùng để không trùng lá.
function stack(ranks) {
  const used = new Set();
  return ranks.map(function (r) {
    const s = Cards.SUITS.find(function (x) { return !used.has(x + "-" + r); });
    if (!s) throw new Error("hết chất cho " + r);
    used.add(s + "-" + r);
    return s + "-" + r;
  });
}
const hand = function (ranks) { return stack(ranks).map(Cards.getCard); };
const score = function (ranks) { return E.calculateScore(hand(ranks)); };

// Chạy đủ vòng chia -> lượt người chơi (bỏ qua hoạt ảnh). Trả game ở PLAYER_TURN hoặc DEALER_REVEAL (nếu có tự nhiên)
function setup(ranks) {
  const g = E.createGame();
  assert.equal(g.startRound({ deck: stack(ranks) }).ok, true);
  assert.equal(g.beginPlayerTurn().ok, true);
  return g;
}
// Chơi một ván: người chơi đứng ngay, nhà cái chơi hết
function standAndFinish(g) {
  if (g.getState().phase === PHASE.PLAYER_TURN) assert.equal(g.playerStand().ok, true);
  assert.equal(g.revealDealer().ok, true);
  if (g.getState().phase === PHASE.DEALER_TURN) assert.equal(g.dealerPlay().ok, true);
  return g.getState();
}

test("bộ bài: đúng 52 lá, không trùng, đủ 4 chất x 13 hạng", () => {
  const d = Cards.createDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d.map((c) => c.id)).size, 52);
  for (const s of Cards.SUITS) for (const r of Cards.RANKS) assert.ok(d.find((c) => c.suit === s && c.rank === r), s + r);
  assert.equal(Cards.getCard("spades-A").color, "black");
  assert.equal(Cards.getCard("hearts-K").color, "red");
  assert.equal(Cards.getCard("diamonds-5").color, "red");
  assert.equal(Cards.getCard("clubs-2").color, "black");
  assert.equal(Cards.getCard("nope"), null);
});

test("giá trị lá: 2-10 theo số, J/Q/K = 10, A = 11 (gốc)", () => {
  for (let n = 2; n <= 10; n++) assert.equal(Cards.rankValue(String(n)), n);
  for (const r of ["J", "Q", "K"]) assert.equal(Cards.rankValue(r), 10);
  assert.equal(Cards.rankValue("A"), 11);
  assert.ok(Number.isNaN(Cards.rankValue("1")));
});

test("lá bài bị đóng băng, createDeck trả mảng mới mỗi lần", () => {
  const a = Cards.createDeck(), b = Cards.createDeck();
  a.pop();
  assert.equal(b.length, 52);
  assert.throws(() => { "use strict"; a[0].rank = "K"; });
});

test("xáo bài: hoán vị đủ 52 lá, không sửa mảng gốc, rng cố định cho kết quả cố định", () => {
  const d = Cards.createDeck(), before = d.map((c) => c.id).join();
  const s = Cards.shuffle(d);
  assert.equal(d.map((c) => c.id).join(), before);
  assert.equal(s.length, 52);
  assert.equal(new Set(s.map((c) => c.id)).size, 52);
  const mk = () => { let x = 12345; return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; };
  assert.equal(Cards.shuffle(d, mk()).map((c) => c.id).join(), Cards.shuffle(d, mk()).map((c) => c.id).join());
  assert.notEqual(s.map((c) => c.id).join(), before); // xác suất trùng thứ tự gốc ~ 1/52!
  assert.equal(Cards.shuffle(d, () => 0.999999999).length, 52); // rng sát 1 không vượt chỉ số
});

test("xáo bài: phân bố lá đầu tiên tương đối đều (thống kê thô)", () => {
  const counts = {}, N = 52 * 400;
  for (let i = 0; i < N; i++) { const id = Cards.shuffle(Cards.createDeck())[0].id; counts[id] = (counts[id] || 0) + 1; }
  const vals = Object.values(counts);
  assert.equal(vals.length, 52);
  for (const v of vals) assert.ok(v > 400 * 0.6 && v < 400 * 1.4, "lệch quá: " + v);
});

test("điểm: A+K = 21 Blackjack tự nhiên", () => {
  const s = score(["A", "K"]);
  assert.equal(s.total, 21); assert.equal(s.blackjack, true); assert.equal(s.soft, true);
});
test("điểm: A+9 = 20 (soft)", () => { const s = score(["A", "9"]); assert.equal(s.total, 20); assert.equal(s.soft, true); assert.equal(s.blackjack, false); });
test("điểm: A+9+5 = 15 (Ace hạ về 1, hết soft)", () => { const s = score(["A", "9", "5"]); assert.equal(s.total, 15); assert.equal(s.soft, false); });
test("điểm: A+A = 12", () => { const s = score(["A", "A"]); assert.equal(s.total, 12); assert.equal(s.soft, true); });
test("điểm: A+A+A+A = 14, A x4 + 7 = 21", () => { assert.equal(score(["A", "A", "A", "A"]).total, 14); assert.equal(score(["A", "A", "A", "A", "7"]).total, 21); });
test("điểm: K+Q+5 = 25 quá 21", () => { const s = score(["K", "Q", "5"]); assert.equal(s.total, 25); assert.equal(s.bust, true); });
test("điểm: 21 bằng 3 lá KHÔNG phải Blackjack tự nhiên", () => { const s = score(["7", "7", "7"]); assert.equal(s.total, 21); assert.equal(s.blackjack, false); });
test("điểm: A+5+5 = 21 ba lá, không tự nhiên; 10+J = 20", () => {
  assert.equal(score(["A", "5", "5"]).blackjack, false);
  assert.equal(score(["10", "J"]).total, 20);
});
test("điểm: tay rỗng = 0; đầu vào sai ném TypeError", () => {
  assert.equal(E.calculateScore([]).total, 0);
  assert.throws(() => E.calculateScore(null), TypeError);
  assert.throws(() => E.calculateScore([{ rank: "Z" }]), TypeError);
});

test("determineResult: đủ 6 loại kết quả", () => {
  const r = (p, d) => E.determineResult(hand(p), hand(d)).result;
  assert.equal(r(["K", "Q", "5"], ["9", "7"]), RESULT.PLAYER_BUST);
  assert.equal(r(["K", "Q", "5"], ["K", "Q", "5"]), RESULT.PLAYER_BUST); // người chơi quá trước, nhà cái thắng
  assert.equal(r(["10", "8"], ["K", "6", "9"]), RESULT.PLAYER_WIN); // nhà cái quá
  assert.equal(r(["A", "K"], ["7", "7", "7"]), RESULT.PLAYER_BLACKJACK); // tự nhiên hơn 21 thường
  assert.equal(r(["7", "7", "7"], ["A", "K"]), RESULT.DEALER_BLACKJACK);
  assert.equal(r(["A", "K"], ["A", "Q"]), RESULT.PUSH); // cả hai tự nhiên
  assert.equal(r(["10", "9"], ["10", "8"]), RESULT.PLAYER_WIN);
  assert.equal(r(["10", "8"], ["10", "9"]), RESULT.DEALER_WIN);
  assert.equal(r(["10", "8"], ["9", "9"]), RESULT.PUSH);
  assert.equal(r(["7", "7", "7"], ["A", "10", "10"]), RESULT.PUSH); // 21 thường (3 lá) vs 21 thường (3 lá) = hòa
});

test("dealerShouldDraw: rút ở 16, dừng ở 17, dừng ở soft 17 (A+6)", () => {
  assert.equal(E.dealerShouldDraw(hand(["10", "6"])), true);
  assert.equal(E.dealerShouldDraw(hand(["10", "7"])), false);
  assert.equal(E.dealerShouldDraw(hand(["A", "6"])), false); // soft 17: đứng
  assert.equal(E.dealerShouldDraw(hand(["A", "5"])), true); // soft 16: rút
  assert.equal(E.RULES.dealerHitsSoft17, false);
});

test("chia bài: thứ tự P, D, P, D(úp); lá úp không lộ trong getState / danh sách chia", () => {
  const g = E.createGame();
  const r = g.startRound({ deck: stack(["5", "9", "6", "K"]) });
  assert.deepEqual(r.deal.map((x) => x.to), ["player", "dealer", "player", "dealer"]);
  assert.deepEqual(r.deal.map((x) => x.faceDown), [false, false, false, true]);
  assert.equal(r.deal[3].card.hidden, true);
  assert.equal(r.deal[3].card.rank, undefined);
  const st = g.getState();
  assert.equal(st.phase, PHASE.DEALING);
  assert.equal(st.dealer.cards[0].rank, "9");
  assert.equal(st.dealer.cards[1].hidden, true);
  assert.equal(st.dealer.holeHidden, true);
  assert.equal(st.dealer.score.total, 9); // chỉ tính lá ngửa
  assert.equal(st.player.score.total, 11);
  assert.equal(st.result, null);
  assert.equal(JSON.stringify(st).includes('"K"'), false); // lá úp (K) không xuất hiện ở đâu cả
});

test("luồng đầy đủ: đứng, lật, nhà cái rút tới >= 17, đúng thứ tự phase", () => {
  // P: 10+9=19, D: 6+(úp)5=11 -> rút 4 => 15 -> rút 3 => 18. 19 > 18: thắng
  const g = setup(["10", "6", "9", "5", "4", "3"]);
  assert.equal(g.getState().phase, PHASE.PLAYER_TURN);
  assert.equal(g.playerStand().phase, PHASE.DEALER_REVEAL);
  const rv = g.revealDealer();
  assert.equal(rv.card.rank, "5"); assert.equal(rv.phase, PHASE.DEALER_TURN);
  assert.equal(g.getState().dealer.score.total, 11);
  const s1 = g.dealerStep(); assert.equal(s1.card.rank, "4"); assert.equal(s1.done, false);
  const s2 = g.dealerStep(); assert.equal(s2.card.rank, "3"); assert.equal(s2.done, true);
  const st = g.getState();
  assert.equal(st.phase, PHASE.ROUND_RESULT);
  assert.equal(st.result.result, RESULT.PLAYER_WIN);
  assert.equal(st.result.dealerTotal, 18);
  assert.equal(g.completeRound().phase, PHASE.ROUND_COMPLETE);
});

test("nhà cái rút khi dưới 17, nhiều lá liên tiếp (dealerPlay)", () => {
  const g = setup(["10", "2", "9", "2", "2", "3", "4", "5"]); // D: 2+2=4 -> +2=6 -> +3=9 -> +4=13 -> +5=18
  g.playerStand(); g.revealDealer();
  const r = g.dealerPlay();
  assert.deepEqual(r.cards.map((c) => c.rank), ["2", "3", "4", "5"]);
  assert.equal(r.result.dealerTotal, 18);
  assert.equal(r.result.result, RESULT.PLAYER_WIN);
});

test("nhà cái dừng ở 17 ngay (không rút), kể cả soft 17", () => {
  let g = setup(["10", "10", "9", "7", "2"]); // D: 10+7 = 17
  g.playerStand(); g.revealDealer();
  let r = g.dealerStep();
  assert.equal(r.card, null); assert.equal(r.done, true);
  assert.equal(g.getState().dealer.cards.length, 2);
  assert.equal(g.getState().result.result, RESULT.PLAYER_WIN); // 19 > 17

  g = setup(["10", "A", "9", "6", "2"]); // D: A+6 = soft 17 -> đứng, không rút lá "2"
  g.playerStand(); g.revealDealer();
  r = g.dealerStep();
  assert.equal(r.done, true); assert.equal(r.card, null);
  assert.equal(g.getState().dealer.cards.length, 2);
});

test("nhà cái quá 21 -> người chơi thắng", () => {
  const g = setup(["10", "10", "8", "6", "K"]); // D: 10+6=16 +K = 26
  const st = standAndFinish(g);
  assert.equal(st.result.result, RESULT.PLAYER_WIN); assert.equal(st.result.dealerBust, true);
});

test("người chơi quá 21: kết thúc ngay, nhà cái thắng, lá úp còn úp đến khi lật", () => {
  const g = setup(["K", "9", "Q", "8", "5"]); // P: 20 +5 = 25
  const h = g.playerHit();
  assert.equal(h.ok, true); assert.equal(h.bust, true); assert.equal(h.card.rank, "5");
  let st = g.getState();
  assert.equal(st.phase, PHASE.ROUND_RESULT);
  assert.equal(st.result.result, RESULT.PLAYER_BUST);
  assert.equal(st.dealer.holeHidden, true);
  assert.equal(st.dealer.cards[1].hidden, true);
  assert.equal(g.playerHit().ok, false);
  const rv = g.revealDealer();
  assert.equal(rv.ok, true); assert.equal(rv.phase, PHASE.ROUND_RESULT);
  assert.equal(g.getState().dealer.cards[1].rank, "8");
  assert.equal(g.revealDealer().ok, false); // lật lần hai bị từ chối
  assert.equal(g.completeRound().ok, true);
});

test("HIT nhiều lần, reached21 và điểm cập nhật; Ace hạ giá trị khi cần", () => {
  const g = setup(["A", "10", "3", "7", "4", "3", "K"]); // P: A+3=soft14 -> +4=soft18 -> +3=soft21 (reached21)
  let h = g.playerHit(); assert.equal(h.score.total, 18); assert.equal(h.score.soft, true); assert.equal(h.reached21, false);
  h = g.playerHit(); assert.equal(h.score.total, 21); assert.equal(h.reached21, true); assert.equal(h.bust, false);
  h = g.playerHit(); assert.equal(h.score.total, 21); assert.equal(h.score.soft, false); // 21 hạ Ace -> 1... A+3+4+3+K = 21 cứng
  assert.equal(g.getState().player.cards.length, 5);
});

test("Blackjack tự nhiên người chơi: kết thúc ngay sau chia, phải lật lá úp", () => {
  const g = setup(["A", "9", "K", "7", "2"]);
  let st = g.getState();
  assert.equal(st.phase, PHASE.DEALER_REVEAL); assert.equal(st.naturalResolved, true);
  assert.equal(st.canHit, false); assert.equal(g.playerHit().ok, false); assert.equal(g.playerStand().ok, false);
  assert.equal(g.revealDealer().phase, PHASE.ROUND_RESULT);
  st = g.getState();
  assert.equal(st.result.result, RESULT.PLAYER_BLACKJACK);
  assert.equal(st.dealer.cards.length, 2); // nhà cái không rút
});

test("Blackjack tự nhiên nhà cái, và cả hai tự nhiên = hòa", () => {
  let g = setup(["9", "A", "8", "K", "2"]);
  g.revealDealer();
  assert.equal(g.getState().result.result, RESULT.DEALER_BLACKJACK);
  g = setup(["A", "A", "K", "Q", "2"]);
  g.revealDealer();
  assert.equal(g.getState().result.result, RESULT.PUSH);
});

test("Blackjack tự nhiên thắng 21 thường của nhà cái (nhà cái 7+7+7 không xảy ra vì ván đã chốt)", () => {
  const g = setup(["A", "7", "Q", "7", "7"]); // D: 14, P tự nhiên -> chốt ngay, không rút
  g.revealDealer();
  assert.equal(g.getState().result.result, RESULT.PLAYER_BLACKJACK);
  assert.equal(g.getState().dealer.cards.length, 2);
});

test("21 thường người chơi (3 lá) thắng nhà cái 20, hòa nhà cái 21 thường", () => {
  let g = setup(["5", "10", "6", "10", "10"]); // P: 5+6+10 = 21 ; D: 20
  g.playerHit(); let st = standAndFinish(g);
  assert.equal(st.result.result, RESULT.PLAYER_WIN);
  g = setup(["5", "5", "6", "6", "10", "10"]); // P 5+6+10=21 ; D 5+6=11 -> +10 = 21 (ba lá)
  g.playerHit(); st = standAndFinish(g);
  assert.equal(st.result.result, RESULT.PUSH);
});

test("điểm bằng nhau = hòa; nhà cái cao hơn = thua", () => {
  let st = standAndFinish(setup(["10", "10", "8", "8"]));
  assert.equal(st.result.result, RESULT.PUSH);
  st = standAndFinish(setup(["10", "10", "7", "9"]));
  assert.equal(st.result.result, RESULT.DEALER_WIN);
});

test("hành động sai bị từ chối và KHÔNG đổi trạng thái", () => {
  const snap = (g) => JSON.stringify(g.getState());
  const all = (g) => [() => g.startRound(), () => g.beginPlayerTurn(), () => g.playerHit(), () => g.playerStand(),
    () => g.revealDealer(), () => g.dealerStep(), () => g.dealerPlay(), () => g.completeRound()];
  const allowed = {
    IDLE: ["startRound"], DEALING: ["beginPlayerTurn"], PLAYER_TURN: ["playerHit", "playerStand"],
    DEALER_REVEAL: ["revealDealer"], DEALER_TURN: ["dealerStep", "dealerPlay"], ROUND_RESULT: ["completeRound"], ROUND_COMPLETE: ["startRound"]
  };
  const names = ["startRound", "beginPlayerTurn", "playerHit", "playerStand", "revealDealer", "dealerStep", "dealerPlay", "completeRound"];
  const reach = {
    IDLE: () => E.createGame(),
    DEALING: () => { const g = E.createGame(); g.startRound({ deck: stack(["10", "6", "9", "5", "2", "3", "4"]) }); return g; },
    PLAYER_TURN: () => setup(["10", "6", "9", "5", "2", "3", "4"]),
    DEALER_REVEAL: () => { const g = setup(["10", "6", "9", "5", "2", "3", "4"]); g.playerStand(); return g; },
    DEALER_TURN: () => { const g = setup(["10", "6", "9", "5", "2", "3", "4"]); g.playerStand(); g.revealDealer(); return g; },
    ROUND_RESULT: () => { const g = setup(["10", "6", "9", "5", "2", "3", "4"]); standAndFinish(g); return g; },
    ROUND_COMPLETE: () => { const g = setup(["10", "6", "9", "5", "2", "3", "4"]); standAndFinish(g); g.completeRound(); return g; }
  };
  for (const phase of Object.keys(reach)) {
    names.forEach(function (n, i) {
      if (allowed[phase].indexOf(n) !== -1) return;
      const g = reach[phase](); assert.equal(g.getState().phase, phase);
      const before = snap(g), res = all(g)[i]();
      assert.equal(res.ok, false, phase + " -> " + n + " phải bị từ chối");
      assert.equal(res.error, "INVALID_STATE");
      assert.equal(snap(g), before, phase + " -> " + n + " không được đổi trạng thái");
    });
  }
});

test("startRound: bộ bài sai bị từ chối và không đổi trạng thái", () => {
  const g = E.createGame(); const before = JSON.stringify(g.getState());
  for (const bad of [[], ["spades-A", "spades-A", "hearts-2", "clubs-3"], ["spades-A", "hearts-2", "clubs-3"], ["x-1", "y-2", "z-3", "w-4"], "abc", null, new Array(53).fill("spades-A")]) {
    const r = g.startRound({ deck: bad });
    assert.equal(r.ok, false); assert.equal(r.error, "INVALID_DECK");
  }
  assert.equal(JSON.stringify(g.getState()), before);
});

test("hết bài thì từ chối rút, không đổi trạng thái", () => {
  const g = setup(["2", "2", "2", "2"]); // chỉ đúng 4 lá
  const before = JSON.stringify(g.getState());
  const r = g.playerHit();
  assert.equal(r.ok, false); assert.equal(r.error, "DECK_EMPTY");
  assert.equal(JSON.stringify(g.getState()), before);
});

test("getState trả bản sao: sửa kết quả trả về không ảnh hưởng engine", () => {
  const g = setup(["10", "6", "9", "5", "2", "3", "4"]);
  const s = g.getState();
  s.player.cards.push({ rank: "K" }); s.phase = "HACKED"; s.dealer.cards.length = 0; s.canHit = false;
  const t = g.getState();
  assert.equal(t.player.cards.length, 2); assert.equal(t.phase, PHASE.PLAYER_TURN); assert.equal(t.dealer.cards.length, 2); assert.equal(t.canHit, true);
});

test("vòng đời: nhiều ván liên tiếp, round tăng, tay cũ bị xóa; reset giữa chừng về IDLE", () => {
  const g = E.createGame();
  for (let i = 1; i <= 3; i++) {
    assert.equal(g.startRound().ok, true);
    assert.equal(g.getState().round, i);
    g.beginPlayerTurn();
    const st = g.getState();
    assert.equal(st.player.cards.length, 2); assert.equal(st.dealer.cards.length, 2);
    standAndFinish(g); g.completeRound();
  }
  g.startRound(); g.beginPlayerTurn();
  assert.equal(g.reset().phase, PHASE.IDLE);
  const st = g.getState();
  assert.equal(st.player.cards.length, 0); assert.equal(st.dealer.cards.length, 0); assert.equal(st.result, null);
  assert.equal(g.playerHit().ok, false);
  assert.equal(g.startRound().ok, true); // dùng lại được sau reset
});

test("kiểm tra ngẫu nhiên 5000 ván: bất biến luôn đúng", () => {
  const g = E.createGame();
  const seen = { PLAYER_WIN: 0, DEALER_WIN: 0, PUSH: 0, PLAYER_BLACKJACK: 0, DEALER_BLACKJACK: 0, PLAYER_BUST: 0 };
  for (let n = 0; n < 5000; n++) {
    assert.equal(g.startRound().ok, true);
    g.beginPlayerTurn();
    let guard = 0;
    while (g.getState().phase === PHASE.PLAYER_TURN && guard++ < 30) {
      const st = g.getState();
      if (st.player.score.total < 12 + Math.floor(Math.random() * 6)) assert.equal(g.playerHit().ok, true); else g.playerStand();
    }
    const ph = g.getState().phase;
    if (ph === PHASE.DEALER_REVEAL) g.revealDealer();
    if (g.getState().phase === PHASE.DEALER_REVEAL) assert.fail("kẹt DEALER_REVEAL");
    if (g.getState().phase === PHASE.DEALER_TURN) assert.equal(g.dealerPlay().ok, true);
    if (g.getState().dealer.holeHidden) g.revealDealer();
    const st = g.getState();
    assert.equal(st.phase, PHASE.ROUND_RESULT);
    const ids = st.player.cards.concat(st.dealer.cards).map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, "lá bài trùng trong một ván");
    assert.equal(st.deckRemaining, 52 - ids.length);
    assert.equal(st.result.result, E.determineResult(st.player.cards, st.dealer.cards).result);
    if (st.result.result !== RESULT.PLAYER_BUST && !st.naturalResolved) assert.ok(E.calculateScore(st.dealer.cards).total >= 17, "nhà cái dừng khi < 17");
    seen[st.result.result]++;
    assert.equal(g.completeRound().ok, true);
  }
  for (const k of Object.keys(seen)) assert.ok(seen[k] > 0, "chưa gặp kết quả " + k);
});

// ---------- Chế độ server (M6): feed() + setHole() ----------
test("chế độ server: lá úp giữ chỗ -> setHole, HIT/nhà cái rút bằng lá do server đưa (feed)", () => {
  const g = E.createGame();
  // người chơi 10+6, nhà cái ngửa 9, lá úp giữ chỗ clubs-2 (không bao giờ tạo Blackjack với lá ngửa)
  assert.equal(g.startRound({ deck: ["spades-10", "hearts-9", "diamonds-6", "clubs-2"] }).ok, true);
  assert.equal(g.beginPlayerTurn().naturalResolved, false);
  assert.equal(g.feed(["spades-5"]).ok, true);                         // server: HIT -> 5 (quá 21 = 21 -> 10+6+5 = 21)
  const h = g.playerHit();
  assert.equal(h.card.id, "spades-5"); assert.equal(h.bust, false); assert.equal(h.reached21, true);
  assert.equal(g.playerStand().ok, true);
  assert.equal(g.setHole("hearts-8").ok, true);                         // server: lá úp thật = 8 -> nhà cái 17
  assert.equal(g.revealDealer().card.id, "hearts-8");
  assert.equal(g.dealerStep().done, true);                              // 9+8 = 17 -> dừng
  const st = g.getState();
  assert.equal(st.result.result, RESULT.PLAYER_WIN);
});
test("chế độ server: người chơi quá 21 -> setHole trước HIT để kết quả có điểm nhà cái thật", () => {
  const g = E.createGame();
  g.startRound({ deck: ["spades-10", "hearts-9", "diamonds-6", "clubs-2"] }); g.beginPlayerTurn();
  assert.equal(g.setHole("hearts-7").ok, true);
  g.feed(["clubs-K"]);
  const h = g.playerHit(); assert.equal(h.bust, true);
  assert.equal(g.getState().result.result, RESULT.PLAYER_BUST);
  assert.equal(g.getState().result.dealerTotal, 16);
});
test("chế độ server: feed/setHole từ chối lá trùng, lá lạ, sai trạng thái; không đổi trạng thái", () => {
  const g = E.createGame();
  assert.equal(g.feed(["spades-5"]).error, "INVALID_STATE");
  assert.equal(g.setHole("spades-5").error, "INVALID_STATE");
  g.startRound({ deck: ["spades-10", "hearts-9", "diamonds-6", "clubs-2"] }); g.beginPlayerTurn();
  assert.equal(g.feed(["spades-10"]).error, "DUPLICATE_CARD");           // trùng lá của người chơi
  assert.equal(g.feed(["nope-1"]).error, "INVALID_CARD");
  assert.equal(g.feed([]).error, "INVALID_CARD");
  assert.equal(g.feed(["clubs-3", "clubs-3"]).error, "INVALID_CARD");   // trùng ngay trong danh sách
  assert.equal(g.setHole("hearts-9").error, "DUPLICATE_CARD");           // trùng lá ngửa của nhà cái
  assert.equal(g.setHole("diamonds-6").error, "DUPLICATE_CARD");
  assert.equal(g.getState().deckRemaining, 0);
  g.playerStand(); g.revealDealer();
  assert.equal(g.setHole("clubs-3").error, "INVALID_STATE");             // lá úp đã lật rồi
});

test("chế độ server: lá server đưa sau có thể trùng id với lá giữ chỗ của lá úp (chưa phải lá thật)", () => {
  const g = E.createGame();
  g.startRound({ deck: ["spades-10", "hearts-9", "diamonds-6", "clubs-2"] }); g.beginPlayerTurn();   // lá úp giữ chỗ = clubs-2
  assert.equal(g.feed(["clubs-2"]).ok, true);                // server rút đúng clubs-2 cho người chơi: hợp lệ, vì lá úp thật còn chưa biết
  const h = g.playerHit(); assert.equal(h.card.id, "clubs-2"); assert.equal(h.score.total, 18);
  g.playerStand();
  assert.equal(g.setHole("hearts-8").ok, true);              // lá úp thật = 8 (khác mọi lá đã lộ)
  assert.equal(g.setHole("clubs-2").error, "DUPLICATE_CARD"); // nhưng lá úp thật không được trùng lá người chơi đang cầm
});
