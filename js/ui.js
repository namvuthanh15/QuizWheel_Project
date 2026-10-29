// ui.js – tiện ích giao diện dùng chung (giống một file header chứa hàm tiện ích trong C++).
// Mỗi file JS bọc trong IIFE và chỉ "xuất" ra một đối tượng duy nhất trên window,
// tương tự một namespace trong C++, để hạn chế biến toàn cục.
(function () {
  const UI = {
    $(selector) { return document.querySelector(selector); },

    // Chuyển màn hình: ẩn tất cả .screen rồi hiện màn hình được chọn.
    showScreen(name) {
      document.querySelectorAll(".screen").forEach(function (s) {
        s.hidden = (s.id !== "screen-" + name);
      });
      document.querySelectorAll(".nav-link").forEach(function (b) {
        b.classList.toggle("active", b.dataset.nav === name);
      });
      UI.hideReveal();
      window.scrollTo(0, 0);
    },

    // Chữ lớn giữa màn hình, nền tối dần + tia sáng mờ. Tự tắt sau ~4 giây hoặc khi bấm vào.
    reveal(text) {
      const box = document.getElementById("reveal");
      document.getElementById("reveal-text").textContent = text;
      box.hidden = false;
      box.classList.remove("show"); void box.offsetWidth; box.classList.add("show");    // chạy lại hiệu ứng
      clearTimeout(UI._revealId);
      UI._revealId = setTimeout(UI.hideReveal, 4000);
    },
    hideReveal() {
      clearTimeout(UI._revealId);
      const box = document.getElementById("reveal");
      if (box) { box.hidden = true; box.classList.remove("show"); }
    },

    // Thông báo nhỏ tự tắt sau ~2.4 giây
    toast(message) {
      const t = document.getElementById("toast");
      t.textContent = message; t.hidden = false;
      clearTimeout(UI._toastId);
      UI._toastId = setTimeout(function () { t.hidden = true; }, 2400);
    },

    // Tạo phần tử an toàn: dùng textContent, KHÔNG dùng innerHTML với dữ liệu người dùng.
    el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
  };
  window.UI = UI;
})();
