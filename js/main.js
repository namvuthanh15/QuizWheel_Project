// main.js – điểm khởi động (giống hàm main() trong C++): gắn sự kiện và điều phối màn hình.
(function () {
  // opts chỉ dùng cho màn hình vòng quay: { level, once }
  function go(name, opts) {
    if (name !== "quiz") Quiz.reset();             // rời Quiz thì dừng timer
    if (name === "host" && !Store.isHostMode()) return;   // người chơi không vào được màn hình soạn (nơi có sẵn đáp án)
    if (name === "host") Host.open();
    if (name === "settings") Lang.close();
    if (name === "count") buildCount(opts && opts.level);   // dựng các ô chọn số câu của mức vừa chọn
    if (name === "wheel") Wheel.open(opts);        // dựng lại vòng quay theo cấu hình mới nhất của host
    else Wheel.stop();                             // rời vòng quay khi đang quay: hủy lần quay đó
    UI.showScreen(name);
    Sfx.screen(name);                              // nhạc nền chỉ ở trang chủ, setting, chọn mức
  }

  // Quay thưởng thật: chỉ được quay 1 lần
  function playWheel(level) { go("wheel", { level: level, once: true }); }

  // Luồng chơi theo mức:
  //  free -> vòng quay Free
  //  easy / hard -> màn "Chọn số câu hỏi" (Easy: 2/4/6/8, Hard: 4/6/8) -> quiz -> vòng quay (hoặc lì xì thẳng khi đúng hết 8 câu) tùy số câu đúng
  //  impossible -> 1 câu 2 ý nhập ngày/tháng/năm: đúng cả 2 -> thắng 100K, ngược lại -> hiện ảnh của host (không có vòng quay)
  //  (bảng thưởng chi tiết nằm ở Quiz.rules trong quiz.js)
  function startQuiz(level, count) {
    go("quiz");
    Quiz.start(level, count, function (res) { if (res.wheel) playWheel(res.wheel); });
  }

  function playLevel(level) {
    if (level === "free") { playWheel("free"); return; }
    const rule = Quiz.rules[level];
    if (!rule) { UI.toast(I18n.t("main.later")); return; }
    if (rule.counts.length > 1) go("count", { level: level });   // có nhiều lựa chọn số câu -> cho người chơi chọn
    else startQuiz(level, rule.counts[0]);
  }

  // Màn "Chọn số câu hỏi": mỗi số câu là 1 ô lớn; ô nào kho câu hỏi chưa đủ thì bị khóa
  let countLevel = "";
  function buildCount(level) {
    const rule = Quiz.rules[level];
    if (!rule) return;
    countLevel = level;
    const have = Store.loadQuestions(level).length;
    UI.$("#count-level").textContent = Store.LEVEL_LABELS[level] || "";
    const grid = UI.$("#count-grid");
    grid.textContent = "";
    rule.counts.forEach(function (n) {
      const btn = UI.el("button", "count-btn"); btn.type = "button";
      btn.disabled = have < n;
      btn.setAttribute("aria-label", I18n.t("count.aria", { n: n }));
      btn.append(UI.el("span", "game-text count-num", String(n)), UI.el("span", "count-unit", I18n.t("count.unit")));
      if (have < n) btn.appendChild(UI.el("span", "count-locked", I18n.t("count.locked")));
      btn.addEventListener("click", function () { startQuiz(level, n); });
      grid.appendChild(btn);
    });
    UI.$("#count-note").textContent = have < rule.counts[0] ? I18n.t("quiz.needMore", { count: rule.counts[0], have: have }) : "";
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Chế độ host: mở web với ?host=1 một lần để bật trên trình duyệt này, ?host=0 để tắt
    const hp = new URLSearchParams(location.search).get("host");
    if (hp === "1") Store.setHostMode(true); else if (hp === "0") { Store.setHostMode(false); Publish.clearToken(); }   // tắt chế độ host thì xóa luôn mã GitHub
    const hostOk = Store.isHostMode();
    document.querySelectorAll("[data-host-only]").forEach(function (el) { el.hidden = !hostOk; });

    // Event delegation: mọi phần tử có data-nav đều chuyển màn hình.
    document.addEventListener("click", function (e) {
      const target = e.target.closest("[data-nav]");
      if (!target) return;
      e.preventDefault();
      go(target.dataset.nav);
    });

    // Hiệu ứng nhấn cho nút ảnh: lún khi chạm, nhả lại khi trượt ra ngoài hitbox hoặc thả tay.
    document.querySelectorAll(".img-btn, .level-btn").forEach(function (btn) {
      function inside(e) {
        const r = btn.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      }
      btn.addEventListener("pointerdown", function () { btn.classList.add("pressed"); });
      btn.addEventListener("pointermove", function (e) { btn.classList.toggle("pressed", e.buttons > 0 && inside(e)); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
        btn.addEventListener(ev, function () { btn.classList.remove("pressed"); });
      });
    });

    UI.$("#btn-start").addEventListener("click", function () { go("levels"); });
    UI.$("#btn-setting").addEventListener("click", function () { go("settings"); });

    // Chọn mức lì xì -> chạy luồng chơi của mức đó
    document.querySelectorAll(".level-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { playLevel(btn.dataset.level); });
    });

    UI.$("#quiz-continue").addEventListener("click", Quiz.proceed);
    I18n.onChange(function () { if (countLevel && !UI.$("#screen-count").hidden) buildCount(countLevel); });
    // Ô ngày/tháng/năm: chỉ nhận chữ số; đủ số ký tự hoặc gõ "/" thì nhảy sang ô kế tiếp
    const blanks = Array.from(document.querySelectorAll(".blank"));
    blanks.forEach(function (inp, i) {
      inp.addEventListener("input", function () {
        inp.value = inp.value.replace(/\D/g, "");
        if (inp.value.length >= inp.maxLength && blanks[i + 1]) blanks[i + 1].focus();
      });
      inp.addEventListener("keydown", function (e) {
        if ((e.key === "/" || e.key === "." || e.key === "-") && blanks[i + 1]) { e.preventDefault(); blanks[i + 1].focus(); }
        else if (e.key === "Backspace" && inp.value === "" && blanks[i - 1]) { e.preventDefault(); blanks[i - 1].focus(); }
      });
    });
    UI.$("#typed-form").addEventListener("submit", function (e) { e.preventDefault(); Quiz.submitTyped(); });   // Enter hoặc nút Gửi
    UI.$("#quiz-next").addEventListener("click", Quiz.next);

    // Xem thử vòng quay: chỉ có ở tab Vòng quay của host, xem đúng mức đang chọn (quay không giới hạn)
    UI.$("#w-preview").addEventListener("click", function () { go("wheel", { level: UI.$("#w-level").value, once: false }); });

    UI.$("#wheel-edit").addEventListener("click", function () { go("host"); Host.showTab("wheel", Wheel.level()); });

    UI.$("#reveal").addEventListener("click", UI.hideReveal);
    Lang.init();
    Sfx.init();
    Wheel.init();
    Host.init();
    Publish.init();
    Settings.init();
    go("home");
  });
})();
