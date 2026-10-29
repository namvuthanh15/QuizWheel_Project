// publish.js – tab "Đăng web" trong màn hình host: ghi data/seed.js thẳng vào repo GitHub bằng REST API.
// Bảo mật: mã truy cập (token) CHỈ nằm trong sessionStorage + ô nhập + header Authorization gửi tới api.github.com.
// Không lưu LocalStorage, không đưa vào Store.exportJSON(), seed.js, URL, console hay thông báo lỗi.
(function () {
  const API = "https://api.github.com";
  const KEY_CFG = "quizwheel.v1.publish";          // LocalStorage: owner/repo/nhánh/đường dẫn (KHÔNG có mã)
  const KEY_TOKEN = "quizwheel.v1.publish.token";   // sessionStorage: đóng tab là mất
  const TIMEOUT_MS = 30000;
  const WARN_BYTES = 1024 * 1024, MAX_BYTES = 5 * 1024 * 1024;
  const DEFAULTS = { owner: "", repo: "", branch: "main", path: "data/seed.js" };

  // Khối comment đầu data/seed.js – giữ nguyên để file đăng ra giống hệt định dạng cũ
  const SEED_HEADER =
    "// seed.js – DỮ LIỆU ĐĂNG KÈM WEB: bộ câu hỏi, vòng quay, ảnh \"thua\" và cài đặt mà MỌI người chơi sẽ thấy.\n" +
    "// Cách cập nhật: ở máy bạn vào Setting > Soạn câu hỏi > \"Xuất file\", mở file .json vừa xuất bằng Visual Studio,\n" +
    "// chọn toàn bộ nội dung (Ctrl+A), rồi dán đè lên phần sau dấu \"=\" bên dưới (giữ nguyên dấu \";\" ở cuối). Sau đó đăng lại web.\n" +
    "// Lưu ý: ai sửa riêng trong trình duyệt của mình thì dữ liệu đó (LocalStorage) được ưu tiên hơn file này.\n";

  let running = false;                              // cờ chống bấm đúp / đăng chồng
  let status = null;                                // trạng thái đang hiện { type, key, params, extra, link } (để dịch lại khi đổi ngôn ngữ)

  function $(id) { return document.getElementById(id); }

  /* ---------- Lưu / đọc cấu hình (không chứa mã) ---------- */
  function guessRepo() {
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
    if (!m) return { owner: "", repo: "" };
    const first = location.pathname.split("/").filter(Boolean)[0] || "";
    // Có thư mục đầu (vd /QuizWheel/) -> đó là tên repo; web gốc <owner>.github.io thì repo trùng tên miền
    const repo = first && !/\.html?$/i.test(first) ? first : location.hostname;      // chỉ coi là file nếu đuôi .html/.htm (tên repo như My.Quiz vẫn đúng)
    return { owner: m[1], repo: repo };
  }
  function loadCfg() {
    let saved = {};
    try { const s = JSON.parse(localStorage.getItem(KEY_CFG)); if (s && typeof s === "object") saved = s; } catch (e) {}
    const g = guessRepo();
    function pick(k, guess) { return typeof saved[k] === "string" && saved[k] ? saved[k] : guess; }
    return { owner: pick("owner", g.owner), repo: pick("repo", g.repo), branch: pick("branch", DEFAULTS.branch), path: pick("path", DEFAULTS.path) };
  }
  function saveCfg(c) {
    try { localStorage.setItem(KEY_CFG, JSON.stringify({ owner: c.owner, repo: c.repo, branch: c.branch, path: c.path })); } catch (e) {}
  }
  function readToken() { try { return sessionStorage.getItem(KEY_TOKEN) || ""; } catch (e) { return ""; } }
  function writeToken(v) { try { if (v) sessionStorage.setItem(KEY_TOKEN, v); else sessionStorage.removeItem(KEY_TOKEN); } catch (e) {} }
  function clearToken() {
    writeToken("");
    const inp = $("pub-token");
    if (inp) { inp.value = ""; inp.type = "password"; }
    syncReveal();
  }

  /* ---------- Kiểm tra đầu vào (trả về khóa i18n của lỗi, hoặc "" nếu hợp lệ) ---------- */
  function checkOwner(v) { return !v ? "pub.err.needOwner" : /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(v) ? "" : "pub.err.badOwner"; }
  function checkRepo(v) { return !v ? "pub.err.needRepo" : (/^[A-Za-z0-9._-]{1,100}$/.test(v) && v !== "." && v !== "..") ? "" : "pub.err.badRepo"; }
  function checkBranch(v) {
    if (!v) return "pub.err.needBranch";
    const ok = /^[A-Za-z0-9._\/-]{1,200}$/.test(v) && v.indexOf("..") < 0 && v.indexOf("//") < 0 &&
               !/^[\/.-]|[\/.]$|\.lock$/.test(v);
    return ok ? "" : "pub.err.badBranch";
  }
  function checkPath(v) {
    if (!v) return "pub.err.needPath";
    if (v.length > 200 || !/^[A-Za-z0-9._\/-]+$/.test(v) || v.charAt(0) === "/" || v.charAt(v.length - 1) === "/" || v.indexOf("//") >= 0) return "pub.err.badPath";
    const segs = v.split("/");
    for (let i = 0; i < segs.length; i++) { if (segs[i] === "." || segs[i] === ".." || segs[i] === ".git" || segs[i] === ".github") return "pub.err.badPath"; }
    return /\.js$/i.test(v) && segs[segs.length - 1].length > 3 ? "" : "pub.err.badPath";   // chỉ cho ghi file .js (tránh ghi đè nhầm index.html...)
  }
  function checkToken(v) { return !v ? "pub.err.needToken" : /^[\x21-\x7E]{8,255}$/.test(v) ? "" : "pub.err.badToken"; }

  /* ---------- Dựng nội dung seed.js ---------- */
  // Giữ đúng 4 khóa; JSON.stringify gọn, không escape tiếng Việt
  function buildSeedText() {
    const all = JSON.parse(Store.exportJSON());
    const seed = { settings: all.settings, questions: all.questions, wheels: all.wheels, loseImage: all.loseImage };
    return { seed: seed, text: SEED_HEADER + "window.QUIZWHEEL_SEED = " + JSON.stringify(seed) + ";\n" };
  }
  function countQuestions(seed) {
    const n = {}; Store.QUESTION_LEVELS.forEach(function (l) { n[l] = Array.isArray(seed.questions[l]) ? seed.questions[l].length : 0; });
    return n;
  }
  function countCells(seed) {
    const n = {};
    Store.WHEEL_LEVELS.forEach(function (l) { n[l] = (seed.wheels[l] || []).reduce(function (s, it) { return s + (it.count || 0); }, 0); });
    return n;
  }

  // UTF-8 -> base64, chia khúc 24576 byte (bội số của 3 nên nối base64 các khúc vẫn đúng) để không tràn stack
  function toBase64(str) {
    const bytes = new TextEncoder().encode(str), CHUNK = 3 * 8192;
    const parts = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const sub = bytes.subarray(i, i + CHUNK);
      let bin = "";
      for (let j = 0; j < sub.length; j += 8192) bin += String.fromCharCode.apply(null, sub.subarray(j, j + 8192));
      parts.push(btoa(bin));
    }
    return { b64: parts.join(""), bytes: bytes.length };
  }

  /* ---------- Hiển thị trạng thái / lỗi (mọi chuỗi từ GitHub chỉ qua textContent) ---------- */
  function renderStatus() {
    const st = $("pub-status"), er = $("pub-error");
    st.textContent = ""; er.textContent = "";
    if (!status) return;
    if (status.type === "error") {
      er.textContent = I18n.t(status.key, status.params) + (status.extra ? " " + status.extra : "");
      return;
    }
    st.appendChild(UI.el("span", status.type === "ok" ? "pub-ok" : "", I18n.t(status.key, status.params)));
    if (status.link) {
      st.appendChild(document.createTextNode(" "));
      const a = UI.el("a", "pub-link", I18n.t("pub.ok.link"));
      a.href = status.link; a.target = "_blank"; a.rel = "noopener noreferrer";
      st.appendChild(a);
    }
    if (status.type === "ok") st.appendChild(UI.el("span", "pub-wait", I18n.t("pub.ok.wait")));
  }
  function setStatus(type, key, params, extra, link) { status = { type: type, key: key, params: params || {}, extra: extra || "", link: link || "" }; renderStatus(); }
  function clearStatus() { status = null; renderStatus(); }

  function renderSummary() {
    const box = $("pub-summary"); box.textContent = "";
    let info;
    try { info = buildSeedText(); } catch (e) { box.appendChild(UI.el("li", "", I18n.t("pub.err.unknown"))); return null; }
    const q = countQuestions(info.seed), w = countCells(info.seed), size = new TextEncoder().encode(info.text).length;
    const N = Store.LEVEL_NAMES;
    box.appendChild(UI.el("li", "", I18n.t("pub.sum.q", { easy: q.easy, hard: q.hard, impossible: q.impossible, e: N.easy, h: N.hard, i: N.impossible })));
    box.appendChild(UI.el("li", "", I18n.t("pub.sum.w", { free: w.free, easy: w.easy, hard: w.hard, f: N.free, e: N.easy, h: N.hard })));
    box.appendChild(UI.el("li", "", I18n.t(info.seed.loseImage ? "pub.sum.loseYes" : "pub.sum.loseNo")));
    box.appendChild(UI.el("li", "", I18n.t("pub.sum.size", { kb: (size / 1024).toFixed(1) })));
    const total = q.easy + q.hard + q.impossible;
    const warn = $("pub-warn");
    warn.textContent = size > MAX_BYTES ? I18n.t("pub.sum.blockBig") : total === 0 ? I18n.t("pub.sum.empty") : size > WARN_BYTES ? I18n.t("pub.sum.warnBig") : "";
    return { text: info.text, size: size, empty: total === 0 };
  }

  function syncReveal() {
    const inp = $("pub-token"), btn = $("pub-reveal");
    if (!inp || !btn) return;
    const shown = inp.type === "text";
    btn.textContent = I18n.t(shown ? "pub.hide" : "pub.show");
    btn.setAttribute("aria-pressed", String(shown));
  }

  function setBusy(on) {
    running = on;
    ["pub-owner", "pub-repo", "pub-branch", "pub-path", "pub-token", "pub-message", "pub-reveal", "pub-clear"].forEach(function (id) { $(id).disabled = on; });
    const b = $("pub-submit");
    b.disabled = on; b.setAttribute("aria-busy", String(on));
    b.textContent = I18n.t(on ? "pub.submitBusy" : "pub.submit");
  }

  /* ---------- Gọi GitHub ---------- */
  function ghError(kind, extra) { const e = new Error(kind); e.kind = kind; e.info = extra || {}; return e; }

  // Một yêu cầu tới api.github.com: timeout 30 giây, không gửi cookie/referrer, không ghi log
  async function request(method, path, token, body) {
    const ctl = new AbortController();
    const timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
    try {
      const res = await fetch(API + path, {
        method: method, signal: ctl.signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        headers: Object.assign({
          "Authorization": "Bearer " + token,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }, body ? { "Content-Type": "application/json" } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      return { status: res.status, ok: res.ok, data: data,
               remaining: res.headers.get("x-ratelimit-remaining"), reset: res.headers.get("x-ratelimit-reset"), retryAfter: res.headers.get("retry-after") };
    } catch (e) {
      if (ctl.signal.aborted) throw ghError("timeout");
      throw ghError(navigator.onLine === false ? "offline" : "network");
    } finally { clearTimeout(timer); }
  }

  function ghMessage(r) { return r && r.data && typeof r.data.message === "string" ? r.data.message.slice(0, 300) : ""; }

  // Đổi phản hồi lỗi thành { key, params, extra } để hiện tiếng Việt
  function describeFailure(r, c) {
    const msg = ghMessage(r), p = { owner: c.owner, repo: c.repo, branch: c.branch, path: c.path, status: r.status };
    if (r.status === 401) return { key: "pub.err.401", params: p };
    if (r.status === 403) {
      const limited = r.remaining === "0" || r.retryAfter !== null || /rate limit|abuse/i.test(msg);
      if (limited) {
        let secs = 0;
        if (r.retryAfter && Number(r.retryAfter) > 0) secs = Number(r.retryAfter);
        else if (r.reset && Number(r.reset) > 0) secs = Math.max(0, Number(r.reset) - Math.floor(Date.now() / 1000));
        const mins = Math.max(1, Math.ceil(secs / 60));
        return secs > 0 ? { key: "pub.err.403rate", params: Object.assign({ min: mins }, p) } : { key: "pub.err.403rateNoTime", params: p };
      }
      return { key: "pub.err.403", params: p };
    }
    if (r.status === 404) return { key: "pub.err.404", params: p };
    if (r.status === 409 || r.status === 422) return { key: "pub.err.conflict", params: p, extra: msg ? "(" + r.status + ": " + msg + ")" : "(" + r.status + ")" };
    if (r.status >= 500) return { key: "pub.err.server", params: p, extra: msg };
    return { key: "pub.err.other", params: Object.assign({ message: msg || "-" }, p) };
  }

  const cPath = function (path) { return path.split("/").map(encodeURIComponent).join("/"); };

  // Lấy sha hiện tại của file. Trả về sha (chuỗi) hoặc null nếu file chưa có (repo + nhánh có thật).
  async function getSha(c, token) {
    const base = "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo);
    const r = await request("GET", base + "/contents/" + cPath(c.path) + "?ref=" + encodeURIComponent(c.branch), token);
    if (r.status === 200) {
      if (Array.isArray(r.data) || !r.data || r.data.type === "dir") throw ghError("isDir");
      if (typeof r.data.sha !== "string" || !/^[0-9a-f]{40,64}$/i.test(r.data.sha)) throw ghError("badResponse");
      return r.data.sha;
    }
    if (r.status === 404) {
      // 404 có thể là: file chưa có (tạo mới) hoặc sai repo/nhánh/quyền -> hỏi thêm về nhánh để phân biệt
      const b = await request("GET", base + "/branches/" + c.branch.split("/").map(encodeURIComponent).join("/"), token);
      if (b.status === 200) return null;
      if (b.status === 404) throw ghError("fail", { r: r });
      throw ghError("fail", { r: b });
    }
    throw ghError("fail", { r: r });
  }

  async function putFile(c, token, b64, message, sha) {
    const body = { message: message, content: b64, branch: c.branch };
    if (sha) body.sha = sha;
    return request("PUT", "/repos/" + encodeURIComponent(c.owner) + "/" + encodeURIComponent(c.repo) + "/contents/" + cPath(c.path), token, body);
  }

  // Link commit chỉ nhận https://github.com/... (tránh link lạ)
  function safeCommitUrl(data) {
    try {
      const u = new URL(data && data.commit && data.commit.html_url);
      return u.protocol === "https:" && u.hostname === "github.com" ? u.href : "";
    } catch (e) { return ""; }
  }

  function defaultMessage() {
    const d = new Date(), z = function (n) { return String(n).padStart(2, "0"); };
    return "Cập nhật dữ liệu QuizWheel (" + d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes()) + ")";
  }

  /* ---------- Đăng ---------- */
  async function publish() {
    if (running) return;                                   // chống bấm đúp / đăng chồng
    if (!Store.isHostMode()) { setStatus("error", "pub.err.notHost"); return; }   // người chơi không được đăng: từ chối, không gọi mạng
    setBusy(true);
    try {
      clearStatus();
      const c = { owner: $("pub-owner").value.trim(), repo: $("pub-repo").value.trim(), branch: $("pub-branch").value.trim() || DEFAULTS.branch, path: $("pub-path").value.trim() };
      const token = $("pub-token").value.trim();
      const bad = checkOwner(c.owner) || checkRepo(c.repo) || checkBranch(c.branch) || checkPath(c.path) || checkToken(token);
      if (bad) { setStatus("error", bad); return; }
      saveCfg(c); writeToken(token);
      setStatus("info", "pub.st.check");

      const info = renderSummary();
      if (!info) { setStatus("error", "pub.err.unknown"); return; }
      if (info.size > MAX_BYTES) { setStatus("error", "pub.err.tooBig", { mb: (info.size / 1048576).toFixed(1) }); return; }
      if (info.empty && !window.confirm(I18n.t("pub.confirmEmpty"))) { setStatus("info", "pub.st.cancelled"); return; }
      const bigNote = info.size > WARN_BYTES ? "\n\n" + I18n.t("pub.confirmBig", { kb: (info.size / 1024).toFixed(0) }) : "";
      if (!window.confirm(I18n.t("pub.confirm", c) + bigNote)) { setStatus("info", "pub.st.cancelled"); return; }

      const enc = toBase64(info.text);
      const message = ($("pub-message").value.replace(/[\r\n\t]+/g, " ").trim() || defaultMessage()).slice(0, 200);

      setStatus("info", "pub.st.fetch");
      let sha = await getSha(c, token);
      if (sha === null) setStatus("info", "pub.st.newFile"); else setStatus("info", "pub.st.put");
      let r = await putFile(c, token, enc.b64, message, sha);
      if (r.status === 409 || r.status === 422) {          // sha cũ (có người vừa sửa file): lấy sha mới ĐÚNG MỘT lần rồi thử lại
        setStatus("info", "pub.st.retry");
        sha = await getSha(c, token);
        r = await putFile(c, token, enc.b64, message, sha);
      }
      if (r.status === 200 || r.status === 201) {
        setStatus("ok", r.status === 201 ? "pub.ok.created" : "pub.ok", { path: c.path }, "", safeCommitUrl(r.data));
        return;
      }
      const d = describeFailure(r, c);
      setStatus("error", d.key, d.params, d.extra);
    } catch (e) {
      const k = e && e.kind;
      const c = { owner: $("pub-owner").value.trim(), repo: $("pub-repo").value.trim(), branch: $("pub-branch").value.trim(), path: $("pub-path").value.trim() };
      if (k === "fail") { const d = describeFailure(e.info.r, c); setStatus("error", d.key, d.params, d.extra); }
      else if (k === "timeout") setStatus("error", "pub.err.timeout", { sec: TIMEOUT_MS / 1000 });
      else if (k === "offline") setStatus("error", "pub.err.offline");
      else if (k === "network") setStatus("error", "pub.err.network");
      else if (k === "isDir") setStatus("error", "pub.err.isDir", c);
      else if (k === "badResponse") setStatus("error", "pub.err.badResponse");
      else setStatus("error", "pub.err.unknown");         // không hiện e.message để chắc chắn không lộ gì
    } finally {
      setBusy(false);
      const inp = $("pub-token"); if (inp) { inp.type = "password"; syncReveal(); }
    }
  }

  /* ---------- Khởi tạo ---------- */
  function fillFields() {
    const c = loadCfg();
    $("pub-owner").value = c.owner; $("pub-repo").value = c.repo; $("pub-branch").value = c.branch; $("pub-path").value = c.path;
    $("pub-token").value = readToken();
  }
  // Gọi mỗi khi mở tab Đăng web: nạp lại ô nhập và tóm tắt dữ liệu mới nhất
  function show() {
    if (running) return;
    if (!Store.isHostMode()) { clearToken(); return; }
    fillFields(); $("pub-token").type = "password"; syncReveal(); renderSummary();
  }

  function init() {
    if (!Store.isHostMode()) clearToken();                  // không phải host (hoặc vừa ?host=0): không giữ mã
    fillFields();
    $("pub-form").addEventListener("submit", function (e) { e.preventDefault(); });
    $("pub-submit").addEventListener("click", publish);
    $("pub-token").addEventListener("input", function (e) { writeToken(e.target.value.trim()); });
    $("pub-reveal").addEventListener("click", function () { const i = $("pub-token"); i.type = i.type === "password" ? "text" : "password"; syncReveal(); });
    $("pub-clear").addEventListener("click", function () { if (running) return; clearToken(); UI.toast(I18n.t("pub.tokenCleared")); });
    ["pub-owner", "pub-repo", "pub-branch", "pub-path"].forEach(function (id) {
      $(id).addEventListener("change", function () {
        saveCfg({ owner: $("pub-owner").value.trim(), repo: $("pub-repo").value.trim(), branch: $("pub-branch").value.trim(), path: $("pub-path").value.trim() });
      });
    });
    $("pub-token").type = "password"; syncReveal();
    I18n.onChange(function () { syncReveal(); setBusy(running); renderStatus(); if (Store.isHostMode()) renderSummary(); });
  }

  // Xuất thêm vài hàm để kiểm thử/ main.js dùng; không xuất token
  window.Publish = { init: init, show: show, publish: publish, clearToken: clearToken, _buildSeedText: buildSeedText };
})();
