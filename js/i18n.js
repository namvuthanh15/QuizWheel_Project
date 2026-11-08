// i18n.js – đa ngôn ngữ (Tiếng Việt / English). Nạp ĐẦU TIÊN, mọi file khác dùng I18n.t("khóa", {tham_số}).
// HTML tĩnh dùng thuộc tính: data-i18n (nội dung chữ), data-i18n-ph (placeholder), data-i18n-aria (aria-label), data-i18n-alt (alt).
// Tham số cho khóa trong HTML: data-i18n-l="A" -> {l: "A"}.
// Thêm ngôn ngữ mới: thêm 1 mục vào LANGS (tên hiển thị) và 1 bảng chữ cùng tên trong DICT.
(function () {
  const KEY = "quizwheel.v1.lang";
  const LANGS = [{ code: "vi", name: "Tiếng Việt" }, { code: "en", name: "English" }];

  const DICT = {
    vi: {
      "app.title": "QuizWheel – Quiz & Vòng quay may mắn",
      "nav.home": "Trang chủ", "nav.quiz": "Quiz",
      "common.back": "Quay lại","common.cancel": "Hủy",

      "footer": "QuizWheel – bản demo. Quiz và Wheel sẽ được hoàn thiện ở các milestone sau.",

      "home.title": "Liệu bạn có biết gì về Nem?",
      "levels.title": "Chọn Mức Lì Xì",
      "levels.aria": "Mức {level}: {price}",
      "level.label": "Lì xì {price}",
      "wheel.name.free": "Free", "wheel.name.easy": "Easy · 2 câu", "wheel.name.easy4": "Easy · 4 câu", "wheel.name.easy6": "Easy · 6 câu", "wheel.name.hard": "Hard · 4 câu", "wheel.name.hard6": "Hard · 6 câu",
      "count.title": "Chọn số câu hỏi", "count.sub": "Liều ăn nhiều", "count.unit": "câu hỏi", "count.aria": "{n} câu hỏi", "count.locked": "Chưa đủ câu hỏi",

      "settings.soundToggle": "Bật/tắt âm thanh", "settings.musicToggle": "Bật/tắt nhạc nền",
      "settings.soundVol": "Âm lượng Sound", "settings.musicVol": "Âm lượng Music",
      "settings.language": "Ngôn ngữ", "settings.languageList": "Danh sách ngôn ngữ",















































      "host.typed.ariaDay": "Ý {n}: ngày", "host.typed.ariaMonth": "Ý {n}: tháng", "host.typed.ariaYear": "Ý {n}: năm",
























      "quiz.q": "Câu", "quiz.score": "Điểm", "quiz.next": "Câu tiếp theo", "quiz.seeResult": "Xem kết quả",
      "quiz.result": "Kết quả", "quiz.spin": "Quay thưởng", "quiz.spinLevel": "Quay thưởng {level}", "quiz.again": "Chơi tiếp",
      "wheel.bagsResult": "Bạn quay được {n} bao lì xì!", "wheel.noBags": "Lần này không có bao lì xì nào. Chúc bạn may mắn lần sau!", "wheel.pickBag": "Rút lì xì",
      "bags.title": "Mở lì xì", "bags.hint": "Bạn có {n} bao lì xì. Chạm vào từng bao để mở, hoặc bấm Mở tất cả!", "bags.hint1": "Bạn có 1 bao lì xì. Chạm vào để mở!", "bags.openAll": "Mở tất cả", "bags.unit": "lì xì", "bags.result": "Chúc mừng! Bạn nhận được {x}", "bags.go": "Tiếp tục",
      "history.bagPending": "Chưa rút lì xì", "err.no_bags": "Ván này không có bao lì xì.",
      "lixi.title": "Rút lì xì nhận lượt chơi", "lixi.hint": "Chọn một bao lì xì. Mỗi bao có từ 2 đến 10 lượt chơi, bạn chỉ được rút MỘT lần!",
      "lixi.aria": "Bao lì xì số {n}", "lixi.unit": "lượt chơi", "lixi.result": "Chúc mừng! Bạn nhận được {n} lượt chơi.", "lixi.already": "Bạn đã rút lì xì rồi ({n} lượt).", "lixi.go": "Bắt đầu chơi",
      "quiz.leave": "← Quay lại", "quiz.leaveWarn": "Nếu thoát bây giờ, bạn sẽ MẤT lượt đã dùng và toàn bộ tiến trình của màn này (không được hoàn lượt, không được quay thưởng). Bạn có chắc muốn thoát?", "quiz.leaveOk": "Thoát và mất lượt",
      "quiz.essayLabel": "Câu trả lời của bạn", "quiz.essayPh": "Gõ câu trả lời rồi bấm Trả lời", "quiz.essaySubmit": "Trả lời",
      "quiz.ansAria": "Đáp án {l}",
      "quiz.right": "Chính xác! +{pts} điểm", "quiz.wrong": "Sai rồi! Câu này không được điểm.", "quiz.timeUp": "Hết giờ! Câu này không được điểm.",
      "quiz.unit": "câu",
      "quiz.summary": "Bạn trả lời đúng {solved}/{total} {unit} – {score}/{pass} điểm.",
      "quiz.prizeWin": "Chúc mừng! Bạn trả lời đúng cả {total} câu và nhận Lì xì {price}!", "quiz.prizeReveal": "Lì xì {price}",
      "quiz.pass": "Chúc mừng! Bạn đạt {pass} điểm và được quay vòng quay {level}!",
      "quiz.fail": "Rất tiếc, chưa đủ {pass} điểm. Bạn sẽ được quay vòng quay {level}.",
      "quiz.win": "Chúc mừng, bạn đã thắng {price}!", "quiz.bigWin": "CHÚC MỪNG THẮNG LỚN", "quiz.loseText": "Rất tiếc, bạn chưa trả lời đúng cả 2 ý.",
      "typed.title": "Nhập câu trả lời", "typed.submit": "Gửi đáp án",
      "wheel.aria": "Vòng quay", "wheel.spin": "Quay", "wheel.values": "Các giá trị trên vòng quay",
      "wheel.result": "Kết quả: {x}", "wheel.cells": "ô",
      "wheel.noteOk": "Tổng {total} ô. Tỉ lệ trúng = số ô của giá trị chia tổng số ô.",
      "wheel.noteFew": "Cần ít nhất {min} ô để quay. Hãy bấm “Chỉnh vòng quay”.",
      "main.later": "Mức này sẽ được làm ở bước sau.",
      "nav.history": "Lịch sử",
      "auth.title": "Đăng nhập", "auth.name": "Tên", "auth.pin": "Mã PIN", "auth.submit": "Vào chơi", "auth.logout": "Đăng xuất",
      "auth.hint": "Chưa có tên và PIN? Hãy hỏi host.",
      "user.turns": "Còn {n} lượt", "user.free": "Free: {n}",
      "confirm.ok": "Đồng ý",
      "confirm.quiz": "Chơi mức {level} ({n} câu) sẽ tốn {cost} lượt. Bạn đang có {turns} lượt, sau khi chơi còn {after}. Bắt đầu nhé?",
      "confirm.quizFree": "Chơi mức {level} ({n} câu) không tốn lượt. Bắt đầu nhé?",
      "confirm.free": "Dùng 1 lần quay Free? (bạn còn {left} lần). Quay xong sẽ không quay lại được.",
      "err.invalid": "Sai tên hoặc mã PIN.", "err.locked": "Nhập sai quá nhiều lần. Hãy thử lại sau ít phút.", "err.disabled": "Tài khoản này đang bị khóa. Hãy hỏi host.",
      "err.network": "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.", "err.server": "Máy chủ đang gặp lỗi. Thử lại sau nhé.",
      "err.config": "Chưa cấu hình Supabase. Hãy điền SUPABASE_URL và SUPABASE_KEY trong js/config.js.",
      "err.auth": "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
      "err.no_turns": "Bạn không đủ lượt để chơi mức này.", "err.free_used": "Bạn đã dùng hết lần quay Free.",
      "err.pool": "Kho câu hỏi của mức này chưa đủ câu. Hãy báo host.", "err.active": "Bạn còn một ván đang chơi dở.", "err.pending_spin": "Bạn còn một lần quay thưởng chưa quay.",
      "err.bad_count": "Số câu không hợp lệ.", "err.bad_level": "Mức không hợp lệ.", "err.stale": "Câu hỏi đã đổi, đang tải lại…",
      "err.no_play": "Không tìm thấy ván chơi.", "err.bad_slot": "Bao lì xì không hợp lệ.", "err.not_active": "Ván này đã kết thúc.", "err.no_wheel": "Ván này không có vòng quay.", "err.wheel_unavailable": "Vòng quay này chưa được thiết lập. Hãy báo host.",
      "err.generic": "Có lỗi xảy ra. Thử lại nhé.",
      "main.resume": "Tiếp tục ván đang dở của bạn.", "main.poolLow": "Mức này cần ít nhất {count} câu hỏi trong kho (hiện có {have}). Hãy báo host.",
      "history.title": "Lịch sử chơi", "history.loading": "Đang tải…", "history.empty": "Bạn chưa chơi ván nào.",
      "history.sum": "Đã trúng {won} · Host đã trả {paid} · Còn chờ nhận {owed}",
      "history.pendingSpin": "Chưa quay", "history.active": "Đang chơi", "history.abandoned": "Đã bỏ giữa chừng",

      "store.badJson": "File không phải JSON hợp lệ.", "store.noList": "File không có danh sách câu hỏi.", "store.noValid": "Không có câu hỏi nào hợp lệ trong file."
    },
    en: {
      "app.title": "QuizWheel – Quiz & Lucky Wheel",
      "nav.home": "Home", "nav.quiz": "Quiz",
      "common.back": "Back","common.cancel": "Cancel",

      "footer": "QuizWheel – demo build. Quiz and Wheel will be completed in later milestones.",

      "home.title": "How much do you know about Nem?",
      "levels.title": "Choose Lucky Money Tier",
      "levels.aria": "{level} tier: {price}",
      "level.label": "Lucky money {price}",
      "wheel.name.free": "Free", "wheel.name.easy": "Easy · 2 questions", "wheel.name.easy4": "Easy · 4 questions", "wheel.name.easy6": "Easy · 6 questions", "wheel.name.hard": "Hard · 4 questions", "wheel.name.hard6": "Hard · 6 questions",
      "count.title": "Choose number of questions", "count.sub": "High risk, high reward", "count.unit": "questions", "count.aria": "{n} questions", "count.locked": "Not enough questions",

      "settings.soundToggle": "Toggle sound", "settings.musicToggle": "Toggle music",
      "settings.soundVol": "Sound volume", "settings.musicVol": "Music volume",
      "settings.language": "Language", "settings.languageList": "Language list",















































      "host.typed.ariaDay": "Part {n}: day", "host.typed.ariaMonth": "Part {n}: month", "host.typed.ariaYear": "Part {n}: year",
























      "quiz.q": "Question", "quiz.score": "Score", "quiz.next": "Next question", "quiz.seeResult": "See results",
      "quiz.result": "Results", "quiz.spin": "Spin for prize", "quiz.spinLevel": "Spin for prize: {level}", "quiz.again": "Play again",
      "wheel.bagsResult": "You won {n} lucky envelopes!", "wheel.noBags": "No envelopes this time. Better luck next time!", "wheel.pickBag": "Pick an envelope",
      "bags.title": "Open your envelopes", "bags.hint": "You have {n} envelopes. Tap each one to open, or press Open all!", "bags.hint1": "You have 1 envelope. Tap to open it!", "bags.openAll": "Open all", "bags.unit": "lucky money", "bags.result": "Congratulations! You got {x}", "bags.go": "Continue",
      "history.bagPending": "Envelope not opened", "err.no_bags": "This round has no envelopes.",
      "lixi.title": "Open a lucky envelope", "lixi.hint": "Pick one envelope. Each holds 2 to 10 turns, and you can only open ONE!",
      "lixi.aria": "Envelope {n}", "lixi.unit": "turns", "lixi.result": "Congratulations! You got {n} turns.", "lixi.already": "You've already opened your envelope ({n} turns).", "lixi.go": "Start playing",
      "quiz.leave": "← Back", "quiz.leaveWarn": "If you leave now you will LOSE the turn you used and all progress in this round (no refund, no bonus spin). Are you sure you want to leave?", "quiz.leaveOk": "Leave and lose the turn",
      "quiz.essayLabel": "Your answer", "quiz.essayPh": "Type your answer, then press Answer", "quiz.essaySubmit": "Answer",
      "quiz.ansAria": "Answer {l}",
      "quiz.right": "Correct! +{pts} points", "quiz.wrong": "Wrong! No points for this question.", "quiz.timeUp": "Time's up! No points for this question.",
      "quiz.unit": "questions",
      "quiz.summary": "You answered {solved}/{total} {unit} correctly – {score}/{pass} points.",
      "quiz.prizeWin": "Congratulations! You got all {total} questions right and win {price} lucky money!", "quiz.prizeReveal": "Lucky money {price}",
      "quiz.pass": "Congratulations! You reached {pass} points and get to spin the {level} wheel!",
      "quiz.fail": "Too bad, you didn't reach {pass} points. You'll spin the {level} wheel.",
      "quiz.win": "Congratulations, you won {price}!", "quiz.bigWin": "CONGRATULATIONS, BIG WIN!", "quiz.loseText": "Too bad, you didn't get both parts right.",
      "typed.title": "Enter your answer", "typed.submit": "Submit answer",
      "wheel.aria": "Wheel", "wheel.spin": "Spin", "wheel.values": "Wheel values",
      "wheel.result": "Result: {x}", "wheel.cells": "slots",
      "wheel.noteOk": "{total} slots in total. Chance to win = the value's slots divided by the total slots.",
      "wheel.noteFew": "At least {min} slots are needed to spin. Click “Edit wheel”.",
      "main.later": "This tier will be built in a later step.",
      "nav.history": "History",
      "auth.title": "Log in", "auth.name": "Name", "auth.pin": "PIN", "auth.submit": "Play", "auth.logout": "Log out",
      "auth.hint": "No name and PIN yet? Ask the host.",
      "user.turns": "{n} turns left", "user.free": "Free: {n}",
      "confirm.ok": "OK",
      "confirm.quiz": "Playing {level} ({n} questions) costs {cost} turn(s). You have {turns}, {after} left afterwards. Start?",
      "confirm.quizFree": "Playing {level} ({n} questions) costs no turns. Start?",
      "confirm.free": "Use 1 Free spin? ({left} left). You can't redo it after spinning.",
      "err.invalid": "Wrong name or PIN.", "err.locked": "Too many wrong attempts. Try again in a few minutes.", "err.disabled": "This account is disabled. Ask the host.",
      "err.network": "Can't reach the server. Check your connection and try again.", "err.server": "The server hit an error. Try again later.",
      "err.config": "Supabase isn't configured. Fill in SUPABASE_URL and SUPABASE_KEY in js/config.js.",
      "err.auth": "Your session expired. Please log in again.",
      "err.no_turns": "You don't have enough turns for this tier.", "err.free_used": "You've used all your Free spins.",
      "err.pool": "This tier doesn't have enough questions yet. Tell the host.", "err.active": "You still have a game in progress.", "err.pending_spin": "You still have a prize spin waiting.",
      "err.bad_count": "Invalid number of questions.", "err.bad_level": "Invalid tier.", "err.stale": "The question changed, reloading…",
      "err.no_play": "Game not found.", "err.bad_slot": "Invalid envelope.", "err.not_active": "This game has already ended.", "err.no_wheel": "This game has no wheel.", "err.wheel_unavailable": "This wheel isn't set up yet. Tell the host.",
      "err.generic": "Something went wrong. Try again.",
      "main.resume": "Resuming your unfinished game.", "main.poolLow": "This tier needs at least {count} questions in the pool ({have} now). Tell the host.",
      "history.title": "Play history", "history.loading": "Loading…", "history.empty": "You haven't played yet.",
      "history.sum": "Won {won} · Paid by host {paid} · Still owed {owed}",
      "history.pendingSpin": "Not spun yet", "history.active": "In progress", "history.abandoned": "Left early",

      "store.badJson": "The file is not valid JSON.", "store.noList": "The file has no question list.", "store.noValid": "No valid questions in the file."
    }
  };

  let lang = "vi";
  const listeners = [];
  try { const s = localStorage.getItem(KEY); if (DICT[s]) lang = s; } catch (e) {}

  function t(key, params) {
    let s = (DICT[lang] && DICT[lang][key]) || DICT.vi[key] || key;
    if (params) s = s.replace(/\{(\w+)\}/g, function (m, k) { return k in params ? params[k] : m; });
    return s;
  }

  function argsOf(el) {
    const p = {};
    Object.keys(el.dataset).forEach(function (k) { if (/^i18n[A-Z]/.test(k) && k !== "i18nPh" && k !== "i18nAria" && k !== "i18nAlt") p[k.charAt(4).toLowerCase() + k.slice(5)] = el.dataset[k]; });
    return p;
  }

  // Dịch toàn bộ phần tử có data-i18n* trong root
  function apply(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.dataset.i18n, argsOf(el)); });
    root.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.placeholder = t(el.dataset.i18nPh, argsOf(el)); });
    root.querySelectorAll("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.dataset.i18nAria, argsOf(el))); });
    root.querySelectorAll("[data-i18n-alt]").forEach(function (el) { el.alt = t(el.dataset.i18nAlt, argsOf(el)); });
    document.documentElement.lang = lang;
    document.title = t("app.title");
  }

  function set(code) {
    if (!DICT[code]) return;
    lang = code;
    try { localStorage.setItem(KEY, code); } catch (e) {}
    apply(document);
    listeners.forEach(function (fn) { fn(code); });
  }

  window.I18n = { t: t, apply: apply, set: set, lang: function () { return lang; }, langs: LANGS, onChange: function (fn) { listeners.push(fn); } };
})();
