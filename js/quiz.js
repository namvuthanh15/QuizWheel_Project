// quiz.js – logic Quiz theo từng mức. Trạng thái (state) tách riêng khỏi phần hiển thị.
// Quy tắc đáp án: KHÔNG BAO GIỜ tô sáng đáp án đúng khi người chơi chọn sai hoặc hết giờ.
// Mỗi câu chỉ được chọn MỘT lần (sai / hết giờ = 0 điểm, sang câu tiếp).
(function () {
  const LETTERS = "ABCD";
  // Luật từng mức: người chơi chọn 1 trong "counts" (số câu), bốc ngẫu nhiên đúng số câu đó; mỗi câu đúng được 100/số câu điểm (tổng 100đ).
  // "plan[số câu]": xét từ trên xuống, số câu đúng >= min thì nhận phần thưởng của bậc đó:
  //   wheel = quay vòng quay đó; prize = nhận thẳng lì xì (số tiền host nhập ở Setting, không quay).
  // Muốn đổi luật thì sửa bảng này (vd: bậc { min: 1, wheel: "easy" } = đúng ít nhất 1 câu thì được quay vòng Easy).
  const PASS = 100;                                 // đủ 100đ = đúng hết
  const RULES = {
    easy: { counts: [2, 4, 6, 8], plan: {
      2: [{ min: 2, wheel: "easy" }, { min: 0, wheel: "free" }],
      4: [{ min: 4, wheel: "easy4" }, { min: 1, wheel: "easy" }, { min: 0, wheel: "free" }],
      6: [{ min: 6, wheel: "easy6" }, { min: 4, wheel: "easy4" }, { min: 1, wheel: "easy" }, { min: 0, wheel: "free" }],
      8: [{ min: 8, prize: true }, { min: 6, wheel: "easy6" }, { min: 4, wheel: "easy4" }, { min: 1, wheel: "easy" }, { min: 0, wheel: "free" }]
    } },
    hard: { counts: [4, 6, 8], plan: {
      4: [{ min: 4, wheel: "hard" }, { min: 1, wheel: "easy" }, { min: 0, wheel: "free" }],
      6: [{ min: 6, wheel: "hard6" }, { min: 4, wheel: "hard" }, { min: 1, wheel: "easy" }, { min: 0, wheel: "free" }],
      8: [{ min: 8, prize: true }, { min: 6, wheel: "hard6" }, { min: 4, wheel: "hard" }, { min: 1, wheel: "easy" }, { min: 0, wheel: "free" }]
    } },
    // Mức nhập ngày: bốc 1 câu gồm "parts" ý. "direct": đúng đủ các ý thì thắng thẳng (không có vòng quay), sai thì hiện ảnh của host
    impossible: { counts: [1], parts: 2, direct: true }
  };

  const state = { level: "", rules: null, count: 0, points: 0, questions: [], index: 0, score: 0, solved: 0,
                  locked: false, timeLeft: 0, timerId: null, settings: null, onDone: null, result: null, typed: null };

  function shuffle(arr) {                           // Fisher–Yates
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // Đảo vị trí 4 đáp án của 1 câu (nếu host bật cho mức này). Trả về BẢN SAO: câu gốc trong kho không bị đổi.
  // Ảnh đi cùng đáp án của nó, và "correct" được cập nhật theo vị trí mới.
  function shuffleAnswers(q) {
    const order = shuffle([0, 1, 2, 3]);
    return Object.assign({}, q, {
      answers: order.map(function (i) { return q.answers[i]; }),
      correct: order.indexOf(q.correct)
    });
  }
  function fmt(n) { return String(Math.round(n * 10) / 10); }   // 100/6 -> 16.7, 12.5 giữ nguyên
  function stopTimer() { if (state.timerId !== null) { clearInterval(state.timerId); state.timerId = null; } }

  function showPanel(name) {                        // name: "empty" | "play" | "result" | null
    ["empty", "play", "result"].forEach(function (p) { UI.$("#quiz-" + p).hidden = (p !== name); });
  }

  // level: "easy"...; count: số câu người chơi đã chọn (phải nằm trong rules.counts)
  // onDone({ passed, wheel, prize, score, solved, total }) được gọi khi người chơi bấm nút ở màn kết quả
  function start(level, count, onDone) {
    stopTimer();
    const rules = RULES[level];
    const valid = !!rules && rules.counts.indexOf(count) >= 0;
    state.level = level; state.rules = rules; state.count = valid ? count : 0; state.points = valid ? PASS / count : 0;
    state.onDone = onDone || null; state.result = null; state.typed = null;
    state.settings = Store.loadSettings();
    const all = valid ? Store.loadQuestions(level) : [];
    if (!valid || all.length < count) {
      UI.$("#quiz-empty-msg").textContent = valid
        ? I18n.t("quiz.needMore", { count: count, have: all.length })
        : I18n.t("quiz.noQuiz");
      showPanel("empty"); return;
    }

    state.questions = shuffle(all).slice(0, count);   // bốc ngẫu nhiên từ kho câu hỏi của mức
    const sh = state.settings.shuffleAnswers;
    if (!Store.isTyped(level) && sh && sh[level]) state.questions = state.questions.map(shuffleAnswers);   // host bật "đảo đáp án" cho mức này
    state.index = 0; state.score = 0; state.solved = 0;
    if (Store.isTyped(level)) { startTyped(); return; }

    UI.$("#quiz-level").textContent = Store.LEVEL_LABELS[level] || "";
    UI.$("#quiz-total").textContent = state.questions.length;
    UI.$("#quiz-pass").textContent = PASS;
    showPanel("play");
    showQuestion();
  }

  function showQuestion() {
    const q = state.questions[state.index];
    state.locked = false;
    UI.$("#quiz-question").textContent = q.text;
    UI.$("#quiz-index").textContent = state.index + 1;
    UI.$("#quiz-feedback").textContent = "";
    UI.$("#quiz-feedback").className = "feedback";
    UI.$("#quiz-explain").hidden = true;
    UI.$("#quiz-next").hidden = true;
    UI.$("#quiz-progress").style.width = (state.index / state.questions.length * 100) + "%";
    updateHud();

    const grid = UI.$("#quiz-answers");
    grid.textContent = "";
    q.answers.forEach(function (a, i) {
      const cell = UI.el("button", "answer-cell" + (a.image ? "" : " no-img"));
      cell.type = "button";
      if (a.text && a.text.length > 28) cell.classList.add("long");   // đáp án dài: giảm cỡ chữ nhẹ
      cell.setAttribute("aria-label", I18n.t("quiz.ansAria", { l: LETTERS[i] }) + (a.text ? ": " + a.text : ""));
      if (a.image) {
        const img = UI.el("img", "cell-img"); img.src = a.image; img.alt = ""; img.draggable = false;
        cell.appendChild(img);
      }
      cell.appendChild(UI.el("span", "cell-badge", LETTERS[i]));
      if (a.text) cell.appendChild(UI.el("span", "cell-label", a.text));
      cell.appendChild(UI.el("span", "cell-mark"));
      cell.addEventListener("click", function () { answer(i); });
      grid.appendChild(cell);
    });

    stopTimer();
    if (state.settings.timePerQuestion > 0) {
      state.timeLeft = state.settings.timePerQuestion;
      renderTime();
      state.timerId = setInterval(function () {
        state.timeLeft--;
        renderTime();
        if (state.timeLeft <= 0) timeUp();
      }, 1000);
    } else {
      renderTime();
    }
  }

  function cells() { return UI.$("#quiz-answers").children; }

  function endQuestion() {                          // khóa toàn bộ, hiện nút tiếp
    state.locked = true;
    stopTimer();
    for (let i = 0; i < cells().length; i++) cells()[i].disabled = true;
    const next = UI.$("#quiz-next");
    next.textContent = I18n.t(state.index === state.questions.length - 1 ? "quiz.seeResult" : "quiz.next");
    next.hidden = false;
    next.focus();
  }

  function feedback(msg, kind) {
    const f = UI.$("#quiz-feedback");
    f.textContent = msg; f.className = "feedback " + kind;
  }

  function answer(i) {
    if (state.locked) return;                       // chặn bấm khi câu đã kết thúc
    const q = state.questions[state.index];
    const cell = cells()[i];
    if (cell.disabled) return;

    if (i === q.correct) {
      state.solved++;
      state.score = Math.round(state.solved * PASS / state.count * 10) / 10;   // tính lại từ số câu đúng để không lệch số lẻ (vd 100/6)
      cell.classList.add("right"); cell.querySelector(".cell-mark").textContent = "✓";
      feedback(I18n.t("quiz.right", { pts: fmt(state.points) }), "good");
      if (q.explain) { UI.$("#quiz-explain").textContent = q.explain; UI.$("#quiz-explain").hidden = false; }
    } else {
      // Chọn sai: chỉ đánh dấu đáp án đã chọn, KHÔNG tiết lộ đáp án đúng
      cell.classList.add("wrong"); cell.querySelector(".cell-mark").textContent = "✗";
      feedback(I18n.t("quiz.wrong"), "bad");
      Sfx.wrong();                                  // ngẫu nhiên: bruh / shocked / fart
    }
    updateHud();
    endQuestion();
  }

  function timeUp() {
    if (state.locked) return;
    feedback(I18n.t("quiz.timeUp"), "bad");
    endQuestion();
  }

  function next() {
    if (!state.locked) return;
    state.index++;
    if (state.index >= state.questions.length) finish(); else showQuestion();
  }

  function finish() {
    stopTimer();
    UI.$("#quiz-progress").style.width = "100%";
    showResult(state.questions.length, I18n.t("quiz.unit"));
  }

  function showResult(total, unit) {
    resetResultUI();
    const passed = state.solved === total;           // đúng hết = đủ 100đ
    const tier = state.rules.plan[total].find(function (t) { return state.solved >= t.min; });
    const wheel = tier.wheel || null;
    state.result = { passed: passed, wheel: wheel, prize: !!tier.prize, score: state.score, solved: state.solved, total: total };
    UI.$("#quiz-summary").textContent =
      I18n.t("quiz.summary", { solved: state.solved, total: total, unit: unit, score: fmt(state.score), pass: PASS });
    if (tier.prize) { showPrize(total); return; }
    const verdict = UI.$("#quiz-verdict");
    verdict.textContent = passed
      ? I18n.t("quiz.pass", { pass: PASS, level: Store.WHEEL_LABELS[wheel] })
      : I18n.t("quiz.fail", { pass: PASS, level: Store.WHEEL_LABELS[wheel] });
    verdict.className = "feedback " + (passed ? "good" : "bad");
    UI.$("#quiz-continue").textContent = I18n.t("quiz.spinLevel", { level: Store.WHEEL_LABELS[wheel] });
    showPanel("result");
  }

  // Đúng hết 8 câu: nhận thẳng lì xì (không quay). Dùng đúng hiệu ứng như lúc nhận thưởng vòng quay: âm "wow" + màn hình reveal.
  function showPrize(total) {
    const price = state.settings.bigPrize[state.level];
    UI.$("#quiz-continue").hidden = true;
    UI.$("#quiz-back").hidden = false;
    const verdict = UI.$("#quiz-verdict");
    verdict.textContent = I18n.t("quiz.prizeWin", { total: total, price: price });
    verdict.className = "feedback good win-text";
    showPanel("result");
    Sfx.wow();
    UI.reveal(I18n.t("quiz.prizeReveal", { price: price }));
  }

  /* ---------- Mức nhập ngày (impossible) ---------- */
  function typedInputs() {                          // [[ngày, tháng, năm] của ý 1, [ngày, tháng, năm] của ý 2]
    return [["#typed-d1", "#typed-m1", "#typed-y1"], ["#typed-d2", "#typed-m2", "#typed-y2"]].map(function (row) {
      return row.map(function (sel) { return UI.$(sel); });
    });
  }
  function allInputs() { return typedInputs().reduce(function (a, row) { return a.concat(row); }, []); }

  // Ngày/tháng so khớp theo số (05 = 5). Năm: gõ 4 số, hoặc 2 số cuối của năm (vd 45 cho 1945)
  function partOk(part, f) {
    const d = parseInt(f[0].value, 10), m = parseInt(f[1].value, 10), y = parseInt(f[2].value, 10);
    if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return false;
    const yOk = y === part.y || (f[2].value.trim().length === 2 && y === part.y % 100);
    return d === part.d && m === part.m && yOk;
  }

  function startTyped() {
    const q = state.questions[0];
    state.typed = q; state.locked = false;
    UI.$("#typed-level").textContent = Store.LEVEL_LABELS[state.level] || "";
    UI.$("#typed-question").textContent = q.text;
    allInputs().forEach(function (inp) { inp.value = ""; inp.disabled = false; });
    UI.$("#typed-submit").disabled = false;

    stopTimer();
    const on = state.settings.timePerQuestion > 0;
    if (on) {
      state.timeLeft = state.settings.timePerQuestion;
      renderTypedTime();
      state.timerId = setInterval(function () {
        state.timeLeft--;
        renderTypedTime();
        if (state.timeLeft <= 0) submitTyped();       // hết giờ: chấm phần đã nhập
      }, 1000);
    } else { renderTypedTime(); }
    UI.showScreen("typed");
    allInputs()[0].focus();
  }

  function renderTypedTime() {
    const on = state.settings.timePerQuestion > 0;
    UI.$("#typed-time").textContent = on ? Math.max(0, state.timeLeft) + "s" : "∞";
    UI.$("#typed-timer").classList.toggle("low", on && state.timeLeft <= 5);
  }

  function submitTyped() {
    if (state.locked || !state.typed) return;
    state.locked = true; stopTimer();
    allInputs().forEach(function (inp) { inp.disabled = true; });
    UI.$("#typed-submit").disabled = true;
    const rows = typedInputs();
    // Chấm từng ý; KHÔNG tiết lộ đáp án đúng
    state.solved = 0;
    state.typed.parts.forEach(function (p, i) { if (partOk(p, rows[i])) state.solved++; });
    const passed = state.solved === state.typed.parts.length;
    state.result = { passed: passed, wheel: null, score: state.solved, solved: state.solved, total: state.typed.parts.length };
    UI.showScreen("quiz");
    showDirectResult(passed);
  }

  // Thắng: thông báo 100K. Thua: ảnh do host tải lên (nếu host chưa tải thì hiện chữ)
  function showDirectResult(passed) {
    resetResultUI();
    UI.$("#quiz-summary").hidden = true;
    UI.$("#quiz-continue").hidden = true;
    UI.$("#quiz-back").hidden = false;
    const verdict = UI.$("#quiz-verdict"), img = UI.$("#quiz-lose-img");
    if (passed) {
      verdict.textContent = I18n.t("quiz.win", { price: Store.LEVEL_PRICES[state.level] || "" });
      verdict.className = "feedback good win-text";
      Sfx.omg();
      UI.reveal(I18n.t("quiz.bigWin"));
    } else {
      Sfx.catLaugh();                               // sai ở mức Impossible
      const src = Store.loadLoseImage();
      if (src) { img.src = src; img.hidden = false; verdict.textContent = ""; }
      else { verdict.textContent = I18n.t("quiz.loseText"); }
      verdict.className = "feedback bad";
    }
    showPanel("result");
  }

  function resetResultUI() {
    UI.$("#quiz-summary").hidden = false;
    UI.$("#quiz-continue").hidden = false;
    UI.$("#quiz-back").hidden = true;
    UI.$("#quiz-lose-img").hidden = true;
    UI.$("#quiz-lose-img").removeAttribute("src");
  }

  function proceed() {                              // nút ở màn kết quả
    if (!state.result || !state.onDone) return;
    const res = state.result; state.result = null;   // chỉ xử lý 1 lần, bấm đúp không mở vòng quay hai lần
    state.onDone(res);
  }

  function updateHud() { UI.$("#quiz-score").textContent = state.score; }
  function renderTime() {
    const t = UI.$("#quiz-time"), on = state.settings.timePerQuestion > 0;
    t.textContent = on ? Math.max(0, state.timeLeft) + "s" : "∞";
    UI.$(".timer").classList.toggle("low", on && state.timeLeft <= 5);
  }

  function reset() { stopTimer(); showPanel(null); }

  window.Quiz = { start: start, next: next, proceed: proceed, submitTyped: submitTyped, reset: reset, rules: RULES };
})();
