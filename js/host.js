// host.js – màn hình soạn câu hỏi cho host: thêm/sửa/xóa câu hỏi, ảnh meme cho từng đáp án,
// cài đặt chung, xuất/nhập file. Dữ liệu lưu qua Store.
(function () {
  const LETTERS = "ABCD";
  const IMG_MAX_SIDE = 480, LOSE_IMG_MAX_SIDE = 900, IMG_QUALITY = 0.72;     // thu nhỏ ảnh để không đầy LocalStorage
  const form = { editingId: null, images: [null, null, null, null] };
  let QLEVEL = "easy";                           // kho câu hỏi đang soạn
  let wLevel = "free";                           // mức vòng quay đang chỉnh
  let questions = [];
  let wheelItems = [];

  // Đọc file ảnh -> thu nhỏ bằng canvas -> data URL JPEG
  async function fileToDataUrl(file, maxSide) {
    if (!file || !/^image\//.test(file.type)) throw new Error(I18n.t("host.err.notImage"));
    if (file.size > 10 * 1024 * 1024) throw new Error(I18n.t("host.err.imgBig"));
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise(function (resolve, reject) {
        const im = new Image();
        im.onload = function () { resolve(im); };
        im.onerror = function () { reject(new Error(I18n.t("host.err.imgRead"))); };
        im.src = url;
      });
      const scale = Math.min(1, (maxSide || IMG_MAX_SIDE) / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);   // ảnh PNG trong suốt -> nền trắng
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", IMG_QUALITY);
    } finally { URL.revokeObjectURL(url); }
  }

  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
  function formError(msg) { UI.$("#f-error").textContent = msg || ""; }
  function listError(msg) { UI.$("#host-msg").textContent = msg || ""; }

  /* ---------- Danh sách câu hỏi ---------- */
  function renderList() {
    UI.$("#host-count").textContent = questions.length;
    const rule = Quiz.rules[QLEVEL];
    UI.$("#q-level").value = QLEVEL;
    syncLoseCard();
    UI.$("#q-rule").textContent = rule.direct
      ? I18n.t("host.rule.typed", { count: rule.count, parts: rule.parts, price: Store.LEVEL_PRICES[QLEVEL] })
      : I18n.t("host.rule.mcq", { count: rule.count, points: rule.points, tiers: rule.tiers.map(function (t) {
          const wheel = Store.LEVEL_NAMES[t.wheel];
          return I18n.t(t.min >= rule.pass ? "host.rule.full" : t.min > 0 ? "host.rule.from" : "host.rule.zero", { min: t.min, wheel: wheel });
        }).join("; ") });
    UI.$("#host-qwarn").textContent = questions.length < rule.count
      ? I18n.t("host.warn.need", { count: rule.count, level: Store.LEVEL_NAMES[QLEVEL] })
      : "";
    const ol = UI.$("#host-list");
    ol.textContent = "";
    if (questions.length === 0) {
      ol.appendChild(UI.el("li", "host-empty", I18n.t("host.empty")));
      return;
    }
    questions.forEach(function (q, idx) {
      const li = UI.el("li", "host-item");
      li.appendChild(UI.el("span", "host-num", String(idx + 1)));
      li.appendChild(UI.el("span", "host-q", q.text));
      const edit = UI.el("button", "link-btn", I18n.t("common.edit")); edit.type = "button";
      edit.setAttribute("aria-label", I18n.t("host.editAria", { n: idx + 1 }));
      edit.addEventListener("click", function () { openForm(q); });
      const del = UI.el("button", "link-btn danger", I18n.t("common.delete")); del.type = "button";
      del.setAttribute("aria-label", I18n.t("host.delAria", { n: idx + 1 }));
      del.addEventListener("click", function () { removeQuestion(q.id); });
      li.append(edit, del);
      ol.appendChild(li);
    });
  }

  function persist() {
    if (!Store.saveQuestions(QLEVEL, questions)) {
      listError(I18n.t("host.err.fullList"));
      return false;
    }
    listError("");
    return true;
  }

  function removeQuestion(id) {
    const q = questions.find(function (x) { return x.id === id; });
    if (!q || !window.confirm(I18n.t("host.confirm.del") + "\n\n" + q.text)) return;
    const backup = questions;
    questions = questions.filter(function (x) { return x.id !== id; });
    if (!persist()) questions = backup;
    if (form.editingId === id) closeForm();
    renderList();
  }

  /* ---------- Form thêm/sửa ---------- */
  function renderPreview(i) {
    const block = $$(".ans-edit")[i];
    const prev = block.querySelector(".ans-preview"), clear = block.querySelector(".f-ans-clear");
    if (form.images[i]) { prev.src = form.images[i]; prev.hidden = false; clear.hidden = false; }
    else { prev.removeAttribute("src"); prev.hidden = true; clear.hidden = true; }
  }

  function openForm(q) {
    if (Store.isTyped(QLEVEL)) return openTyped(q);
    form.editingId = q ? q.id : null;
    form.images = q ? q.answers.map(function (a) { return a.image; }) : [null, null, null, null];
    UI.$("#f-title").textContent = I18n.t(q ? "host.form.edit" : "host.form.add");
    UI.$("#f-question").value = q ? q.text : "";
    UI.$("#f-explain").value = q ? q.explain : "";
    $$(".ans-edit").forEach(function (block, i) {
      block.querySelector(".f-ans-text").value = q ? q.answers[i].text : "";
      block.querySelector(".f-ans-file").value = "";
      block.querySelector(".f-correct").checked = q ? q.correct === i : false;
      renderPreview(i);
    });
    formError("");
    UI.$("#host-form").hidden = false;
    UI.$("#host-hint").hidden = true;
    UI.$("#f-question").focus();
  }

  function closeForm() {
    form.editingId = null;
    UI.$("#host-form").hidden = true;
    UI.$("#host-form-typed").hidden = true;
    UI.$("#host-hint").hidden = false;
  }

  /* ---------- Form câu hỏi nhập ngày (mức Impossible: 1 câu, 2 ý) ---------- */
  function tError(msg) { UI.$("#ft-error").textContent = msg || ""; }
  function openTyped(q) {
    form.editingId = q ? q.id : null;
    UI.$("#ft-title").textContent = I18n.t(q ? "host.typed.edit" : "host.typed.add");
    UI.$("#ft-question").value = q ? q.text : "";
    [1, 2].forEach(function (n) {
      const p = q ? q.parts[n - 1] : null;
      UI.$("#ft-d" + n).value = p ? p.d : ""; UI.$("#ft-m" + n).value = p ? p.m : ""; UI.$("#ft-y" + n).value = p ? p.y : "";
    });
    tError("");
    UI.$("#host-form").hidden = true; UI.$("#host-form-typed").hidden = false; UI.$("#host-hint").hidden = true;
    UI.$("#ft-question").focus();
  }
  function saveTyped() {
    const text = UI.$("#ft-question").value.trim();
    if (!text) return tError(I18n.t("host.err.noText"));
    const parts = [];
    for (let n = 1; n <= 2; n++) {
      const p = { d: Number(UI.$("#ft-d" + n).value), m: Number(UI.$("#ft-m" + n).value), y: Number(UI.$("#ft-y" + n).value) };
      const dt = new Date(2000, p.m - 1, p.d); dt.setFullYear(p.y);
      const valid = [p.d, p.m, p.y].every(Number.isInteger) && p.y >= 1 && p.y <= 9999 && p.m >= 1 && p.m <= 12 &&
                    dt.getDate() === p.d && dt.getMonth() === p.m - 1;
      if (!valid) return tError(I18n.t("host.err.badDate", { n: n }));
      parts.push(p);
    }
    if (!form.editingId && questions.length >= Store.LIMITS.maxQuestions) return tError(I18n.t("host.err.max", { max: Store.LIMITS.maxQuestions }));
    const q = { id: form.editingId || Store.uid(), text: text, parts: parts };
    const backup = questions;
    questions = form.editingId ? questions.map(function (x) { return x.id === q.id ? q : x; }) : questions.concat([q]);
    if (!persist()) { questions = backup; return tError(I18n.t("host.err.full")); }
    closeForm(); renderList();
    UI.toast(I18n.t("host.toast.qSaved"));
  }

  /* ---------- Ảnh hiện khi trả lời sai (mức Impossible) ---------- */
  function renderLoseImage() {
    const src = Store.loadLoseImage(), prev = UI.$("#lose-preview");
    if (src) { prev.src = src; prev.hidden = false; } else { prev.removeAttribute("src"); prev.hidden = true; }
    UI.$("#lose-clear").hidden = !src;
  }
  function syncLoseCard() {
    UI.$("#lose-card").hidden = !Store.isTyped(QLEVEL);
    if (Store.isTyped(QLEVEL)) renderLoseImage();
  }

  function saveForm() {
    const text = UI.$("#f-question").value.trim();
    if (!text) return formError(I18n.t("host.err.noText"));
    const answers = [];
    let correct = -1;
    const blocks = $$(".ans-edit");
    for (let i = 0; i < 4; i++) {
      const t = blocks[i].querySelector(".f-ans-text").value.trim();
      if (!t && !form.images[i]) return formError(I18n.t("host.err.needAns", { l: LETTERS[i] }));
      answers.push({ text: t, image: form.images[i] });
      if (blocks[i].querySelector(".f-correct").checked) correct = i;
    }
    if (correct < 0) return formError(I18n.t("host.err.needCorrect"));
    if (!form.editingId && questions.length >= Store.LIMITS.maxQuestions) return formError(I18n.t("host.err.max", { max: Store.LIMITS.maxQuestions }));

    const q = { id: form.editingId || Store.uid(), text: text, answers: answers, correct: correct, explain: UI.$("#f-explain").value.trim() };
    const backup = questions;
    questions = form.editingId
      ? questions.map(function (x) { return x.id === q.id ? q : x; })
      : questions.concat([q]);
    if (!persist()) { questions = backup; return formError(I18n.t("host.err.fullImgs")); }
    closeForm(); renderList();
    UI.toast(I18n.t("host.toast.qSaved"));
  }

  /* ---------- Cài đặt chung ---------- */
  function renderSettings() {
    const s = Store.loadSettings();
    UI.$("#set-time").value = s.timePerQuestion;
    Store.SHUFFLE_LEVELS.forEach(function (l) { UI.$("#set-shuffle-" + l).checked = !!s.shuffleAnswers[l]; });
  }
  function saveSettings() {
    const shuffleAnswers = {};
    Store.SHUFFLE_LEVELS.forEach(function (l) { shuffleAnswers[l] = UI.$("#set-shuffle-" + l).checked; });
    const c = Store.saveSettings({ timePerQuestion: UI.$("#set-time").value, shuffleAnswers: shuffleAnswers });
    UI.$("#set-time").value = c.timePerQuestion;   // hiện giá trị đã chuẩn hóa
    UI.toast(I18n.t("host.toast.settingsSaved"));
  }

  /* ---------- Xuất / nhập / khôi phục ---------- */
  function exportFile() {
    const blob = new Blob([Store.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "quizwheel-cauhoi.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error(I18n.t("host.err.fileBig"));
      const result = Store.parseImport(await file.text());
      const incoming = result.questions[QLEVEL];
      const msg = I18n.t("host.confirm.import", { total: result.total, skipped: result.skipped ? I18n.t("host.import.skipped", { n: result.skipped }) : "",
                                                   level: Store.LEVEL_NAMES[QLEVEL], have: questions.length });
      if (!window.confirm(msg)) return;
      let saved = true;
      Object.keys(result.questions).forEach(function (l) { saved = Store.saveQuestions(l, result.questions[l]) && saved; });
      if (!saved) { listError(I18n.t("host.err.full")); questions = Store.loadQuestions(QLEVEL); renderList(); return; }
      if (incoming) questions = incoming;
      if (result.settings) { Store.saveSettings(result.settings); renderSettings(); }
      Object.keys(result.wheels).forEach(function (l) { Store.saveWheel(l, result.wheels[l]); });
      if (result.loseImage !== undefined) Store.saveLoseImage(result.loseImage);
      syncLoseCard();
      wheelItems = Store.loadWheel(wLevel); renderWheel();
      closeForm(); renderList(); listError("");
      UI.toast(I18n.t("host.toast.imported", { n: result.total }));
    } catch (e) { listError(e.message || I18n.t("host.err.importFail")); }
    finally { UI.$("#host-import").value = ""; }
  }

  function resetDefaults() {
    if (!window.confirm(I18n.t("host.confirm.reset"))) return;
    questions = Store.resetQuestions(QLEVEL);
    closeForm(); renderList(); listError("");
  }

  /* ---------- Vòng quay ---------- */
  function wTotal() { return wheelItems.reduce(function (s, it) { return s + it.count; }, 0); }
  function wError(m) { UI.$("#w-error").textContent = m || ""; }
  function wSave() {
    if (!Store.saveWheel(wLevel, wheelItems)) { wError(I18n.t("host.err.full")); return false; }
    return true;
  }
  function nextColor() { return Store.PALETTE[wheelItems.length % Store.PALETTE.length]; }

  function renderWheel() {
    UI.$("#w-level").value = wLevel;
    UI.$("#w-total").textContent = wTotal();
    UI.$("#w-warn").textContent = wTotal() < 2 ? I18n.t("host.w.warn") : "";
    const ul = UI.$("#w-list");
    ul.textContent = "";
    if (wheelItems.length === 0) { ul.appendChild(UI.el("li", "host-empty", I18n.t("host.w.empty"))); return; }
    wheelItems.forEach(function (it) {
      const li = UI.el("li", "w-item");
      const color = UI.el("input"); color.type = "color"; color.value = it.color; color.setAttribute("aria-label", I18n.t("host.wheel.colorOf", { x: it.label }));
      const label = UI.el("input", "w-label"); label.type = "text"; label.maxLength = 30; label.value = it.label; label.setAttribute("aria-label", I18n.t("host.wheel.value"));
      const count = UI.el("input", "w-count"); count.type = "number"; count.min = 1; count.max = Store.WHEEL_MAX; count.value = it.count; count.setAttribute("aria-label", I18n.t("host.wheel.cellsOf", { x: it.label }));
      const del = UI.el("button", "link-btn danger", I18n.t("common.delete")); del.type = "button"; del.setAttribute("aria-label", I18n.t("host.wheel.delAria", { x: it.label }));

      color.addEventListener("change", function () { it.color = color.value; wSave(); });
      label.addEventListener("change", function () {
        const v = label.value.trim();
        if (!v) { label.value = it.label; return wError(I18n.t("host.w.errEmpty")); }
        it.label = v.slice(0, 30); wError(""); wSave();
      });
      count.addEventListener("change", function () {
        const n = Math.round(Number(count.value));
        const others = wTotal() - it.count;
        if (!Number.isFinite(n) || n < 1) { count.value = it.count; return wError(I18n.t("host.w.errCount")); }
        if (others + n > Store.WHEEL_MAX) { count.value = it.count; return wError(I18n.t("host.w.errMaxItem", { max: Store.WHEEL_MAX, left: Store.WHEEL_MAX - others })); }
        it.count = n; wError(""); if (wSave()) renderWheel();
      });
      del.addEventListener("click", function () {
        wheelItems = wheelItems.filter(function (x) { return x.id !== it.id; });
        wSave(); wError(""); renderWheel();
      });
      li.append(color, label, count, UI.el("span", "w-unit", I18n.t("host.wheel.cells")), del);
      ul.appendChild(li);
    });
  }

  function addWheelItem(e) {
    e.preventDefault();
    const label = UI.$("#w-label").value.trim();
    const n = Math.round(Number(UI.$("#w-count").value));
    if (!label) return wError(I18n.t("host.w.errNoValue"));
    if (!Number.isFinite(n) || n < 1) return wError(I18n.t("host.w.errCount"));
    if (wTotal() + n > Store.WHEEL_MAX) return wError(I18n.t("host.w.errMaxAdd", { max: Store.WHEEL_MAX, left: Store.WHEEL_MAX - wTotal() }));
    wheelItems.push({ id: Store.uid(), label: label, count: n, color: UI.$("#w-color").value });
    if (!wSave()) { wheelItems.pop(); return; }
    wError(""); UI.$("#w-label").value = ""; UI.$("#w-count").value = 1;
    UI.$("#w-color").value = nextColor();
    renderWheel(); UI.$("#w-label").focus();
  }

  function resetWheel() {
    if (!window.confirm(I18n.t("host.confirm.resetWheel"))) return;
    wheelItems = Store.resetWheel(wLevel); wError(""); renderWheel(); UI.$("#w-color").value = nextColor();
  }

  function setWheelLevel(level) {
    if (Store.WHEEL_LEVELS.indexOf(level) < 0) return;
    wLevel = level; wheelItems = Store.loadWheel(wLevel);
    wError(""); renderWheel(); UI.$("#w-color").value = nextColor();
  }

  function showTab(name, level) {
    if (level) setWheelLevel(level);
    ["questions", "wheel", "publish"].forEach(function (t) {
      UI.$("#panel-" + t).hidden = (t !== name);
      UI.$("#tab-" + t).setAttribute("aria-selected", String(t === name));
    });
    if (name === "publish" && window.Publish) Publish.show();    // nạp lại ô nhập + tóm tắt dữ liệu mới nhất
  }

  /* ---------- Khởi tạo ---------- */
  // Dựng lại danh sách mức (tên mức + giá) trong 2 ô chọn
  function fillLevels(sel, levels, current) {
    sel.textContent = "";
    levels.forEach(function (l) { const o = UI.el("option", "", Store.LEVEL_NAMES[l] + " (" + Store.LEVEL_PRICES[l] + ")"); o.value = l; sel.appendChild(o); });
    sel.value = current;
  }
  function buildLevelOptions() {
    fillLevels(UI.$("#q-level"), Store.QUESTION_LEVELS, QLEVEL);
    fillLevels(UI.$("#w-level"), Store.WHEEL_LEVELS, wLevel);
  }
  function init() {
    UI.$("#host-add").addEventListener("click", function () { openForm(null); });
    UI.$("#f-cancel").addEventListener("click", closeForm);
    UI.$("#f-save").addEventListener("click", saveForm);
    UI.$("#ft-cancel").addEventListener("click", closeForm);
    UI.$("#ft-save").addEventListener("click", saveTyped);
    UI.$("#lose-file").addEventListener("change", async function (e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const url = await fileToDataUrl(file, LOSE_IMG_MAX_SIDE);
        if (!Store.saveLoseImage(url)) throw new Error(I18n.t("host.err.fullImage"));
        UI.$("#lose-error").textContent = ""; renderLoseImage(); UI.toast(I18n.t("host.toast.imgSaved"));
      } catch (err) { UI.$("#lose-error").textContent = err.message; }
      e.target.value = "";
    });
    UI.$("#lose-clear").addEventListener("click", function () { Store.saveLoseImage(null); renderLoseImage(); });
    UI.$("#host-export").addEventListener("click", exportFile);
    UI.$("#host-import").addEventListener("change", function (e) { importFile(e.target.files[0]); });
    UI.$("#host-reset").addEventListener("click", resetDefaults);
    UI.$("#w-form").addEventListener("submit", addWheelItem);
    UI.$("#w-reset").addEventListener("click", resetWheel);
    const qsel = UI.$("#q-level");
    qsel.addEventListener("change", function () { QLEVEL = qsel.value; questions = Store.loadQuestions(QLEVEL); closeForm(); listError(""); renderList(); });
    const sel = UI.$("#w-level");
    buildLevelOptions();
    I18n.onChange(function () { buildLevelOptions(); open(); });
    sel.addEventListener("change", function () { setWheelLevel(sel.value); });
    UI.$("#tab-questions").addEventListener("click", function () { showTab("questions"); });
    UI.$("#tab-wheel").addEventListener("click", function () { showTab("wheel"); });
    UI.$("#tab-publish").addEventListener("click", function () { showTab("publish"); });
    ["#set-time", "#set-shuffle-easy", "#set-shuffle-hard"].forEach(function (sel) { UI.$(sel).addEventListener("change", saveSettings); });

    $$(".ans-edit").forEach(function (block, i) {
      block.querySelector(".f-ans-file").addEventListener("change", async function (e) {
        const file = e.target.files[0];
        if (!file) return;
        try { form.images[i] = await fileToDataUrl(file); renderPreview(i); formError(""); }
        catch (err) { e.target.value = ""; formError(err.message); }
      });
      block.querySelector(".f-ans-clear").addEventListener("click", function () {
        form.images[i] = null; block.querySelector(".f-ans-file").value = ""; renderPreview(i);
      });
    });
  }

  function open() {
    questions = Store.loadQuestions(QLEVEL); wheelItems = Store.loadWheel(wLevel);
    renderSettings(); renderList(); renderWheel(); closeForm(); listError(""); wError("");
    UI.$("#w-color").value = nextColor();
    showTab("questions");
  }

  window.Host = { init: init, open: open, showTab: showTab };
})();
