// quiz.js – hiển thị Quiz theo từng mức. Từ phiên bản Supabase: câu hỏi, đáp án đúng, chấm điểm và bảng thưởng đều do SERVER giữ.
// Trình duyệt chỉ: xin câu hiện tại (không có đáp án đúng) -> gửi lựa chọn -> nhận "đúng/sai" -> hiển thị.
// Quy tắc đáp án: KHÔNG BAO GIỜ tô sáng đáp án đúng khi người chơi chọn sai hoặc hết giờ. Mỗi câu chỉ chọn MỘT lần.
(function () {
  const LETTERS = "ABCDEF";
  const PASS = 100;
  // Bảng luật dự phòng (khi chưa tải được cấu hình server) – luật thật nằm ở app_config.rules trên server, lấy qua Quiz.rules.
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
    impossible: { counts: [1], parts: 2, direct: true }
  };
  function currentRules() { const r = Store.remote() && Store.remote().rules; return r && typeof r === "object" ? r : RULES; }

  const state = { playId: "", level: "", total: 0, index: 0, solved: 0, score: 0, locked: false, busy: false,
                  timeLeft: 0, timed: false, timerId: null, onDone: null, result: null, pending: null, typed: false, essay: false };

  function fmt(n) { return String(Math.round(n * 10) / 10); }
  function stopTimer() { if (state.timerId !== null) { clearInterval(state.timerId); state.timerId = null; } }
  function showPanel(name) { ["empty", "play", "result"].forEach(function (p) { UI.$("#quiz-" + p).hidden = (p !== name); }); }
  function cells() { return UI.$("#quiz-answers").children; }
  function feedback(msg, kind) { const f = UI.$("#quiz-feedback"); f.textContent = msg; f.className = "feedback " + kind; }
  function fail(code) { stopTimer(); UI.toast(Api.errText(code)); UI.showScreen("levels"); }

  // play: { playId, level, total, typed } (kết quả của api_start hoặc api_state.active). onDone(res) khi người chơi bấm "Quay thưởng".
  async function run(play, onDone) {
    stopTimer();
    state.playId = play.playId; state.level = play.level; state.total = play.total || 1;
    state.index = 0; state.solved = 0; state.score = 0; state.onDone = onDone || null; state.result = null; state.pending = null;
    state.typed = Store.isTyped(play.level);
    await loadQuestion();
  }

  async function loadQuestion() {
    state.busy = true;
    const r = await Api.question(state.playId);
    state.busy = false;
    if (!r.ok) return fail(r.error);
    state.index = r.index; state.total = r.total; state.solved = r.solved || 0;
    state.score = Math.round(state.solved * PASS / state.total * 10) / 10;
    state.locked = false; state.pending = null;
    state.timed = r.remaining !== null && r.remaining !== undefined;
    state.timeLeft = state.timed ? r.remaining : 0;
    state.essay = r.kind === "essay";
    if (r.typed) renderTyped(r); else renderQuestion(r);
    startTimer();
  }

  /* ---------- Trắc nghiệm ---------- */
  function renderQuestion(q) {
    UI.$("#quiz-level").textContent = Store.LEVEL_LABELS[q.level] || "";
    UI.$("#quiz-total").textContent = q.total;
    UI.$("#quiz-pass").textContent = PASS;
    UI.$("#quiz-question").textContent = q.text;
    UI.$("#quiz-index").textContent = q.index + 1;
    UI.$("#quiz-feedback").textContent = ""; UI.$("#quiz-feedback").className = "feedback";
    UI.$("#quiz-explain").hidden = true; UI.$("#quiz-next").hidden = true;
    UI.$("#quiz-progress").style.width = (q.index / q.total * 100) + "%";
    updateHud();
    const grid = UI.$("#quiz-answers"), essay = UI.$("#quiz-essay");
    grid.textContent = "";
    grid.dataset.n = String((q.answers || []).length);
    grid.hidden = state.essay; essay.hidden = !state.essay;
    if (state.essay) {
      bindEssay();
      UI.$("#essay-input").value = ""; UI.$("#essay-input").disabled = false; UI.$("#essay-submit").disabled = false;
      setTimeout(function () { UI.$("#essay-input").focus(); }, 0);
    }
    (q.answers || []).forEach(function (a, i) {
      const image = Store.safeImage(a.image);
      const cell = UI.el("button", "answer-cell" + (image ? "" : " no-img"));
      cell.type = "button";
      if (a.text && a.text.length > 28) cell.classList.add("long");
      cell.setAttribute("aria-label", I18n.t("quiz.ansAria", { l: LETTERS[i] }) + (a.text ? ": " + a.text : ""));
      if (image) { const img = UI.el("img", "cell-img"); img.src = image; img.alt = ""; img.draggable = false; cell.appendChild(img); }
      cell.appendChild(UI.el("span", "cell-badge", LETTERS[i]));
      if (a.text) cell.appendChild(UI.el("span", "cell-label", a.text));
      cell.appendChild(UI.el("span", "cell-mark"));
      cell.addEventListener("click", function () { choose(i); });
      grid.appendChild(cell);
    });
    UI.showScreen("quiz");
    showPanel("play");
  }

  function endQuestion(finished) {
    state.locked = true; stopTimer();
    for (let i = 0; i < cells().length; i++) cells()[i].disabled = true;
    if (state.essay) setEssayDisabled(true);
    const next = UI.$("#quiz-next");
    next.textContent = I18n.t(finished ? "quiz.seeResult" : "quiz.next");
    next.hidden = false; next.focus();
  }

  // Tự luận: gõ chữ rồi bấm "Trả lời" hoặc Enter. force = true khi hết giờ (gửi cả khi ô trống).
  let essayBound = false;
  function bindEssay() {
    if (essayBound) return; essayBound = true;
    UI.$("#essay-submit").addEventListener("click", function () { submitEssay(false); });
    UI.$("#essay-input").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submitEssay(false); } });
  }
  function setEssayDisabled(on) { UI.$("#essay-input").disabled = on; UI.$("#essay-submit").disabled = on; }
  function submitEssay(force) {
    if (state.locked || state.busy || !state.essay) return;
    const v = UI.$("#essay-input").value.trim();
    if (!v && !force) return;
    choose(null, { text: v });
  }

  // choice: vị trí người chơi bấm (0 đến n-1); null = hết giờ hoặc câu tự luận (khi đó parts = { text })
  async function choose(choice, parts) {
    if (state.locked || state.busy) return;
    state.busy = true; stopTimer();
    for (let i = 0; i < cells().length; i++) cells()[i].disabled = true;
    if (state.essay) setEssayDisabled(true);
    const r = await Api.answer(state.playId, state.index, choice, parts);
    state.busy = false;
    if (!r.ok) {
      if (r.error === "stale") { await loadQuestion(); return; }
      if (r.error === "network" || r.error === "server") {            // mạng lỗi: mở lại để thử gửi lần nữa (server chặn trùng nhờ số thứ tự câu)
        UI.toast(Api.errText(r.error));
        for (let i = 0; i < cells().length; i++) cells()[i].disabled = false;
        if (state.essay) setEssayDisabled(false);
        return;
      }
      return fail(r.error);
    }
    state.solved = r.solved !== undefined ? r.solved : state.solved + (r.correct ? 1 : 0);
    state.score = Math.round(state.solved * PASS / state.total * 10) / 10;
    const cell = (choice === null || choice === undefined) ? null : cells()[choice];
    if (r.correct && (cell || state.essay)) {
      if (cell) { cell.classList.add("right"); cell.querySelector(".cell-mark").textContent = "✓"; }
      feedback(I18n.t("quiz.right", { pts: fmt(PASS / state.total) }), "good");
      if (r.explain) { UI.$("#quiz-explain").textContent = r.explain; UI.$("#quiz-explain").hidden = false; }
    } else if (r.timedOut || (choice === null && !state.essay)) {
      feedback(I18n.t("quiz.timeUp"), "bad");
    } else if (cell || state.essay) {
      if (cell) { cell.classList.add("wrong"); cell.querySelector(".cell-mark").textContent = "✗"; }   // KHÔNG tiết lộ đáp án đúng
      feedback(I18n.t("quiz.wrong"), "bad");
      Sfx.wrong();
    }
    state.pending = r.finished ? r.result : null;
    updateHud();
    endQuestion(!!r.finished);
  }

  function next() {
    if (!state.locked) return;
    if (state.pending) { UI.$("#quiz-progress").style.width = "100%"; showResult(state.pending); return; }
    loadQuestion();
  }

  function showResult(res) {
    resetResultUI();
    state.result = Object.assign({ playId: state.playId }, res);
    UI.$("#quiz-summary").textContent =
      I18n.t("quiz.summary", { solved: res.solved, total: res.total, unit: I18n.t("quiz.unit"), score: fmt(res.score), pass: PASS });
    if (res.prize) { showPrize(res); return; }
    const verdict = UI.$("#quiz-verdict");
    verdict.textContent = res.passed
      ? I18n.t("quiz.pass", { pass: PASS, level: Store.WHEEL_LABELS[res.wheel] })
      : I18n.t("quiz.fail", { pass: PASS, level: Store.WHEEL_LABELS[res.wheel] });
    verdict.className = "feedback " + (res.passed ? "good" : "bad");
    UI.$("#quiz-continue").textContent = I18n.t("quiz.spinLevel", { level: Store.WHEEL_LABELS[res.wheel] });
    UI.showScreen("quiz");
    showPanel("result");
  }

  // Đúng hết 8 câu: nhận thẳng lì xì (server đã ghi nhận). Hiệu ứng như lúc nhận thưởng vòng quay.
  function showPrize(res) {
    const price = res.prizeLabel || "";
    UI.$("#quiz-continue").hidden = true;
    UI.$("#quiz-back").hidden = false;
    const verdict = UI.$("#quiz-verdict");
    verdict.textContent = I18n.t("quiz.prizeWin", { total: res.total, price: price });
    verdict.className = "feedback good win-text";
    UI.showScreen("quiz"); showPanel("result");
    Sfx.wow();
    UI.reveal(I18n.t("quiz.prizeReveal", { price: price }));
  }

  /* ---------- Mức nhập ngày (impossible) ---------- */
  function typedInputs() {
    return [["#typed-d1", "#typed-m1", "#typed-y1"], ["#typed-d2", "#typed-m2", "#typed-y2"]].map(function (row) {
      return row.map(function (sel) { return UI.$(sel); });
    });
  }
  function allInputs() { return typedInputs().reduce(function (a, row) { return a.concat(row); }, []); }

  function renderTyped(q) {
    UI.$("#typed-level").textContent = Store.LEVEL_LABELS[q.level] || "";
    UI.$("#typed-question").textContent = q.text;
    allInputs().forEach(function (inp) { inp.value = ""; inp.disabled = false; });
    UI.$("#typed-submit").disabled = false;
    UI.showScreen("typed");
    allInputs()[0].focus();
  }

  async function submitTyped() {
    if (state.locked || state.busy || !state.typed) return;
    state.busy = true; stopTimer();
    const rows = typedInputs();
    const parts = rows.map(function (f) { return { d: f[0].value.trim(), m: f[1].value.trim(), y: f[2].value.trim() }; });   // server chấm (chỉ nhận chữ số)
    allInputs().forEach(function (inp) { inp.disabled = true; });
    UI.$("#typed-submit").disabled = true;
    const r = await Api.answer(state.playId, 0, null, parts);
    state.busy = false;
    if (!r.ok) {
      if (r.error === "network" || r.error === "server") {
        UI.toast(Api.errText(r.error));
        allInputs().forEach(function (inp) { inp.disabled = false; }); UI.$("#typed-submit").disabled = false;
        return;
      }
      return fail(r.error);
    }
    state.locked = true;
    showDirectResult(r.result);
  }

  // Thắng: thông báo phần thưởng. Thua: ảnh do host tải lên (server gửi kèm) hoặc chữ
  function showDirectResult(res) {
    resetResultUI();
    UI.$("#quiz-summary").hidden = true;
    UI.$("#quiz-continue").hidden = true;
    UI.$("#quiz-back").hidden = false;
    const verdict = UI.$("#quiz-verdict"), img = UI.$("#quiz-lose-img");
    if (res.passed) {
      verdict.textContent = I18n.t("quiz.win", { price: res.prizeLabel || "" });
      verdict.className = "feedback good win-text";
      Sfx.omg();
      UI.reveal(I18n.t("quiz.bigWin"));
    } else {
      Sfx.catLaugh();
      const src = Store.safeImage(res.loseImage);
      if (src) { img.src = src; img.hidden = false; verdict.textContent = ""; }
      else { verdict.textContent = I18n.t("quiz.loseText"); }
      verdict.className = "feedback bad";
    }
    UI.showScreen("quiz"); showPanel("result");
  }

  function resetResultUI() {
    UI.$("#quiz-summary").hidden = false;
    UI.$("#quiz-continue").hidden = false;
    UI.$("#quiz-back").hidden = true;
    UI.$("#quiz-lose-img").hidden = true;
    UI.$("#quiz-lose-img").removeAttribute("src");
  }

  function proceed() {                              // nút "Quay thưởng" ở màn kết quả
    if (!state.result || !state.onDone) return;
    const res = state.result; state.result = null;  // xử lý 1 lần, bấm đúp không mở vòng quay hai lần
    state.onDone(res);
  }

  /* ---------- Đồng hồ: thời gian còn lại do SERVER tính, trình duyệt chỉ đếm ngược để hiển thị ---------- */
  function updateHud() { UI.$("#quiz-score").textContent = state.score; }
  function renderTime() {
    const text = state.timed ? Math.max(0, state.timeLeft) + "s" : "∞", low = state.timed && state.timeLeft <= 5;
    if (state.typed) { UI.$("#typed-time").textContent = text; UI.$("#typed-timer").classList.toggle("low", low); }
    else { UI.$("#quiz-time").textContent = text; UI.$(".timer").classList.toggle("low", low); }
  }
  function startTimer() {
    stopTimer(); renderTime();
    if (!state.timed) return;
    if (state.timeLeft <= 0) { timeUp(); return; }
    state.timerId = setInterval(function () {
      state.timeLeft--; renderTime();
      if (state.timeLeft <= 0) timeUp();
    }, 1000);
  }
  function timeUp() {
    stopTimer();
    if (state.typed) submitTyped(); else if (state.essay) submitEssay(true); else choose(null);   // hết giờ: gửi "không chọn" (impossible: chấm phần đã nhập – server coi quá giờ là 0)
  }

  function reset() { stopTimer(); showPanel(null); }

  window.Quiz = {
    run: run, next: next, proceed: proceed, submitTyped: submitTyped, reset: reset,
    get rules() { return currentRules(); }
  };
})();
