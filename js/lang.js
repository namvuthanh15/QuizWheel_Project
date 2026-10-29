// lang.js – mục "Ngôn ngữ" trong màn hình Setting: bấm mũi tên để xổ danh sách, chọn là đổi ngôn ngữ cả trang.
(function () {
  function render() {
    const ul = UI.$("#lang-list");
    ul.textContent = "";
    I18n.langs.forEach(function (l) {
      const li = UI.el("li"); li.setAttribute("role", "presentation");
      const b = UI.el("button", "lang-option" + (l.code === I18n.lang() ? " selected" : ""));
      b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("aria-selected", String(l.code === I18n.lang()));
      b.append(UI.el("span", "lang-name", l.name), UI.el("span", "lang-check", l.code === I18n.lang() ? "✓" : ""));
      b.addEventListener("click", function () { I18n.set(l.code); });
      li.appendChild(b); ul.appendChild(li);
    });
  }
  function toggle(open) {
    const btn = UI.$("#lang-toggle");
    open = open === undefined ? btn.getAttribute("aria-expanded") !== "true" : open;
    btn.setAttribute("aria-expanded", String(open));
    UI.$("#lang-list").hidden = !open;
  }
  window.Lang = {
    init() {
      UI.$("#lang-toggle").addEventListener("click", function () { toggle(); });
      I18n.onChange(render);
      I18n.apply(document);
      render();
    },
    close() { toggle(false); }
  };
})();
