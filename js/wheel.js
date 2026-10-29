// wheel.js – vòng quay vẽ bằng Canvas, cấu hình lấy từ Store (do host nhập ở Setting > Vòng quay).
// Nguyên tắc: CHỌN KẾT QUẢ TRƯỚC (logic), rồi tính góc dừng để kim chỉ đúng ô đó.
// Mỗi ô có xác suất bằng nhau, nên giá trị có nhiều ô sẽ dễ trúng hơn (count / tổng số ô).
(function () {
  const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MIN_SLICES = 2, SPIN_MS = REDUCED ? 1200 : 4500, SPIN_TURNS = REDUCED ? 1 : 6, TWO_PI = Math.PI * 2, POINTER = -Math.PI / 2;   // kim ở trên cùng

  // level: mức đang hiển thị; once = true khi đang chơi thật (chỉ được quay 1 lần), false khi host xem thử
  const state = { level: "free", once: false, done: false, items: [], slices: [], rotation: 0, spinning: false };
  let canvas, ctx;
  let runId = 0;                                   // mỗi lần quay có 1 mã; đổi mã = hủy lần quay cũ

  // Trải các ô cùng giá trị ra xa nhau: lần lượt lấy giá trị còn nhiều ô nhất, tránh trùng với ô vừa đặt
  function expand(items) {
    const left = items.map(function (it) { return { it: it, n: it.count }; });
    const out = []; let last = null;
    for (;;) {
      let best = null;
      left.forEach(function (x) { if (x.n > 0 && x !== last && (!best || x.n > best.n)) best = x; });
      if (!best) best = left.find(function (x) { return x.n > 0; });   // chỉ còn giá trị vừa dùng
      if (!best) break;
      best.n--; last = best;
      out.push({ label: best.it.label, color: best.it.color });
    }
    return out;
  }

  function draw() {
    const w = canvas.width, c = w / 2, r = c - 8, n = state.slices.length;
    ctx.clearRect(0, 0, w, w);
    if (n === 0) {
      ctx.beginPath(); ctx.arc(c, c, r, 0, TWO_PI); ctx.fillStyle = "#ffe9b0"; ctx.fill();
      ctx.strokeStyle = "#3a1000"; ctx.lineWidth = 8; ctx.stroke();
      return;
    }
    const arc = TWO_PI / n, fontSize = n > 14 ? 17 : 22;
    state.slices.forEach(function (s, i) {
      const a0 = state.rotation + i * arc;
      ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, r, a0, a0 + arc); ctx.closePath();
      ctx.fillStyle = s.color; ctx.fill();
      ctx.strokeStyle = "#3a1000"; ctx.lineWidth = 3; ctx.stroke();

      ctx.save();                                // vẽ chữ dọc theo bán kính
      ctx.translate(c, c); ctx.rotate(a0 + arc / 2);
      ctx.textAlign = "right"; ctx.lineJoin = "round";
      ctx.font = "900 " + fontSize + "px 'Segoe UI', sans-serif";
      let text = s.label;
      while (ctx.measureText(text).width > r - 70 && text.length > 3) text = text.slice(0, -2);
      if (text !== s.label) text += "…";
      ctx.lineWidth = 5; ctx.strokeStyle = "#3a1000"; ctx.strokeText(text, r - 22, fontSize * 0.36);
      ctx.fillStyle = "#fff"; ctx.fillText(text, r - 22, fontSize * 0.36);
      ctx.restore();
    });
    ctx.beginPath(); ctx.arc(c, c, r, 0, TWO_PI);    // viền ngoài
    ctx.strokeStyle = "#3a1000"; ctx.lineWidth = 8; ctx.stroke();
    ctx.beginPath(); ctx.arc(c, c, 28, 0, TWO_PI);   // tâm
    ctx.fillStyle = "#ffd21f"; ctx.fill();
    ctx.strokeStyle = "#3a1000"; ctx.lineWidth = 5; ctx.stroke();
  }

  function indexUnderPointer(rotation) {
    const arc = TWO_PI / state.slices.length;
    const a = (((POINTER - rotation) % TWO_PI) + TWO_PI) % TWO_PI;
    return Math.floor(a / arc);
  }

  // Góc quay cuối để kim chỉ vào GIỮA ô "winner" (lệch nhẹ nhưng vẫn nằm trong ô)
  function landingRotation(winner, fromRotation, extraTurns) {
    const arc = TWO_PI / state.slices.length;
    const jitter = (Math.random() - 0.5) * arc * 0.7;
    const target = POINTER - (winner + 0.5) * arc + jitter;
    const diff = (((target - fromRotation) % TWO_PI) + TWO_PI) % TWO_PI;
    return fromRotation + diff + TWO_PI * extraTurns;
  }

  function spin() {
    if (state.spinning || (state.once && state.done) || state.slices.length < MIN_SLICES) return;
    state.spinning = true;
    UI.$("#spin-btn").disabled = true;
    const out = UI.$("#wheel-result");
    out.textContent = ""; out.classList.remove("show");

    const winner = Math.floor(Math.random() * state.slices.length);   // 1) chọn kết quả (mỗi ô xác suất bằng nhau)
    const startRot = state.rotation;
    const endRot = landingRotation(winner, startRot, SPIN_TURNS);
    const myRun = ++runId;              // 2) tính góc dừng
    const t0 = performance.now();

    function frame(now) {
      if (myRun !== runId) return;                                    // đã rời màn hình / bị hủy: dừng, không công bố gì
      const t = Math.min(1, (now - t0) / SPIN_MS);
      state.rotation = startRot + (endRot - startRot) * (1 - Math.pow(1 - t, 4));   // giảm tốc
      draw();
      if (t < 1) { requestAnimationFrame(frame); return; }
      state.spinning = false;                                         // 3) xong animation mới công bố
      state.done = true;
      UI.$("#spin-btn").disabled = state.once || state.slices.length < MIN_SLICES;   // chơi thật: hết lượt
      syncButtons();
      const shown = state.slices[indexUnderPointer(state.rotation)];  // đọc lại từ vị trí kim
      out.textContent = I18n.t("wheel.result", { x: shown.label });
      out.classList.add("show");
      Sfx.wow();                                                      // sau khi quay xong
      UI.reveal(shown.label);                                         // phần thưởng to giữa màn hình
    }
    requestAnimationFrame(frame);
  }

  // Rời màn hình vòng quay giữa lúc đang quay: hủy lần quay, không hiện kết quả/âm thanh ở màn hình khác
  function stop() {
    if (!state.spinning) return;
    runId++; state.spinning = false;
  }

  function renderLegend() {
    const ul = UI.$("#wheel-legend"), total = state.slices.length;
    ul.textContent = "";
    state.items.forEach(function (it) {
      const li = UI.el("li");
      const dot = UI.el("span", "dot"); dot.style.background = it.color;
      li.append(dot, UI.el("span", "label", it.label),
                UI.el("span", "legend-meta", it.count + " " + I18n.t("wheel.cells") + " · " + (Math.round(it.count / total * 1000) / 10) + "%"));
      ul.appendChild(li);
    });
    UI.$("#wheel-note").textContent = total >= MIN_SLICES
      ? I18n.t("wheel.noteOk", { total: total })
      : I18n.t("wheel.noteFew", { min: MIN_SLICES });
  }

  // Nút "Chơi tiếp" hiện khi đã quay xong (hoặc vòng quay không dùng được) ở chế độ chơi thật
  function syncButtons() {
    UI.$("#wheel-again").hidden = !(state.once && (state.done || state.slices.length < MIN_SLICES));
    UI.$("#wheel-edit").hidden = state.once;
  }

  // Gọi mỗi lần mở màn hình: nạp lại cấu hình mới nhất của host.
  // opts.level: mức cần hiện (bỏ trống = giữ mức gần nhất); opts.once: chơi thật, chỉ quay 1 lần
  function open(opts) {
    if (state.spinning) return;
    opts = opts || {};
    if (opts.level && Store.WHEEL_LEVELS.indexOf(opts.level) >= 0) state.level = opts.level;
    state.once = !!opts.once; state.done = false;
    UI.$("#wheel-level").textContent = Store.LEVEL_LABELS[state.level] || "";
    state.items = Store.loadWheel(state.level);
    state.slices = expand(state.items);
    if (state.slices.length < MIN_SLICES) state.items = state.items.slice();
    UI.$("#wheel-result").textContent = "";
    UI.$("#spin-btn").disabled = state.slices.length < MIN_SLICES;
    syncButtons();
    renderLegend();
    draw();
  }

  function init() {
    canvas = UI.$("#wheel-canvas"); ctx = canvas.getContext("2d");
    UI.$("#spin-btn").addEventListener("click", spin);
    open();
  }

  // Kiểm tra nhanh: với mọi ô, góc dừng tính ra có khiến kim chỉ đúng ô đó không (dùng khi test)
  function selfTest(rounds) {
    let bad = 0;
    for (let k = 0; k < rounds; k++) {
      for (let w = 0; w < state.slices.length; w++) {
        const start = Math.random() * 100 - 50;
        state.rotation = start;
        if (indexUnderPointer(landingRotation(w, start, 6)) !== w) bad++;
      }
    }
    return { slices: state.slices.length, mismatches: bad };
  }

  window.Wheel = { init: init, open: open, stop: stop, level: function () { return state.level; }, _selfTest: selfTest };
})();
