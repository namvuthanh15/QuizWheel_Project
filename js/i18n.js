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
      "common.back": "Quay lại", "common.edit": "Sửa", "common.delete": "Xóa", "common.cancel": "Hủy",
      "common.saveQuestion": "Lưu câu hỏi", "common.removeImage": "Xóa ảnh",
      "footer": "QuizWheel – bản demo. Quiz và Wheel sẽ được hoàn thiện ở các milestone sau.",

      "home.title": "Liệu bạn có biết gì về Nem?",
      "levels.title": "Chọn Mức Lì Xì",
      "levels.aria.free": "Mức Free: 1K", "levels.aria.easy": "Mức Easy: 2 - 10K", "levels.aria.hard": "Mức Hard: 20 - 50K", "levels.aria.impossible": "Mức Impossible: 100K",
      "level.label.free": "Lì xì 1K", "level.label.easy": "Lì xì 2 - 10K", "level.label.hard": "Lì xì 20 - 50K", "level.label.impossible": "Lì xì 100K",

      "settings.editQuestions": "Soạn câu hỏi",
      "settings.soundToggle": "Bật/tắt âm thanh", "settings.musicToggle": "Bật/tắt nhạc nền",
      "settings.soundVol": "Âm lượng Sound", "settings.musicVol": "Âm lượng Music",
      "settings.language": "Ngôn ngữ", "settings.languageList": "Danh sách ngôn ngữ",

      "host.tabsAria": "Phần cài đặt", "host.tabQuestions": "Câu hỏi", "host.tabWheel": "Vòng quay",
      "host.general": "Cài đặt chung",
      "host.time": "Thời gian mỗi câu (giây, 0 = không giới hạn)",
      "host.shuffle": "Đảo vị trí đáp án",
      "host.shuffle.easy": "Mức Easy", "host.shuffle.hard": "Mức Hard",
      "host.shuffle.note": "Bật: mỗi lần chơi, 4 đáp án (kèm ảnh) được xáo trộn vị trí A/B/C/D, đáp án đúng không còn cố định. Tắt: giữ đúng thứ tự bạn đã soạn.",
      "host.noteOnce": "Mỗi câu chỉ chọn 1 lần. Đáp án đúng không bị lộ khi người chơi chọn sai.",
      "host.pool": "Kho câu hỏi của mức",
      "host.questions": "Câu hỏi", "host.add": "Thêm câu hỏi",
      "host.export": "Xuất file", "host.import": "Nhập file", "host.sample": "Bộ mẫu",
      "host.noteSaved": "Câu hỏi được lưu trong trình duyệt của bạn. Muốn chuyển sang máy khác, hãy “Xuất file” rồi “Nhập file” ở máy đó.",
      "host.loseTitle": "Ảnh khi trả lời sai (mức Impossible)",
      "host.loseNote": "Nếu người chơi không đúng đủ 2 ý, màn hình sẽ hiện bức ảnh này. Nếu thắng thì hiện “Chúc mừng, bạn đã thắng 100K”.",
      "host.loseAria": "Chọn ảnh khi trả lời sai",
      "host.hint": "Bấm “Thêm câu hỏi” hoặc “Sửa” để soạn nội dung ở đây.",
      "host.typed.add": "Thêm câu hỏi nhập ngày", "host.typed.edit": "Sửa câu hỏi nhập ngày",
      "host.typed.q": "Câu hỏi (gồm 2 ý)",
      "host.typed.qph": "vd: Ý 1: Ngày Quốc khánh? Ý 2: Ngày thống nhất đất nước?",
      "host.typed.legend": "Đáp án ý {n} (ngày / tháng / năm)",
      "host.typed.day": "Ngày", "host.typed.month": "Tháng", "host.typed.year": "Năm",
      "host.typed.ariaDay": "Ý {n}: ngày", "host.typed.ariaMonth": "Ý {n}: tháng", "host.typed.ariaYear": "Ý {n}: năm",
      "host.typed.note": "Người chơi nhập ngày/tháng/năm vào 2 hàng ô trống. Ngày và tháng so khớp theo số (05 = 5); năm gõ đủ 4 số hoặc 2 số cuối đều được.",
      "host.form.add": "Thêm câu hỏi", "host.form.edit": "Sửa câu hỏi",
      "host.form.q": "Câu hỏi", "host.form.qph": "Nhập nội dung câu hỏi",
      "host.form.ans": "Đáp án {l}", "host.form.correct": "Đây là đáp án đúng",
      "host.form.ansph": "Chữ trong ô {l}", "host.form.ansAria": "Nội dung đáp án {l}", "host.form.imgAria": "Ảnh meme cho đáp án {l}",
      "host.form.explain": "Giải thích (tùy chọn, chỉ hiện sau khi trả lời đúng)",
      "host.wheel.title": "Giá trị trên vòng quay", "host.wheel.total": "Tổng", "host.wheel.cells": "ô",
      "host.wheel.level": "Mức lì xì",
      "host.wheel.note": "Mỗi giá trị có “số ô”. Giá trị nhiều ô hơn thì dễ trúng hơn. Tổng số ô tối đa là 36.",
      "host.wheel.labelph": "Giá trị (vd: 10K)", "host.wheel.newValue": "Giá trị mới", "host.wheel.cellsAria": "Số ô", "host.wheel.color": "Màu",
      "host.wheel.addBtn": "Thêm", "host.wheel.reset": "Khôi phục mặc định", "host.wheel.preview": "Xem thử vòng quay",
      "host.wheel.colorOf": "Màu của {x}", "host.wheel.value": "Giá trị", "host.wheel.cellsOf": "Số ô của {x}", "host.wheel.delAria": "Xóa {x}",
      "host.rule.typed": "Mỗi lượt bốc ngẫu nhiên {count} câu gồm {parts} ý, người chơi nhập ngày/tháng/năm bằng bàn phím. Đúng đủ {parts} ý → thắng {price}; không đủ → hiện ảnh bạn tải lên ở bên dưới.",
      "host.rule.mcq": "Mỗi lượt bốc ngẫu nhiên {count} câu, mỗi câu đúng +{points} điểm. {tiers}.",
      "host.rule.full": "Đủ {min}đ → vòng quay {wheel}", "host.rule.from": "từ {min}đ → vòng quay {wheel}", "host.rule.zero": "0đ → vòng quay {wheel}",
      "host.warn.need": "Cần ít nhất {count} câu hỏi để mức {level} chơi được.",
      "host.empty": "Chưa có câu hỏi nào. Bấm “Thêm câu hỏi” để bắt đầu.",
      "host.editAria": "Sửa câu {n}", "host.delAria": "Xóa câu {n}",
      "host.err.full": "Không lưu được: bộ nhớ trình duyệt đã đầy.",
      "host.err.fullList": "Không lưu được: bộ nhớ trình duyệt đã đầy. Hãy xóa bớt câu hỏi/ảnh hoặc dùng “Xuất file” để lưu bản sao.",
      "host.err.fullImgs": "Không lưu được: bộ nhớ trình duyệt đã đầy. Hãy dùng ảnh ít hơn hoặc xóa bớt câu.",
      "host.err.fullImage": "Không lưu được ảnh: bộ nhớ trình duyệt đã đầy hoặc ảnh quá lớn.",
      "host.err.noText": "Hãy nhập nội dung câu hỏi.",
      "host.err.badDate": "Đáp án ý {n} chưa phải một ngày hợp lệ.",
      "host.err.max": "Tối đa {max} câu hỏi.",
      "host.err.needAns": "Đáp án {l} cần có chữ hoặc ảnh.",
      "host.err.needCorrect": "Hãy chọn đáp án đúng.",
      "host.err.notImage": "Hãy chọn một file ảnh.", "host.err.imgBig": "Ảnh quá lớn (tối đa 10MB).", "host.err.imgRead": "Không đọc được ảnh này.",
      "host.err.fileBig": "File quá lớn (tối đa 20MB).", "host.err.importFail": "Không nhập được file.",
      "host.confirm.del": "Xóa câu hỏi này?",
      "host.confirm.import": "Nhập {total} câu hỏi{skipped} sẽ THAY THẾ toàn bộ câu hỏi hiện có của các mức trong file (mức {level} hiện có {have} câu). Tiếp tục?",
      "host.import.skipped": " (bỏ qua {n} câu lỗi)",
      "host.confirm.reset": "Khôi phục bộ câu hỏi mẫu? Toàn bộ câu hỏi bạn đã soạn sẽ bị xóa.",
      "host.confirm.resetWheel": "Khôi phục vòng quay mặc định? Các giá trị bạn đã nhập sẽ bị xóa.",
      "host.toast.qSaved": "Đã lưu câu hỏi", "host.toast.settingsSaved": "Đã lưu cài đặt", "host.toast.imgSaved": "Đã lưu ảnh", "host.toast.imported": "Đã nhập {n} câu hỏi",
      "host.w.empty": "Chưa có giá trị nào.", "host.w.warn": "Cần ít nhất 2 ô để vòng quay hoạt động.",
      "host.w.errEmpty": "Giá trị không được để trống.", "host.w.errCount": "Số ô phải từ 1 trở lên.",
      "host.w.errMaxItem": "Tổng số ô tối đa là {max} (giá trị này tối đa {left} ô).",
      "host.w.errMaxAdd": "Tổng số ô tối đa là {max} (còn thêm được {left} ô).",
      "host.w.errNoValue": "Hãy nhập giá trị.",

      "quiz.emptyTitle": "Chưa có câu hỏi", "quiz.emptyMsg": "Hãy vào Setting để soạn câu hỏi trước khi chơi.",
      "quiz.needMore": "Mức này cần ít nhất {count} câu hỏi (hiện có {have}). Hãy vào Setting để soạn thêm.",
      "quiz.noQuiz": "Mức này chưa có phần quiz.",
      "quiz.q": "Câu", "quiz.score": "Điểm", "quiz.next": "Câu tiếp theo", "quiz.seeResult": "Xem kết quả",
      "quiz.result": "Kết quả", "quiz.spin": "Quay thưởng", "quiz.spinLevel": "Quay thưởng {level}", "quiz.again": "Chơi tiếp",
      "quiz.ansAria": "Đáp án {l}",
      "quiz.right": "Chính xác! +{pts} điểm", "quiz.wrong": "Sai rồi! Câu này không được điểm.", "quiz.timeUp": "Hết giờ! Câu này không được điểm.",
      "quiz.unit": "câu",
      "quiz.summary": "Bạn trả lời đúng {solved}/{total} {unit} – {score}/{pass} điểm.",
      "quiz.pass": "Chúc mừng! Bạn đạt {pass} điểm và được quay vòng quay {level}!",
      "quiz.fail": "Rất tiếc, chưa đủ {pass} điểm. Bạn sẽ được quay vòng quay {level}.",
      "quiz.win": "Chúc mừng, bạn đã thắng {price}!", "quiz.bigWin": "CHÚC MỪNG THẮNG LỚN", "quiz.loseText": "Rất tiếc, bạn chưa trả lời đúng cả 2 ý.",
      "typed.title": "Nhập câu trả lời", "typed.submit": "Gửi đáp án",
      "wheel.aria": "Vòng quay", "wheel.spin": "Quay", "wheel.values": "Các giá trị trên vòng quay", "wheel.edit": "Chỉnh vòng quay",
      "wheel.result": "Kết quả: {x}", "wheel.cells": "ô",
      "wheel.noteOk": "Tổng {total} ô. Tỉ lệ trúng = số ô của giá trị chia tổng số ô.",
      "wheel.noteFew": "Cần ít nhất {min} ô để quay. Hãy bấm “Chỉnh vòng quay”.",
      "main.later": "Mức này sẽ được làm ở bước sau.",

      "store.badJson": "File không phải JSON hợp lệ.", "store.noList": "File không có danh sách câu hỏi.", "store.noValid": "Không có câu hỏi nào hợp lệ trong file."
    },
    en: {
      "app.title": "QuizWheel – Quiz & Lucky Wheel",
      "nav.home": "Home", "nav.quiz": "Quiz",
      "common.back": "Back", "common.edit": "Edit", "common.delete": "Delete", "common.cancel": "Cancel",
      "common.saveQuestion": "Save question", "common.removeImage": "Remove image",
      "footer": "QuizWheel – demo build. Quiz and Wheel will be completed in later milestones.",

      "home.title": "How much do you know about Nem?",
      "levels.title": "Choose Lucky Money Tier",
      "levels.aria.free": "Free tier: 1K", "levels.aria.easy": "Easy tier: 2 - 10K", "levels.aria.hard": "Hard tier: 20 - 50K", "levels.aria.impossible": "Impossible tier: 100K",
      "level.label.free": "Lucky money 1K", "level.label.easy": "Lucky money 2 - 10K", "level.label.hard": "Lucky money 20 - 50K", "level.label.impossible": "Lucky money 100K",

      "settings.editQuestions": "Edit Questions",
      "settings.soundToggle": "Toggle sound", "settings.musicToggle": "Toggle music",
      "settings.soundVol": "Sound volume", "settings.musicVol": "Music volume",
      "settings.language": "Language", "settings.languageList": "Language list",

      "host.tabsAria": "Settings sections", "host.tabQuestions": "Questions", "host.tabWheel": "Wheel",
      "host.general": "General settings",
      "host.time": "Time per question (seconds, 0 = unlimited)",
      "host.shuffle": "Shuffle answer positions",
      "host.shuffle.easy": "Easy tier", "host.shuffle.hard": "Hard tier",
      "host.shuffle.note": "On: each play, the 4 answers (with their images) are shuffled among A/B/C/D, so the correct answer is never in a fixed spot. Off: keeps the order you wrote.",
      "host.noteOnce": "Each question can only be answered once. The correct answer is not revealed when a player answers wrong.",
      "host.pool": "Question pool for tier",
      "host.questions": "Questions", "host.add": "Add question",
      "host.export": "Export file", "host.import": "Import file", "host.sample": "Sample set",
      "host.noteSaved": "Questions are saved in your browser. To move them to another computer, use “Export file”, then “Import file” on that computer.",
      "host.loseTitle": "Image shown on wrong answer (Impossible tier)",
      "host.loseNote": "If the player doesn't get both parts right, this image is shown. If they win, it shows “Congratulations, you won 100K”.",
      "host.loseAria": "Choose image for wrong answer",
      "host.hint": "Click “Add question” or “Edit” to write the content here.",
      "host.typed.add": "Add date question", "host.typed.edit": "Edit date question",
      "host.typed.q": "Question (2 parts)",
      "host.typed.qph": "e.g. Part 1: National Day? Part 2: Reunification Day?",
      "host.typed.legend": "Answer for part {n} (day / month / year)",
      "host.typed.day": "Day", "host.typed.month": "Month", "host.typed.year": "Year",
      "host.typed.ariaDay": "Part {n}: day", "host.typed.ariaMonth": "Part {n}: month", "host.typed.ariaYear": "Part {n}: year",
      "host.typed.note": "Players type day/month/year into 2 rows of blanks. Day and month are compared as numbers (05 = 5); the year can be 4 digits or the last 2 digits.",
      "host.form.add": "Add question", "host.form.edit": "Edit question",
      "host.form.q": "Question", "host.form.qph": "Enter the question text",
      "host.form.ans": "Answer {l}", "host.form.correct": "This is the correct answer",
      "host.form.ansph": "Text in cell {l}", "host.form.ansAria": "Text of answer {l}", "host.form.imgAria": "Meme image for answer {l}",
      "host.form.explain": "Explanation (optional, shown only after a correct answer)",
      "host.wheel.title": "Wheel values", "host.wheel.total": "Total", "host.wheel.cells": "slots",
      "host.wheel.level": "Lucky money tier",
      "host.wheel.note": "Each value has a number of “slots”. More slots means a better chance to win. The maximum total is 36 slots.",
      "host.wheel.labelph": "Value (e.g. 10K)", "host.wheel.newValue": "New value", "host.wheel.cellsAria": "Slots", "host.wheel.color": "Color",
      "host.wheel.addBtn": "Add", "host.wheel.reset": "Restore defaults", "host.wheel.preview": "Preview wheel",
      "host.wheel.colorOf": "Color of {x}", "host.wheel.value": "Value", "host.wheel.cellsOf": "Slots of {x}", "host.wheel.delAria": "Delete {x}",
      "host.rule.typed": "Each round draws {count} random question with {parts} parts; the player types the day/month/year on the keyboard. All {parts} correct → win {price}; otherwise → the image you upload below is shown.",
      "host.rule.mcq": "Each round draws {count} random questions, each correct answer is worth +{points} points. {tiers}.",
      "host.rule.full": "Full {min} pts → {wheel} wheel", "host.rule.from": "from {min} pts → {wheel} wheel", "host.rule.zero": "0 pts → {wheel} wheel",
      "host.warn.need": "At least {count} questions are needed to play the {level} tier.",
      "host.empty": "No questions yet. Click “Add question” to start.",
      "host.editAria": "Edit question {n}", "host.delAria": "Delete question {n}",
      "host.err.full": "Couldn't save: browser storage is full.",
      "host.err.fullList": "Couldn't save: browser storage is full. Delete some questions/images or use “Export file” to keep a backup.",
      "host.err.fullImgs": "Couldn't save: browser storage is full. Use fewer images or delete some questions.",
      "host.err.fullImage": "Couldn't save the image: browser storage is full or the image is too large.",
      "host.err.noText": "Please enter the question text.",
      "host.err.badDate": "The answer for part {n} is not a valid date.",
      "host.err.max": "Maximum {max} questions.",
      "host.err.needAns": "Answer {l} needs text or an image.",
      "host.err.needCorrect": "Please choose the correct answer.",
      "host.err.notImage": "Please choose an image file.", "host.err.imgBig": "Image too large (max 10MB).", "host.err.imgRead": "Couldn't read this image.",
      "host.err.fileBig": "File too large (max 20MB).", "host.err.importFail": "Couldn't import the file.",
      "host.confirm.del": "Delete this question?",
      "host.confirm.import": "Importing {total} questions{skipped} will REPLACE all existing questions for the tiers in the file (the {level} tier currently has {have}). Continue?",
      "host.import.skipped": " ({n} invalid skipped)",
      "host.confirm.reset": "Restore the sample questions? All questions you wrote will be deleted.",
      "host.confirm.resetWheel": "Restore the default wheel? The values you entered will be deleted.",
      "host.toast.qSaved": "Question saved", "host.toast.settingsSaved": "Settings saved", "host.toast.imgSaved": "Image saved", "host.toast.imported": "Imported {n} questions",
      "host.w.empty": "No values yet.", "host.w.warn": "At least 2 slots are needed for the wheel to work.",
      "host.w.errEmpty": "The value can't be empty.", "host.w.errCount": "Slots must be 1 or more.",
      "host.w.errMaxItem": "The maximum total is {max} slots (this value can have at most {left}).",
      "host.w.errMaxAdd": "The maximum total is {max} slots ({left} more can be added).",
      "host.w.errNoValue": "Please enter a value.",

      "quiz.emptyTitle": "No questions yet", "quiz.emptyMsg": "Go to Setting to write questions before playing.",
      "quiz.needMore": "This tier needs at least {count} questions ({have} available). Go to Setting to add more.",
      "quiz.noQuiz": "This tier has no quiz yet.",
      "quiz.q": "Question", "quiz.score": "Score", "quiz.next": "Next question", "quiz.seeResult": "See results",
      "quiz.result": "Results", "quiz.spin": "Spin for prize", "quiz.spinLevel": "Spin for prize: {level}", "quiz.again": "Play again",
      "quiz.ansAria": "Answer {l}",
      "quiz.right": "Correct! +{pts} points", "quiz.wrong": "Wrong! No points for this question.", "quiz.timeUp": "Time's up! No points for this question.",
      "quiz.unit": "questions",
      "quiz.summary": "You answered {solved}/{total} {unit} correctly – {score}/{pass} points.",
      "quiz.pass": "Congratulations! You reached {pass} points and get to spin the {level} wheel!",
      "quiz.fail": "Too bad, you didn't reach {pass} points. You'll spin the {level} wheel.",
      "quiz.win": "Congratulations, you won {price}!", "quiz.bigWin": "CONGRATULATIONS, BIG WIN!", "quiz.loseText": "Too bad, you didn't get both parts right.",
      "typed.title": "Enter your answer", "typed.submit": "Submit answer",
      "wheel.aria": "Wheel", "wheel.spin": "Spin", "wheel.values": "Wheel values", "wheel.edit": "Edit wheel",
      "wheel.result": "Result: {x}", "wheel.cells": "slots",
      "wheel.noteOk": "{total} slots in total. Chance to win = the value's slots divided by the total slots.",
      "wheel.noteFew": "At least {min} slots are needed to spin. Click “Edit wheel”.",
      "main.later": "This tier will be built in a later step.",

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
