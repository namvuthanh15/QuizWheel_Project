// store.js – lưu trữ & kiểm tra dữ liệu (câu hỏi, cài đặt) bằng LocalStorage.
// Tên "Store" (không đặt "Storage" vì trùng với đối tượng có sẵn của trình duyệt).
// Quy tắc: dữ liệu đọc từ LocalStorage hoặc file nhập vào đều KHÔNG đáng tin, luôn qua hàm "clean" trước khi dùng.
(function () {
  // Câu hỏi & vòng quay lưu RIÊNG cho từng mức. Mức "easy" dùng lại khóa cũ nên dữ liệu đã soạn không bị mất.
  const KEY_Q = "quizwheel.v1.questions";
  const KEY_S = "quizwheel.v1.settings";
  const KEY_W = "quizwheel.v1.wheel";
  const KEY_A = "quizwheel.v1.audio";               // âm lượng Sound / Music (0-100), lưu riêng để nhập/xuất file câu hỏi không ghi đè
  const KEY_H = "quizwheel.v1.hostmode";           // đánh dấu trình duyệt này là của host (mở web với ?host=1)
  const KEY_I = "quizwheel.v1.loseimage";          // ảnh hiện khi trả lời sai ở mức Impossible
  const QUESTION_LEVELS = ["easy", "hard", "impossible"];
  const TYPED_LEVELS = ["impossible"];             // mức nhập đáp án bằng bàn phím (không dùng A/B/C/D)
  const WHEEL_LEVELS = ["free", "easy", "hard"];       // impossible không có vòng quay: thắng thì nhận thẳng 100K           // mức có vòng quay
  // Nhãn mức theo ngôn ngữ hiện tại (getter -> luôn đọc đúng ngôn ngữ đang chọn); LEVEL_PRICES là phần giá, không cần dịch
  const LEVEL_PRICES = { free: "1K", easy: "2 - 10K", hard: "20 - 50K", impossible: "100K" };
  const LEVEL_LABELS = {};
  Object.keys(LEVEL_PRICES).forEach(function (l) { Object.defineProperty(LEVEL_LABELS, l, { enumerable: true, get: function () { return I18n.t("level.label." + l); } }); });
  const LEVEL_NAMES = { free: "Free", easy: "Easy", hard: "Hard", impossible: "Impossible" };
  function keyFor(base, level) { return level === "easy" ? base : base + "." + level; }
  const WHEEL_MAX = 36;                              // tổng số ô tối đa trên vòng quay
  const PALETTE = ["#ff5a3c", "#ffb81f", "#2fb36b", "#2f8fe8", "#a855f7", "#ff8a1f", "#ec4899", "#14b8a6"];
  const LIMITS = { question: 200, answer: 60, explain: 200, maxQuestions: 200 };
  const SHUFFLE_LEVELS = ["easy", "hard"];       // mức trắc nghiệm có thể bật/tắt đảo vị trí đáp án
  const DEFAULT_SETTINGS = { timePerQuestion: 20, shuffleAnswers: { easy: true, hard: true } };

  function uid() { return "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Chỉ chấp nhận ảnh dạng data URL do chính ứng dụng tạo ra
  function isImage(v) {
    return typeof v === "string" && v.length < 1500000 && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(v);
  }

  function cleanQuestion(raw) {
    if (!raw || typeof raw !== "object") return null;
    const text = typeof raw.text === "string" ? raw.text.trim().slice(0, LIMITS.question) : "";
    if (!text || !Array.isArray(raw.answers) || raw.answers.length !== 4) return null;
    const answers = [];
    for (let i = 0; i < 4; i++) {
      const a = raw.answers[i];
      if (!a || typeof a !== "object") return null;
      const t = typeof a.text === "string" ? a.text.trim().slice(0, LIMITS.answer) : "";
      const image = isImage(a.image) ? a.image : null;
      if (!t && !image) return null;                  // mỗi đáp án cần chữ hoặc ảnh
      answers.push({ text: t, image: image });
    }
    const correct = Number.isInteger(raw.correct) && raw.correct >= 0 && raw.correct < 4 ? raw.correct : -1;
    if (correct < 0) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : uid(),
      text: text, answers: answers, correct: correct,
      explain: typeof raw.explain === "string" ? raw.explain.trim().slice(0, LIMITS.explain) : ""
    };
  }

  function isTyped(level) { return TYPED_LEVELS.indexOf(level) >= 0; }

  // Câu hỏi nhập ngày (mức Impossible): { id, text, parts: [ {d, m, y}, {d, m, y} ] } – đáp án của 2 ý là 2 ngày/tháng/năm
  function cleanDate(p) {
    if (!p || typeof p !== "object") return null;
    const d = Number(p.d), m = Number(p.m), y = Number(p.y);
    if (![d, m, y].every(Number.isInteger) || y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(2000, m - 1, d); dt.setFullYear(y);          // loại ngày không tồn tại (31/2...)
    if (dt.getDate() !== d || dt.getMonth() !== m - 1) return null;
    return { d: d, m: m, y: y };
  }
  function cleanTyped(raw) {
    if (!raw || typeof raw !== "object") return null;
    const text = typeof raw.text === "string" ? raw.text.trim().slice(0, LIMITS.question) : "";
    if (!text || !Array.isArray(raw.parts) || raw.parts.length !== 2) return null;
    const p1 = cleanDate(raw.parts[0]), p2 = cleanDate(raw.parts[1]);
    if (!p1 || !p2) return null;
    return { id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 40) : uid(), text: text, parts: [p1, p2] };
  }

  function cleanList(arr, level) {
    if (!Array.isArray(arr)) return [];
    const clean = isTyped(level) ? cleanTyped : cleanQuestion;
    const out = [];
    for (let i = 0; i < arr.length && out.length < LIMITS.maxQuestions; i++) {
      const q = clean(arr[i]);
      if (q) out.push(q);
    }
    return out;
  }

  function clamp(n, lo, hi, fallback) {
    n = Math.round(Number(n));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  }

  function cleanSettings(raw) {
    raw = raw && typeof raw === "object" ? raw : {};
    const sh = raw.shuffleAnswers && typeof raw.shuffleAnswers === "object" ? raw.shuffleAnswers : {};
    const shuffleAnswers = {};
    SHUFFLE_LEVELS.forEach(function (l) { shuffleAnswers[l] = sh[l] === undefined ? DEFAULT_SETTINGS.shuffleAnswers[l] : sh[l] === true; });   // chưa cấu hình -> mặc định bật
    return {
      timePerQuestion: clamp(raw.timePerQuestion, 0, 300, DEFAULT_SETTINGS.timePerQuestion),    // 0 = không giới hạn
      shuffleAnswers: shuffleAnswers                                                            // đảo vị trí đáp án theo từng mức
    };
  }

  // Bộ câu hỏi mẫu (từ data/questions.js) đổi sang định dạng mới
  function seedOf() { return window.QUIZWHEEL_SEED && typeof window.QUIZWHEEL_SEED === "object" ? window.QUIZWHEEL_SEED : null; }

  function defaultQuestions(level) {
    const seed = seedOf();                            // ưu tiên dữ liệu đăng kèm web (data/seed.js)
    if (seed && seed.questions && Array.isArray(seed.questions[level])) {
      const fromSeed = cleanList(seed.questions[level], level);
      if (fromSeed.length) return fromSeed;
    }
    if (isTyped(level)) {
      return cleanList([{ id: "default-typed-1", text: "Ý 1: Ngày Quốc khánh Việt Nam. Ý 2: Ngày thống nhất đất nước (30/4).",
        parts: [{ d: 2, m: 9, y: 1945 }, { d: 30, m: 4, y: 1975 }] }], level);
    }
    const src = Array.isArray(window.QUIZ_DATA) ? window.QUIZ_DATA : [];
    return cleanList(src.map(function (q) {
      return { id: "default-" + q.id, text: q.text, correct: q.correct, explain: q.explain,
               answers: (q.answers || []).map(function (t) { return { text: t, image: null }; }) };
    }), level);
  }

  // ----- Vòng quay: danh sách { id, label, count (số ô), color } -----
  function cleanWheel(raw) {
    if (!Array.isArray(raw)) return [];
    const out = []; let total = 0;
    for (let i = 0; i < raw.length && total < WHEEL_MAX; i++) {
      const r = raw[i];
      if (!r || typeof r !== "object") continue;
      const label = typeof r.label === "string" ? r.label.trim().slice(0, 30) : "";
      let count = Math.round(Number(r.count));
      if (!label || !Number.isFinite(count) || count < 1) continue;
      count = Math.min(count, WHEEL_MAX - total);      // không vượt tổng 36 ô
      out.push({ id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : uid(), label: label, count: count,
                 color: typeof r.color === "string" && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : PALETTE[out.length % PALETTE.length] });
      total += count;
    }
    return out;
  }
  const DEFAULT_WHEELS = {
    free: [{ label: "1K", count: 6 }, { label: "Chúc may mắn", count: 2 }],
    easy: [{ label: "2K", count: 4 }, { label: "5K", count: 3 }, { label: "10K", count: 1 }, { label: "Chúc may mắn", count: 2 }],
    hard: [{ label: "20K", count: 3 }, { label: "50K", count: 1 }, { label: "Chúc may mắn", count: 4 }]
  };
  function defaultWheel(level) {
    const seed = seedOf();
    if (seed && seed.wheels && Array.isArray(seed.wheels[level])) {
      const fromSeed = cleanWheel(seed.wheels[level]);
      if (fromSeed.length) return fromSeed;
    }
    return cleanWheel(DEFAULT_WHEELS[level] || []);
  }

  function read(key) {
    try { const s = localStorage.getItem(key); return s === null ? null : JSON.parse(s); }
    catch (e) { return null; }                         // JSON hỏng hoặc LocalStorage bị chặn
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }                        // thường là đầy bộ nhớ (~5MB)
  }

  function qOk(level) { return QUESTION_LEVELS.indexOf(level) >= 0; }
  function wOk(level) { return WHEEL_LEVELS.indexOf(level) >= 0; }

  window.Store = {
    LIMITS: LIMITS, WHEEL_MAX: WHEEL_MAX, PALETTE: PALETTE,
    QUESTION_LEVELS: QUESTION_LEVELS, SHUFFLE_LEVELS: SHUFFLE_LEVELS, TYPED_LEVELS: TYPED_LEVELS, isTyped: isTyped, WHEEL_LEVELS: WHEEL_LEVELS, LEVEL_LABELS: LEVEL_LABELS, LEVEL_PRICES: LEVEL_PRICES, LEVEL_NAMES: LEVEL_NAMES,
    uid: uid,
    // Chế độ host: luôn bật khi mở bằng file:// hoặc localhost; trên web công khai chỉ bật ở trình duyệt đã mở link có ?host=1
    isHostMode() {
      const h = location.hostname;
      if (location.protocol === "file:" || h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
      return read(KEY_H) === true;
    },
    setHostMode(on) { if (on) write(KEY_H, true); else { try { localStorage.removeItem(KEY_H); } catch (e) {} } },
    // null = chưa từng lưu -> dùng bộ mẫu; mảng rỗng = host đã xóa hết (giữ nguyên rỗng)
    loadQuestions(level) {
      if (!qOk(level)) return [];
      const raw = read(keyFor(KEY_Q, level));
      return raw === null ? defaultQuestions(level) : cleanList(raw, level);
    },
    saveQuestions(level, list) { return qOk(level) && write(keyFor(KEY_Q, level), cleanList(list, level)); },
    resetQuestions(level) { try { localStorage.removeItem(keyFor(KEY_Q, level)); } catch (e) {} return this.loadQuestions(level); },
    loadWheel(level) {
      if (!wOk(level)) return [];
      const raw = read(keyFor(KEY_W, level));
      return raw === null ? defaultWheel(level) : cleanWheel(raw);
    },
    saveWheel(level, items) { return wOk(level) && write(keyFor(KEY_W, level), cleanWheel(items)); },
    resetWheel(level) { try { localStorage.removeItem(keyFor(KEY_W, level)); } catch (e) {} return this.loadWheel(level); },
    loadLoseImage() {
      const v = read(KEY_I);
      if (v === null) { const seed = seedOf(); return seed && isImage(seed.loseImage) ? seed.loseImage : null; }   // chưa chỉnh riêng -> dùng ảnh đăng kèm web
      return isImage(v) ? v : null;                                                                              // "" = host chủ động bỏ ảnh
    },
    saveLoseImage(img) {
      if (img === null) return write(KEY_I, "");   // ghi rỗng = "không dùng ảnh" (khác với chưa cấu hình)
      return isImage(img) && write(KEY_I, img);
    },
    loadAudio() {
      const r = read(KEY_A) || {};
      return { sound: clamp(r.sound, 0, 100, 70), music: clamp(r.music, 0, 100, 70) };
    },
    saveAudio(a) { const c = { sound: clamp(a.sound, 0, 100, 70), music: clamp(a.music, 0, 100, 70) }; write(KEY_A, c); return c; },
    loadSettings() { const raw = read(KEY_S); const seed = seedOf(); return cleanSettings(raw === null && seed ? seed.settings : raw); },
    saveSettings(s) { const c = cleanSettings(s); write(KEY_S, c); return c; },
    exportJSON() {
      const self = this, questions = {}, wheels = {};
      QUESTION_LEVELS.forEach(function (l) { questions[l] = self.loadQuestions(l); });
      WHEEL_LEVELS.forEach(function (l) { wheels[l] = self.loadWheel(l); });
      return JSON.stringify({ app: "quizwheel", version: 2, settings: this.loadSettings(), questions: questions, wheels: wheels, loseImage: this.loadLoseImage() });
    },
    // Trả về { questions: {mức: [...]}, wheels: {mức: [...]}, settings|null, skipped } hoặc ném lỗi tiếng Việt.
    // Đọc được cả file cũ (version 1: questions là mảng, wheel là mảng -> coi như mức easy).
    parseImport(text) {
      let data;
      try { data = JSON.parse(text); } catch (e) { throw new Error(I18n.t("store.badJson")); }
      const obj = data && typeof data === "object" && !Array.isArray(data) ? data : null;
      const rawByLevel = {};
      if (Array.isArray(data)) rawByLevel.easy = data;
      else if (obj && Array.isArray(obj.questions)) rawByLevel.easy = obj.questions;
      else if (obj && obj.questions && typeof obj.questions === "object") {
        QUESTION_LEVELS.forEach(function (l) { if (Array.isArray(obj.questions[l])) rawByLevel[l] = obj.questions[l]; });
      }
      const levels = Object.keys(rawByLevel);
      if (levels.length === 0) throw new Error(I18n.t("store.noList"));
      const questions = {}; let rawTotal = 0, okTotal = 0;
      levels.forEach(function (l) {
        questions[l] = cleanList(rawByLevel[l], l);
        rawTotal += rawByLevel[l].length; okTotal += questions[l].length;
      });
      if (rawTotal > 0 && okTotal === 0) throw new Error(I18n.t("store.noValid"));
      const wheels = {};
      if (obj && Array.isArray(obj.wheel)) wheels.easy = cleanWheel(obj.wheel);                       // file cũ
      if (obj && obj.wheels && typeof obj.wheels === "object") {
        WHEEL_LEVELS.forEach(function (l) { if (Array.isArray(obj.wheels[l])) wheels[l] = cleanWheel(obj.wheels[l]); });
      }
      const loseImage = obj && "loseImage" in obj ? (isImage(obj.loseImage) ? obj.loseImage : null) : undefined;   // undefined = file không nhắc tới
      return { questions: questions, wheels: wheels, loseImage: loseImage, settings: obj && obj.settings ? cleanSettings(obj.settings) : null,
               skipped: rawTotal - okTotal, total: okTotal };
    }
  };
})();
