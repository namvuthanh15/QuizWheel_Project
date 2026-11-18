// blackjack-animation.js – HOẠT ẢNH Blackjack (M3). KHÔNG quyết định lá bài nào được chia, KHÔNG tính điểm/kết quả.
// Chỉ nhận phần tử lá bài (do BlackjackRender dựng) rồi di chuyển / lật / thu gom / tạo hiệu ứng kết quả.
//
// CÁCH DÙNG (bộ điều khiển blackjack.js):
//   const s = BlackjackAnimation.newSession(BlackjackRender.getAnchors());   // mỗi hành động (ván mới, HIT, STAND) một phiên
//   const snap = s.snapshot(handEl);  render(...);  await s.fly(cardEl, { snap });  await s.flip(cardEl);  await s.collect();  await s.effect("win");
//   BlackjackAnimation.cancelAll();   // thoát màn hình / ván mới đè lên / điều hướng đi nơi khác
//
// HỦY BỎ: mọi chờ (wait / play) của một phiên bị hủy sẽ bị TỪ CHỐI bằng một lỗi đặc biệt (isCancel(e) === true). Bộ điều khiển bắt lỗi đó và
//   thoát êm; mọi promise nội bộ đều đã gắn trình xử lý nên không có "unhandled rejection". Phiên cũ không thể làm gì thêm sau khi bị hủy
//   (check() ném lỗi hủy ngay), nên ván cũ không ghi đè được ván mới.
// THỜI GIAN: toàn bộ thời lượng nằm trong CONFIG (nhân chung với `speed`). prefers-reduced-motion: bay/lật rút còn ~1ms, bỏ confetti.
// Chỉ dùng transform / opacity (Web Animations API) nên không gây reflow.
(function (root) {
  "use strict";

  // Đơn vị: mili-giây. Đổi tốc độ chung bằng setSpeed(x) (x > 1 = nhanh hơn).
  const CONFIG = {
    speed: 1,
    startDelay: 350,       // chờ trước khi lá đầu tiên rời bộ bài
    dealDuration: 420,     // một lá bay từ bộ bài tới tay
    dealInterval: 260,     // cách nhau giữa hai lá liên tiếp khi chia (> 0 để lá sau xuất phát khi lá trước chưa tới nơi)
    hitDuration: 400,      // lá HIT / lá nhà cái rút thêm
    flipDuration: 550,     // lật 3D lá úp của nhà cái
    revealPause: 350,      // nghỉ sau khi lật / sau khi điểm hiện ra
    dealerPause: 500,      // nghỉ giữa các lượt rút của nhà cái
    collectDuration: 380,  // thu bài về bộ bài
    collectStagger: 45,    // lệch nhau giữa các lá khi thu
    resultDuration: 900,   // thời gian giữ hiệu ứng kết quả trước khi coi ván là hoàn tất
    confettiDuration: 1500
  };
  const DURATION_KEYS = { dealDuration: 1, hitDuration: 1, flipDuration: 1, collectDuration: 1, confettiDuration: 1 }; // các khóa này khi giảm chuyển động -> ~1ms
  const NO_SPEED_FLOOR = { dealInterval: 1, collectStagger: 1 };

  function reduced() {
    try { return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
  }
  // Thời lượng thực (đã áp tốc độ + giảm chuyển động) của một khóa CONFIG
  function duration(key) {
    const base = CONFIG[key];
    if (typeof base !== "number") throw new Error("BlackjackAnimation: khóa thời gian lạ: " + key);
    if (reduced()) return DURATION_KEYS[key] ? 1 : Math.min(base, 90) / (NO_SPEED_FLOOR[key] ? 3 : 1);
    return Math.max(DURATION_KEYS[key] ? 1 : 0, base / CONFIG.speed);
  }
  function setSpeed(x) { x = Number(x); if (x > 0 && isFinite(x)) CONFIG.speed = Math.min(3, Math.max(0.5, x)); return CONFIG.speed; }

  let sfx = null; // móc âm thanh (M4 nối vào audio): sfx("deal" | "land" | "flip" | "win" | "lose" | "push" | "blackjack")
  function setSfx(fn) { sfx = typeof fn === "function" ? fn : null; }
  function emit(name) { if (sfx) { try { sfx(name); } catch (e) { /* âm thanh lỗi không được làm hỏng hoạt ảnh */ } } }
  function noop() {}

  function cancelError() { const e = new Error("blackjack-animation-cancelled"); e.bjCancel = true; return e; }
  function isCancel(e) { return !!(e && e.bjCancel); }

  const EASE_FLY = "cubic-bezier(.3,.7,.3,1)";
  const EASE_FLIP = "cubic-bezier(.45,.05,.3,1)";

  // ---------- Dọn dấu vết hiệu ứng / bay trên bàn ----------
  function clearEffects(anchors) {
    const t = anchors && anchors.table;
    if (!t) return;
    t.removeAttribute("data-fx");
    Array.prototype.forEach.call(t.querySelectorAll(".bj-fx"), function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    Array.prototype.forEach.call(t.querySelectorAll(".is-win"), function (n) { n.classList.remove("is-win"); });
    Array.prototype.forEach.call(t.querySelectorAll(".is-flying"), function (n) { n.classList.remove("is-flying"); });
    Array.prototype.forEach.call(t.querySelectorAll(".has-flight"), function (n) { n.classList.remove("has-flight"); delete n.dataset.flights; });
  }

  // ---------- Phiên hoạt ảnh ----------
  function Session(anchors) {
    this.anchors = anchors;
    this.cancelled = false;
    this.anims = new Set();
    this.waiters = new Set();
  }
  const S = Session.prototype;

  S.check = function () { if (this.cancelled) throw cancelError(); };

  S.cancel = function () {
    if (this.cancelled) return;
    this.cancelled = true;
    this.anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* đã kết thúc */ } });
    this.anims.clear();
    this.waiters.forEach(function (w) { clearTimeout(w.t); w.reject(cancelError()); });
    this.waiters.clear();
    clearEffects(this.anchors);
  };

  // Chờ ms mili-giây (bị hủy -> từ chối bằng lỗi hủy)
  S.wait = function (ms) {
    const s = this;
    if (s.cancelled) return Promise.reject(cancelError());
    return new Promise(function (resolve, reject) {
      const w = { reject: reject, t: 0 };
      w.t = setTimeout(function () { s.waiters.delete(w); resolve(); }, Math.max(0, ms));
      s.waiters.add(w);
    });
  };

  // Chạy một Animation của Web Animations API; xong -> resolve, phiên bị hủy -> từ chối bằng lỗi hủy.
  // Nếu phần tử bị gỡ khỏi DOM giữa chừng (render lại) thì animation tự hủy: coi là xong chứ không phải lỗi.
  S.play = function (el, keyframes, opts) {
    const s = this;
    if (s.cancelled) return Promise.reject(cancelError());
    if (!el || typeof el.animate !== "function") return Promise.resolve();
    let a;
    try { a = el.animate(keyframes, opts); } catch (e) { return Promise.resolve(); }
    s.anims.add(a);
    return new Promise(function (resolve, reject) {
      function done() { s.anims.delete(a); if (s.cancelled) reject(cancelError()); else resolve(); }
      a.finished.then(done, done);
    });
  };

  // Ghi lại tâm của các lá trong một tay TRƯỚC khi render lá mới (để các lá cũ trượt sang chỗ mới thay vì nhảy)
  S.snapshot = function (handEl) {
    const m = new Map();
    if (!handEl) return m;
    Array.prototype.forEach.call(handEl.querySelectorAll(":scope > .bj-card"), function (el) {
      const r = el.getBoundingClientRect();
      m.set(el, { cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
    });
    return m;
  };

  function flightMark(el, on) { // nâng khu vực chứa lá lên trên các khu khác trong lúc bay
    const zone = el.closest && el.closest(".bj-zone");
    if (on) {
      el.classList.add("is-flying");
      if (zone) { zone.dataset.flights = String((Number(zone.dataset.flights) || 0) + 1); zone.classList.add("has-flight"); }
    } else {
      el.classList.remove("is-flying");
      if (zone) { const n = (Number(zone.dataset.flights) || 1) - 1; if (n <= 0) { zone.classList.remove("has-flight"); delete zone.dataset.flights; } else zone.dataset.flights = String(n); }
    }
  }

  // Lá bay từ bộ bài tới chỗ đã được render sẵn của nó (kỹ thuật FLIP). Gọi NGAY sau khi render để không có khung hình nào thấy lá ở đích.
  // opts: { faceDown (đích là úp: không lật), snap (từ snapshot cùng tay), duration ("dealDuration" | "hitDuration") }
  S.fly = function (el, opts) {
    const s = this;
    s.check();
    opts = opts || {};
    const A = s.anchors;
    const deckCard = (A.deck && A.deck.lastElementChild) || A.deck;
    const dr = deckCard.getBoundingClientRect(), er = el.getBoundingClientRect();
    const dx = dr.left + dr.width / 2 - (er.left + er.width / 2);
    const dy = dr.top + dr.height / 2 - (er.top + er.height / 2);
    const w = el.offsetWidth || er.width;
    const sc = w ? dr.width / w : 0.72; // bộ bài bị thu nhỏ bằng CSS: lá khởi hành cùng cỡ với lá trên cùng của bộ bài
    const dur = duration(opts.duration || "dealDuration");
    const tilt = dx < 0 ? -7 : 7;
    const from = "translate(" + dx + "px," + dy + "px) scale(" + sc + ") rotate(" + tilt + "deg)";
    const mid = "translate(" + dx * 0.4 + "px," + (dy * 0.4 - 14) + "px) scale(" + ((1 + sc) / 2 + 0.1) + ") rotate(" + tilt * 0.3 + "deg)";

    flightMark(el, true);
    emit("deal");
    const jobs = [s.play(el, [{ transform: from, offset: 0 }, { transform: mid, offset: 0.55 }, { transform: "none", offset: 1 }],
      { duration: dur, easing: EASE_FLY, fill: "backwards" })];

    // Lá xuất phát úp rồi lật ngửa giữa chặng bay (đích là lá úp thì giữ nguyên mặt sau)
    if (!opts.faceDown && dur > 1) {
      const inner = el.querySelector(".bj-card-inner");
      jobs.push(s.play(inner, [{ transform: "rotateY(180deg)" }, { transform: "rotateY(0deg)" }],
        { duration: dur * 0.55, delay: dur * 0.2, easing: "ease-in-out", fill: "backwards" }));
    }
    // Các lá đã có trong tay trượt sang vị trí mới
    if (opts.snap) {
      opts.snap.forEach(function (old, sib) {
        if (sib === el || !sib.isConnected) return;
        const r = sib.getBoundingClientRect();
        const ddx = old.cx - (r.left + r.width / 2), ddy = old.cy - (r.top + r.height / 2);
        if (Math.abs(ddx) > 0.5 || Math.abs(ddy) > 0.5) {
          jobs.push(s.play(sib, [{ transform: "translate(" + ddx + "px," + ddy + "px)" }, { transform: "none" }], { duration: dur, easing: EASE_FLY }));
        }
      });
    }
    const p = Promise.all(jobs).then(function () { flightMark(el, false); emit("land"); }, function (e) { flightMark(el, false); throw e; });
    p.catch(noop); // người gọi có thể chưa await ngay (chia bài chồng nhau): tránh "unhandled rejection" khi bị hủy
    return p;
  };

  // Lật 3D một lá (dùng cho lá úp của nhà cái): gọi SAU khi render đã đổi lá sang mặt ngửa
  S.flip = function (el) {
    const s = this;
    s.check();
    const dur = duration("flipDuration");
    const inner = el.querySelector(".bj-card-inner");
    flightMark(el, true);
    emit("flip");
    const jobs = [s.play(inner, [{ transform: "rotateY(180deg)" }, { transform: "rotateY(0deg)" }], { duration: dur, easing: EASE_FLIP, fill: "backwards" })];
    if (dur > 1) jobs.push(s.play(el, [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-8px) scale(1.07)", offset: 0.5 }, { transform: "none" }], { duration: dur, easing: "ease-in-out" }));
    const p = Promise.all(jobs).then(function () { flightMark(el, false); }, function (e) { flightMark(el, false); throw e; });
    p.catch(noop);
    return p;
  };

  // Thu mọi lá trên bàn về bộ bài. Các lá giữ trạng thái "đã thu" (ẩn) tới khi render dọn khỏi DOM.
  S.collect = function () {
    const s = this;
    s.check();
    const A = s.anchors;
    const cards = Array.prototype.slice.call(A.table.querySelectorAll(".bj-hand > .bj-card"));
    if (!cards.length) return Promise.resolve();
    const deckCard = (A.deck && A.deck.lastElementChild) || A.deck;
    const dr = deckCard.getBoundingClientRect();
    const dur = duration("collectDuration"), stagger = duration("collectStagger");
    const jobs = [];
    cards.forEach(function (el, i) {
      const er = el.getBoundingClientRect();
      const dx = dr.left + dr.width / 2 - (er.left + er.width / 2), dy = dr.top + dr.height / 2 - (er.top + er.height / 2);
      const sc = (el.offsetWidth || er.width) ? dr.width / (el.offsetWidth || er.width) : 0.72;
      el.classList.add("is-flying");
      const zone = el.closest(".bj-zone"); if (zone) zone.classList.add("has-flight");
      jobs.push(s.play(el, [{ transform: "none", opacity: 1 }, { transform: "translate(" + dx + "px," + dy + "px) scale(" + sc + ")", opacity: 1, offset: 0.85 }, { transform: "translate(" + dx + "px," + dy + "px) scale(" + sc + ")", opacity: 0 }],
        { duration: dur, delay: i * stagger, easing: "cubic-bezier(.5,0,.75,.4)", fill: "both" }));
      if (!el.classList.contains("is-down") && dur > 1) { // lá ngửa úp lại trên đường về
        jobs.push(s.play(el.querySelector(".bj-card-inner"), [{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], { duration: dur * 0.7, delay: i * stagger, easing: "ease-in", fill: "both" }));
      }
    });
    emit("collect");
    const p = Promise.all(jobs);
    p.catch(noop);
    return p;
  };

  // Hiệu ứng kết quả. kind: "win" | "blackjack" | "lose" | "push". Giữ lại tới khi clearEffects()/ván mới. Trả promise xong sau resultDuration.
  const CONFETTI_COLORS = ["#e7bd62", "#ffd21f", "#c92f32", "#fffaf0", "#ff8a1f"];
  S.effect = function (kind) {
    const s = this;
    s.check();
    const A = s.anchors;
    A.table.dataset.fx = kind;
    emit(kind);
    if (kind === "win" || kind === "blackjack") {
      Array.prototype.forEach.call(A.playerHand.querySelectorAll(":scope > .bj-card"), function (c) { c.classList.add("is-win"); });
      if (!reduced()) s._confetti(kind === "blackjack" ? 46 : 26);
    }
    return s.wait(duration("resultDuration"));
  };

  S._confetti = function (count) {
    const s = this, table = s.anchors.table;
    const box = document.createElement("div");
    box.className = "bj-fx"; box.setAttribute("aria-hidden", "true");
    table.appendChild(box);
    const total = duration("confettiDuration");
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("span");
      piece.className = "bj-confetti";
      piece.style.left = (28 + Math.random() * 44) + "%";
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      box.appendChild(piece);
      const rx = (Math.random() - 0.5) * 460, ry = -(60 + Math.random() * 190), rot = (Math.random() - 0.5) * 720;
      s.play(piece, [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: "translate(" + rx * 0.7 + "px," + ry + "px) rotate(" + rot * 0.6 + "deg)", opacity: 1, offset: 0.45 },
        { transform: "translate(" + rx + "px," + (ry + 220) + "px) rotate(" + rot + "deg)", opacity: 0 }
      ], { duration: total * (0.75 + Math.random() * 0.5), easing: "cubic-bezier(.2,.6,.4,1)", fill: "forwards" }).catch(noop);
    }
    s.wait(total * 1.4).then(function () { if (box.parentNode) box.parentNode.removeChild(box); }, noop);
  };

  // ---------- API công khai ----------
  let current = null, lastAnchors = null;
  function newSession(anchors) {
    if (!anchors) throw new Error("BlackjackAnimation.newSession: thiếu anchors");
    if (current) current.cancel(); // phiên cũ không thể chạy thêm gì nữa
    lastAnchors = anchors;
    current = new Session(anchors);
    return current;
  }
  function cancelAll() { if (current) { current.cancel(); current = null; } if (lastAnchors) clearEffects(lastAnchors); }
  function reset() { cancelAll(); lastAnchors = null; }

  root.BlackjackAnimation = {
    CONFIG: CONFIG, duration: duration, setSpeed: setSpeed, getSpeed: function () { return CONFIG.speed; }, isReducedMotion: reduced,
    setSfx: setSfx, newSession: newSession, cancelAll: cancelAll, reset: reset, clearEffects: clearEffects, isCancel: isCancel
  };
})(typeof window !== "undefined" ? window : globalThis);
