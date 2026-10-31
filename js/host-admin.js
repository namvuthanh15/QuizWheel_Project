// host-admin.js – trang host (host.html): quản lý người chơi, kho câu hỏi, vòng quay, cài đặt, nạp dữ liệu cũ lên Supabase.
// Mọi thao tác gọi hàm admin_* trên server kèm MẬT KHẨU HOST (giữ trong biến, không lưu vào LocalStorage/URL).
(function () {
  const LETTERS = "ABCDEF", LEVELS = ["easy", "hard", "impossible"];
  const $ = function (s) { return document.querySelector(s); };
  const h = UI.el;
  let KEY = "";
  let players = [];
  let D = { questions: { easy: [], hard: [], impossible: [] }, wheels: {}, settings: null, loseImage: null };
  let cfg = { costs: { easy: 1, hard: 1, impossible: 0 }, startTurns: 3, freeSpins: 1, impossiblePrize: "100K" };
  let tab = "players", qLevel = "easy", wLevel = "free", editing = null, histFor = null;
  let shareBox = null;   // { name, pin|null, withPin } – chỉ giữ trong bộ nhớ tab này, không lưu vào LocalStorage/URL
  const dirty = { questions: false, wheel: false };
  const form = { images: [null, null, null, null] };

  const ERR = { auth: "Sai mật khẩu host.", locked: "Nhập sai quá nhiều lần, bị khóa 15 phút.", nokey: "Chưa đặt mật khẩu host (chạy 02-admin-key.sql).",
    network: "Không kết nối được Supabase.", server: "Máy chủ báo lỗi.", config: "Chưa cấu hình js/config.js.",
    bad_name: "Tên phải 1–30 ký tự.", bad_pin: "PIN phải 4–12 ký tự.", exists: "Tên này đã có người dùng.", no_player: "Không tìm thấy người chơi.",
    short_key: "Mật khẩu mới phải từ 8 ký tự.", bad_data: "Dữ liệu không hợp lệ.",
    need_password: "Việc này cần nhập mật khẩu host (không dùng được bằng thiết bị đã lưu).", bad_key: "Mật khẩu mới không được bắt đầu bằng “qwdev.”.",
    trust_off: "Tính năng lưu thiết bị đang tắt (bật lại trong tab Cài đặt)." };

  // ---- Thiết bị tin cậy: chỉ lưu MÃ THIẾT BỊ ngẫu nhiên (hết hạn 7 ngày, thu hồi được), KHÔNG lưu mật khẩu ----
  const KEY_DEV = "quizwheel.v2.hostDevice";
  function readDevice() { try { const d = JSON.parse(localStorage.getItem(KEY_DEV)); return d && typeof d.token === "string" && d.token.indexOf("qwdev.") === 0 && d.exp > Date.now() ? d : null; } catch (e) { return null; } }
  function writeDevice(d) { try { localStorage.setItem(KEY_DEV, JSON.stringify(d)); } catch (e) {} }
  function clearDevice() { try { localStorage.removeItem(KEY_DEV); } catch (e) {} }
  function isDeviceKey() { return KEY.indexOf("qwdev.") === 0; }

  function say(msg, good) { const m = $("#msg"); m.textContent = msg || ""; m.className = "feedback " + (good ? "good" : "bad"); }
  function errMsg(r) { return (ERR[r.error] || "Lỗi: " + r.error) + (r.message ? " (" + r.message + ")" : ""); }

  // Gọi hàm admin_*; trả về kết quả hoặc null nếu lỗi (đã hiện thông báo). Sai mật khẩu giữa chừng -> về màn đăng nhập.
  async function adm(fn, params) {
    const r = await Api.call(fn, Object.assign({ p_key: KEY }, params || {}));
    if (r.ok) return r;
    if (r.error === "auth" || r.error === "locked") { logout(errMsg(r)); return null; }
    say(errMsg(r), false); return null;
  }

  /* ---------- Đăng nhập ---------- */
  async function login(e) {
    e.preventDefault();
    const k = $("#key").value; if (!k) return;
    $("#login-go").disabled = true; $("#login-err").textContent = "";
    const r = await Api.call("admin_login", { p_key: k });
    $("#login-go").disabled = false;
    if (!r.ok) { $("#login-err").textContent = errMsg(r); $("#key").value = ""; return; }
    KEY = k; $("#key").value = "";
    let note = "";
    if (!$("#trust-row").hidden && $("#trust").checked) {
      const t = await Api.call("admin_trust_device", { p_key: k });
      if (t.ok) { writeDevice({ token: t.token, exp: Date.parse(t.expiresAt) || (Date.now() + 7 * 864e5) }); note = "Đã lưu thiết bị này trong 7 ngày."; }
      else note = "Không lưu được thiết bị: " + errMsg(t);
    }
    enterApp(note);
  }
  async function enterApp(note) {
    $("#sec-login").hidden = true; $("#sec-app").hidden = false; $("#btn-out").hidden = false;
    await loadAll(); showTab("players");
    if (note) say(note, note.indexOf("Không") !== 0);
  }
  // Vào/tải lại trang: nếu còn mã thiết bị hợp lệ thì vào thẳng, không hỏi mật khẩu.
  async function autoLogin() {
    const d = readDevice();
    if (!d) { clearDevice(); return false; }
    $("#login-go").disabled = true; $("#login-err").textContent = "Đang vào bằng thiết bị đã lưu…";
    const r = await Api.call("admin_login", { p_key: d.token });
    $("#login-go").disabled = false; $("#login-err").textContent = "";
    if (r.ok) { KEY = d.token; enterApp(""); return true; }
    if (r.error === "network" || r.error === "server") { $("#login-err").textContent = errMsg(r) + " Bạn có thể nhập mật khẩu để vào."; return false; }
    clearDevice(); $("#login-err").textContent = "Thiết bị này đã hết hạn hoặc bị thu hồi. Hãy nhập mật khẩu."; return false;
  }
  function logout(msg) {
    const d = readDevice(); if (d) Api.call("admin_forget_device", { p_key: d.token });   // quên thiết bị trên server rồi xóa mã ở máy này
    clearDevice();
    KEY = ""; players = []; shareBox = null; $("#sec-app").hidden = true; $("#btn-out").hidden = true; $("#sec-login").hidden = false;
    $("#login-err").textContent = msg || "";
  }

  async function loadAll() {
    const [p, ex, st] = await Promise.all([adm("admin_players"), adm("admin_export"), adm("admin_settings")]);
    if (p) players = p.players;
    if (ex) {
      D.questions = { easy: ex.questions.easy || [], hard: ex.questions.hard || [], impossible: ex.questions.impossible || [] };
      D.wheels = ex.wheels || {}; D.settings = ex.settings; D.loseImage = ex.loseImage || null;
    }
    if (st) cfg = { costs: st.costs, startTurns: st.startTurns, freeSpins: st.freeSpins, impossiblePrize: st.impossiblePrize };
    dirty.questions = dirty.wheel = false;
  }

  /* ---------- Tab ---------- */
  const TABS = [["players", "Người chơi"], ["questions", "Câu hỏi"], ["wheels", "Vòng quay"], ["settings", "Cài đặt"], ["data", "Nạp / sao lưu"]];
  function showTab(name) {
    if (name !== "players") shareBox = null;
    tab = name; say("");
    const bar = $("#tabs"); bar.textContent = "";
    TABS.forEach(function (t) {
      const b = h("button", "btn btn-secondary" + (t[0] === name ? " active" : ""), t[1]); b.type = "button";
      b.addEventListener("click", function () { showTab(t[0]); });
      bar.appendChild(b);
    });
    TABS.forEach(function (t) { $("#tab-" + t[0]).hidden = t[0] !== name; });
    ({ players: renderPlayers, questions: renderQuestions, wheels: renderWheels, settings: renderSettings, data: renderData })[name]();
  }
  function box(id) { const el = $("#tab-" + id); el.textContent = ""; return el; }
  function field(label, input) { const l = h("label", "field"); l.append(h("span", "", label), input); return l; }
  function input(type, value, attrs) { const i = h("input"); i.type = type; i.value = value === undefined || value === null ? "" : value; Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); }); return i; }
  function btn(text, cls, fn) { const b = h("button", cls, text); b.type = "button"; b.addEventListener("click", fn); return b; }
  function link(text, fn, danger) { return btn(text, "link-btn" + (danger ? " danger" : ""), fn); }
  function kfmt(v) { return String(Math.round(Number(v) * 10) / 10) + "K"; }

  /* ---------- Khung "Gửi cho người chơi" ---------- */
  // Link chỉ chứa TÊN (?u=...). PIN không bao giờ nằm trong link.
  // Địa chỉ web công khai KHÔNG lấy từ trang host nếu bạn đang mở bằng file:// hoặc localhost (người chơi không vào được).
  const KEY_BASE = "quizwheel.v2.publicBase";   // LocalStorage: chỉ là địa chỉ web, không có bí mật
  function cleanBase(v) {
    v = String(v || "").trim();
    if (!/^https?:\/\//i.test(v)) return "";
    try { const u = new URL(v); u.search = ""; u.hash = ""; u.pathname = /\.[a-z0-9]+$/i.test(u.pathname) ? u.pathname.replace(/[^/]*$/, "") : u.pathname.replace(/\/*$/, "/"); return u.toString(); } catch (e) { return ""; }
  }
  function isLocalHost(h) { return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || /^(192\.168|10)\./.test(h); }
  function guessBase() {
    try { const s = localStorage.getItem(KEY_BASE); if (s && cleanBase(s)) return cleanBase(s); } catch (e) {}
    if (/^https?:$/.test(location.protocol) && !isLocalHost(location.hostname)) return cleanBase(location.href);
    try {   // dùng owner/repo đã nhập ở tab Đăng web cũ (nếu có) -> https://owner.github.io/repo/
      const c = JSON.parse(localStorage.getItem("quizwheel.v1.publish"));
      if (c && c.owner && c.repo) return cleanBase("https://" + c.owner + ".github.io/" + (c.repo.toLowerCase() === (c.owner + ".github.io").toLowerCase() ? "" : c.repo + "/"));
    } catch (e) {}
    return "";
  }
  function saveBase(v) { try { localStorage.setItem(KEY_BASE, v); } catch (e) {} }
  function playerLink(name) {
    const base = guessBase();
    if (!base) return "";
    const u = new URL("index.html", base);
    u.searchParams.set("u", name);
    return u.toString();
  }
  function shareText(b) {
    const url = playerLink(b.name);
    if (!url) return "(Hãy nhập địa chỉ web của game ở ô bên dưới để tạo link.)";
    if (b.withPin && b.pin) return "Vào " + url + " rồi nhập PIN " + b.pin + " để chơi QuizWheel nhé.";
    return "Vào " + url + " để chơi QuizWheel nhé. Tên “" + b.name + "” đã điền sẵn, bạn chỉ cần nhập PIN (mình gửi PIN riêng cho bạn).";
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      const ta = h("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta); ok ? resolve() : reject(new Error("copy"));
    });
  }
  function shareCard() {
    const b = shareBox, c = h("div", "card"); c.style.marginTop = "14px";
    c.appendChild(h("h3", "", "Gửi cho " + b.name));
    const pre = h("pre", "preview", shareText(b));
    const redraw = function () { pre.textContent = shareText(b); };
    c.appendChild(pre);
    const bi = input("text", guessBase(), { placeholder: "https://ten-ban.github.io/QuizWheel/", autocomplete: "off" });
    bi.addEventListener("change", function () {
      const v = cleanBase(bi.value);
      if (!v) { say("Địa chỉ web phải bắt đầu bằng https:// (không dùng đường dẫn ổ đĩa D:/).", false); return; }
      say(""); saveBase(v); bi.value = v; redraw();
    });
    c.appendChild(field("Địa chỉ web của game (nơi người chơi mở được, không phải đường dẫn trong máy bạn)", bi));
    if (b.pin) {
      const lab = h("label", "wrow"), cb = h("input"); cb.type = "checkbox"; cb.checked = b.withPin;
      cb.addEventListener("change", function () { b.withPin = cb.checked; redraw(); });
      lab.append(cb, h("span", "", "Kèm PIN trong lời nhắn (kém an toàn: ai đọc được tin nhắn là vào được)"));
      c.appendChild(lab);
      c.appendChild(h("p", "note", "PIN của người này: " + b.pin + " — gửi riêng (nhắn riêng hoặc nói miệng). Trang không lưu PIN, thoát hoặc đổi tab là mất."));
    } else {
      c.appendChild(h("p", "note", "Link này chỉ có tên, không có PIN. PIN cũ không xem lại được; nếu người chơi quên, bấm “Đổi PIN” để đặt PIN mới."));
    }
    const acts = h("div", "form-actions");
    acts.appendChild(btn("Sao chép lời nhắn", "btn btn-primary", function () {
      if (!playerLink(b.name)) { say("Chưa có địa chỉ web của game, hãy nhập ở ô phía trên.", false); return; }
      copyText(shareText(b)).then(function () { UI.toast("Đã sao chép lời nhắn."); }, function () { say("Không sao chép được, hãy bôi đen đoạn trên rồi copy.", false); });
    }));
    acts.appendChild(btn("Chỉ sao chép link", "btn btn-secondary", function () {
      if (!playerLink(b.name)) { say("Chưa có địa chỉ web của game, hãy nhập ở ô phía trên.", false); return; }
      copyText(playerLink(b.name)).then(function () { UI.toast("Đã sao chép link."); }, function () { say("Không sao chép được.", false); });
    }));
    acts.appendChild(btn("Đóng", "btn btn-secondary", function () { shareBox = null; renderPlayers(); }));
    c.appendChild(acts);
    return c;
  }

  /* ====================== NGƯỜI CHƠI ====================== */
  function renderPlayers() {
    const el = box("players");
    const c = h("div", "card");
    c.appendChild(h("h2", "", "Tạo người chơi"));
    const row = h("div", "row");
    const n = input("text", "", { maxlength: 30 }), pin = input("text", "", { maxlength: 12, autocomplete: "off" }), t = input("number", "", { min: 0, placeholder: "mặc định " + cfg.startTurns });
    row.append(field("Tên", n), field("PIN (4–12 ký tự)", pin), field("Số lượt ban đầu", t));
    row.appendChild(btn("Tạo", "btn btn-primary", async function () {
      const r = await adm("admin_player_create", { p_name: n.value, p_pin: pin.value, p_turns: t.value === "" ? null : Number(t.value) });
      if (r) { const nm = n.value.trim(), pn = pin.value; shareBox = { name: nm, pin: pn, withPin: false }; await loadAll(); say("Đã tạo người chơi " + nm + ". Gửi link bên dưới rồi nhắn PIN riêng cho họ.", true); renderPlayers(); }
    }));
    c.appendChild(row); el.appendChild(c);
    if (shareBox) el.appendChild(shareCard());

    const wrap = h("div", "tbl-wrap"); wrap.style.marginTop = "14px";
    const tb = h("table", "tbl");
    const head = h("tr"); ["Tên", "Lượt", "Free đã dùng", "Đã trúng", "Đã trả", "Còn nợ", "Ván", "Lần cuối", "Thao tác"].forEach(function (x) { head.appendChild(h("th", "", x)); });
    tb.appendChild(head);
    if (!players.length) { const tr = h("tr"), td = h("td", "", "Chưa có người chơi."); td.colSpan = 9; tr.appendChild(td); tb.appendChild(tr); }
    players.forEach(function (p) {
      const tr = h("tr", p.active ? "" : "off");
      const owed = Math.max(0, Number(p.rewardK) - Number(p.paidK));
      tr.append(h("td", "", p.name + (p.active ? "" : " (khóa)")), h("td", "num", String(p.turns)), h("td", "num", String(p.freeUsed)),
        h("td", "num", kfmt(p.rewardK)), h("td", "num", kfmt(p.paidK)), h("td", "num", owed > 0 ? kfmt(owed) : "—"), h("td", "num", String(p.plays)),
        h("td", "", p.lastAt ? new Date(p.lastAt).toLocaleString("vi-VN") : "—"));
      const td = h("td"); const a = h("div", "acts");
      a.append(
        link("± Lượt", async function () {
          const v = window.prompt("Cộng/trừ bao nhiêu lượt cho " + p.name + "? (vd 3 hoặc -1)", "1"); if (v === null) return;
          const d = parseInt(v, 10); if (!Number.isInteger(d)) { say("Hãy nhập số nguyên.", false); return; }
          if (await adm("admin_player_update", { p_id: p.id, p_turns_delta: d })) { await loadAll(); renderPlayers(); say("Đã chỉnh lượt.", true); }
        }),
        link("Reset Free", async function () { if (await adm("admin_player_update", { p_id: p.id, p_free_used: 0 })) { await loadAll(); renderPlayers(); say("Đã cho " + p.name + " quay Free lại.", true); } }),
        link("Lấy link", function () { shareBox = { name: p.name, pin: null, withPin: false }; say(""); renderPlayers(); }),
        link("Đổi PIN", async function () {
          const v = window.prompt("PIN mới cho " + p.name + " (4–12 ký tự):", ""); if (v === null) return;
          if (await adm("admin_player_update", { p_id: p.id, p_pin: v })) { shareBox = { name: p.name, pin: v, withPin: false }; say("Đã đổi PIN (người này bị đăng xuất). Gửi lại link và PIN mới cho họ.", true); renderPlayers(); }
        }),
        link(p.active ? "Khóa" : "Mở khóa", async function () { if (await adm("admin_player_update", { p_id: p.id, p_active: !p.active })) { await loadAll(); renderPlayers(); } }),
        link("Đã trả", async function () {
          const v = window.prompt("Đã trả thêm bao nhiêu K cho " + p.name + "? (còn nợ " + kfmt(owed) + "; nhập số âm để sửa lại)", String(owed)); if (v === null) return;
          const d = Number(v.replace(",", ".")); if (!Number.isFinite(d)) { say("Hãy nhập số.", false); return; }
          if (await adm("admin_mark_paid", { p_id: p.id, p_delta: d })) { await loadAll(); renderPlayers(); say("Đã ghi nhận.", true); }
        }),
        link("Lịch sử", async function () { const r = await adm("admin_history", { p_id: p.id }); if (r) { histFor = { p: p, items: r.items }; renderPlayers(); } }),
        link("Xóa", async function () {
          if (!(await UI.confirm("Xóa hẳn " + p.name + " cùng toàn bộ lịch sử? Không hoàn tác được."))) return;
          if (await adm("admin_player_delete", { p_id: p.id })) { histFor = null; await loadAll(); renderPlayers(); say("Đã xóa.", true); }
        }, true));
      td.appendChild(a); tr.appendChild(td); tb.appendChild(tr);
    });
    wrap.appendChild(tb); el.appendChild(wrap);
    el.appendChild(h("p", "note", "“Đã trúng” = tổng lì xì từ các ván; “Đã trả” do bạn ghi khi đưa tiền. Hai số khác nhau thì phần chênh là “Còn nợ”."));

    if (histFor) {
      const hc = h("div", "card"); hc.style.marginTop = "14px";
      hc.appendChild(h("h3", "", "Lịch sử của " + histFor.p.name));
      const ul = h("ul", "hist-list");
      if (!histFor.items.length) ul.appendChild(h("li", "host-empty", "Chưa có ván nào."));
      histFor.items.forEach(function (it) {
        const li = h("li", "hist-item");
        const res = it.rewardLabel ? it.rewardLabel : (it.wheel && !it.spun ? "chưa quay" : it.status === "active" ? "đang chơi" : "—");
        li.append(h("span", "", new Date(it.at).toLocaleString("vi-VN")), h("span", "", (it.kind === "free" ? "Free" : it.level) + (it.cost ? " (−" + it.cost + " lượt)" : "")),
          h("span", "", it.kind === "quiz" ? it.solved + "/" + (it.level === "impossible" ? 2 : it.total) : ""), h("b", "", res));
        ul.appendChild(li);
      });
      hc.appendChild(ul); hc.appendChild(btn("Đóng", "btn btn-secondary", function () { histFor = null; renderPlayers(); }));
      el.appendChild(hc);
    }
  }

  /* ====================== CÂU HỎI ====================== */
  function saveBar(kind, onSave) {
    const bar = h("div", "form-actions");
    bar.appendChild(btn("Lưu lên server", "btn btn-primary", onSave));
    if (dirty[kind]) bar.appendChild(h("span", "dirty", "Chưa lưu lên server"));
    return bar;
  }
  function renderQuestions() {
    const el = box("questions");
    const c = h("div", "card");
    const sel = h("select"); LEVELS.forEach(function (l) { const o = h("option", "", Store.LEVEL_NAMES[l] + " (" + D.questions[l].length + " câu)"); o.value = l; sel.appendChild(o); });
    sel.value = qLevel; sel.addEventListener("change", function () { if (dirty.questions && !window.confirm("Bạn chưa lưu thay đổi của mức này lên server. Bỏ thay đổi và đổi mức?")) { sel.value = qLevel; return; } if (dirty.questions) { loadAll().then(function () { qLevel = sel.value; editing = null; renderQuestions(); }); return; } qLevel = sel.value; editing = null; renderQuestions(); });
    const top = h("div", "row"); top.append(field("Kho câu hỏi", sel), btn("+ Thêm câu hỏi", "btn btn-secondary", function () { editing = { q: null }; renderQuestions(); }));
    c.appendChild(top);
    const list = D.questions[qLevel];
    const need = qLevel === "impossible" ? 1 : qLevel === "easy" ? 8 : 8;
    if (list.length < need) c.appendChild(h("p", "note", "Mức này nên có ít nhất " + need + " câu để người chơi chọn được mọi số câu (hiện " + list.length + ")."));
    const ol = h("ol", "host-list"); ol.style.paddingLeft = "0"; ol.style.listStyle = "none";
    if (!list.length) ol.appendChild(h("li", "host-empty", "Chưa có câu hỏi."));
    list.forEach(function (q, i) {
      const li = h("li", "host-item");
      li.append(h("span", "host-num", String(i + 1)), h("span", "host-q", (q.type === "essay" ? "[Tự luận] " : (q.answers && q.answers.length !== 4 ? "[" + q.answers.length + " đáp án] " : "")) + q.text));
      li.append(link("Sửa", function () { editing = { q: q }; renderQuestions(); }), link("Xóa", function () {
        if (!window.confirm("Xóa câu hỏi này?\n\n" + q.text)) return;
        D.questions[qLevel] = list.filter(function (x) { return x !== q; }); dirty.questions = true; editing = null; renderQuestions();
      }, true));
      ol.appendChild(li);
    });
    c.appendChild(ol);
    c.appendChild(saveBar("questions", async function () {
      const clean = Store.cleanListFor(qLevel, D.questions[qLevel]);
      if (clean.length !== D.questions[qLevel].length) { say("Có câu hỏi không hợp lệ, hãy kiểm tra lại.", false); return; }
      const q = {}; q[qLevel] = clean;
      if (await adm("admin_import", { p_data: { questions: q } })) { await loadAll(); renderQuestions(); say("Đã lưu " + clean.length + " câu hỏi mức " + Store.LEVEL_NAMES[qLevel] + " lên server.", true); }
    }));
    el.appendChild(c);
    if (editing) el.appendChild(questionForm());
  }

  // Chọn loại câu hỏi (chỉ khi tạo mới, mức Easy/Hard); mức Impossible giữ nguyên dạng nhập ngày
  function questionForm() {
    const q = editing.q;
    if (qLevel === "impossible") return typedForm();
    const type = q ? (q.type === "essay" ? "essay" : "mcq") : (editing.type || "mcq");
    const wrap = h("div");
    if (!q) {
      const tabs = h("div", "tabs"); tabs.style.margin = "14px 0 0";
      [["mcq", "Trắc nghiệm (A, B, C…)"], ["essay", "Tự luận (người chơi gõ câu trả lời)"]].forEach(function (t) {
        tabs.appendChild(btn(t[1], "btn btn-secondary" + (type === t[0] ? " active" : ""), function () { editing.type = t[0]; renderQuestions(); }));
      });
      wrap.appendChild(tabs);
    }
    wrap.appendChild(type === "essay" ? essayForm() : mcqForm());
    return wrap;
  }

  function mcqForm() {
    const q = editing.q, c = h("div", "card"); c.style.marginTop = "14px";
    c.appendChild(h("h3", "", q ? "Sửa câu hỏi trắc nghiệm" : "Thêm câu hỏi trắc nghiệm"));
    const text = h("textarea"); text.rows = 2; text.maxLength = Store.LIMITS.question; text.value = q ? q.text : "";
    c.appendChild(field("Câu hỏi", text));
    const MIN = Store.LIMITS.ansMin, MAX = Store.LIMITS.ansMax;
    const vals = [];                                    // giữ nội dung các ô khi đổi số đáp án
    for (let i = 0; i < MAX; i++) vals.push(q && q.answers[i] ? { text: q.answers[i].text || "", image: q.answers[i].image || null } : { text: "", image: null });
    let n = q ? q.answers.length : 4, correct = q ? q.correct : 0;
    const cnt = h("select");
    for (let k = MIN; k <= MAX; k++) { const o = h("option", "", k + " đáp án (" + LETTERS.slice(0, k).split("").join(", ") + ")"); o.value = String(k); cnt.appendChild(o); }
    cnt.value = String(n);
    c.appendChild(field("Số đáp án (tối thiểu " + MIN + ", tối đa " + MAX + ")", cnt));
    const grid = h("div", "grid2"); c.appendChild(grid);
    function draw() {
      grid.textContent = "";
      for (let i = 0; i < n; i++) {
        (function (i) {
          const b = h("div", "ans-block");
          const t = input("text", vals[i].text, { maxlength: Store.LIMITS.answer, placeholder: "Đáp án " + LETTERS[i] });
          t.addEventListener("input", function () { vals[i].text = t.value; });
          const r = input("radio", "", { name: "correct" }); r.checked = correct === i;
          r.addEventListener("change", function () { if (r.checked) correct = i; });
          const rl = h("label"); rl.append(r, document.createTextNode(" Đáp án " + LETTERS[i] + " là đúng"));
          const f = input("file", "", { accept: "image/*" });
          const img = h("img"); img.alt = ""; img.hidden = !vals[i].image; if (vals[i].image) img.src = vals[i].image;
          const clr = btn("Xóa ảnh", "link-btn danger", function () { vals[i].image = null; img.hidden = true; f.value = ""; }); clr.style.justifySelf = "start";
          f.addEventListener("change", async function () {
            if (!f.files[0]) return;
            try { vals[i].image = await fileToDataUrl(f.files[0], 480); img.src = vals[i].image; img.hidden = false; } catch (e) { say(e.message, false); }
          });
          b.append(rl, t, f, img, clr); grid.appendChild(b);
        })(i);
      }
    }
    cnt.addEventListener("change", function () {
      n = Number(cnt.value);
      if (correct >= n) { correct = 0; say("Đáp án đúng đã được đặt lại về A vì số đáp án giảm.", false); }
      draw();
    });
    draw();
    const ex = h("textarea"); ex.rows = 2; ex.maxLength = Store.LIMITS.explain; ex.value = q ? q.explain || "" : "";
    c.appendChild(field("Giải thích (hiện khi trả lời đúng, không bắt buộc)", ex));
    const err = h("p", "feedback bad"); c.appendChild(err);
    const acts = h("div", "form-actions");
    acts.append(btn("Xong", "btn btn-primary", function () {
      const item = { id: q ? q.id : Store.uid(), text: text.value.trim(), explain: ex.value.trim(), correct: correct,
        answers: vals.slice(0, n).map(function (v) { return { text: v.text.trim(), image: v.image }; }) };
      if (!item.text) { err.textContent = "Chưa nhập câu hỏi."; return; }
      if (item.answers.some(function (a) { return !a.text && !a.image; })) { err.textContent = "Mỗi đáp án cần có chữ hoặc ảnh."; return; }
      if (item.correct < 0 || item.correct >= n) { err.textContent = "Hãy chọn đáp án đúng."; return; }
      applyQuestion(q, item);
    }), btn("Hủy", "btn btn-secondary", function () { editing = null; renderQuestions(); }));
    c.appendChild(acts); return c;
  }

  // Tự luận (bản thử nghiệm): người chơi gõ chữ, server so với danh sách "đáp án chấp nhận"
  function essayForm() {
    const q = editing.q, c = h("div", "card"); c.style.marginTop = "14px";
    c.appendChild(h("h3", "", q ? "Sửa câu hỏi tự luận" : "Thêm câu hỏi tự luận"));
    const text = h("textarea"); text.rows = 2; text.maxLength = Store.LIMITS.question; text.value = q ? q.text : "";
    c.appendChild(field("Câu hỏi", text));
    const acc = h("textarea"); acc.rows = 4; acc.value = q ? (q.accepted || []).join("\n") : "";
    c.appendChild(field("Đáp án chấp nhận (mỗi dòng một đáp án, tối đa " + Store.LIMITS.acceptedMax + ")", acc));
    c.appendChild(h("p", "note", "So khớp không phân biệt chữ hoa/thường, dấu tiếng Việt, dấu câu và khoảng trắng thừa (“Hà Nội.” = “ha noi”). Cách diễn đạt khác hẳn sẽ bị tính sai, nên hãy liệt kê các cách viết phổ biến, mỗi cách một dòng."));
    const ex = h("textarea"); ex.rows = 2; ex.maxLength = Store.LIMITS.explain; ex.value = q ? q.explain || "" : "";
    c.appendChild(field("Giải thích (hiện khi trả lời đúng, không bắt buộc)", ex));
    const err = h("p", "feedback bad"); c.appendChild(err);
    const acts = h("div", "form-actions");
    acts.append(btn("Xong", "btn btn-primary", function () {
      const lines = acc.value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
      const item = { id: q ? q.id : Store.uid(), type: "essay", text: text.value.trim(), accepted: lines, explain: ex.value.trim() };
      if (!item.text) { err.textContent = "Chưa nhập câu hỏi."; return; }
      if (!lines.length) { err.textContent = "Cần ít nhất một đáp án chấp nhận."; return; }
      if (lines.length > Store.LIMITS.acceptedMax) { err.textContent = "Tối đa " + Store.LIMITS.acceptedMax + " đáp án chấp nhận."; return; }
      if (lines.some(function (l) { return l.length > Store.LIMITS.accepted; })) { err.textContent = "Mỗi đáp án tối đa " + Store.LIMITS.accepted + " ký tự."; return; }
      applyQuestion(q, Store.cleanListFor(qLevel, [item])[0] || item);
    }), btn("Hủy", "btn btn-secondary", function () { editing = null; renderQuestions(); }));
    c.appendChild(acts); return c;
  }

  function typedForm() {
    const q = editing.q, c = h("div", "card"); c.style.marginTop = "14px";
    c.appendChild(h("h3", "", q ? "Sửa câu hỏi Impossible" : "Thêm câu hỏi Impossible"));
    const text = h("textarea"); text.rows = 2; text.maxLength = Store.LIMITS.question; text.value = q ? q.text : "";
    c.appendChild(field("Câu hỏi (gồm 2 ý, mỗi ý có đáp án là một ngày)", text));
    const ins = [];
    [0, 1].forEach(function (n) {
      const p = q ? q.parts[n] : null, row = h("div", "row");
      const d = input("number", p ? p.d : "", { min: 1, max: 31 }), m = input("number", p ? p.m : "", { min: 1, max: 12 }), y = input("number", p ? p.y : "", { min: 1, max: 9999 });
      row.append(field("Ý " + (n + 1) + " – ngày", d), field("tháng", m), field("năm", y)); c.appendChild(row); ins.push([d, m, y]);
    });
    const err = h("p", "feedback bad"); c.appendChild(err);
    const acts = h("div", "form-actions");
    acts.append(btn("Xong", "btn btn-primary", function () {
      const parts = ins.map(function (r) { return { d: Number(r[0].value), m: Number(r[1].value), y: Number(r[2].value) }; });
      const item = { id: q ? q.id : Store.uid(), text: text.value.trim(), parts: parts };
      if (!item.text) { err.textContent = "Chưa nhập câu hỏi."; return; }
      if (Store.cleanListFor("impossible", [item]).length !== 1) { err.textContent = "Ngày không hợp lệ (vd 31/2 không tồn tại)."; return; }
      applyQuestion(q, item);
    }), btn("Hủy", "btn btn-secondary", function () { editing = null; renderQuestions(); }));
    c.appendChild(acts); return c;
  }

  function applyQuestion(old, item) {
    const list = D.questions[qLevel];
    if (old) D.questions[qLevel] = list.map(function (x) { return x === old ? item : x; });
    else if (list.length >= Store.LIMITS.maxQuestions) { say("Tối đa " + Store.LIMITS.maxQuestions + " câu mỗi mức.", false); return; }
    else D.questions[qLevel] = list.concat([item]);
    dirty.questions = true; editing = null; renderQuestions();
  }

  // Đọc ảnh -> thu nhỏ -> JPEG data URL (giữ dung lượng nhỏ)
  async function fileToDataUrl(file, maxSide) {
    if (!file || !/^image\//.test(file.type)) throw new Error("File không phải ảnh.");
    if (file.size > 10 * 1024 * 1024) throw new Error("Ảnh quá lớn (tối đa 10 MB).");
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise(function (ok, bad) { const im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { bad(new Error("Không đọc được ảnh.")); }; im.src = url; });
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
      const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL("image/jpeg", 0.72);
    } finally { URL.revokeObjectURL(url); }
  }

  /* ====================== VÒNG QUAY ====================== */
  function renderWheels() {
    const el = box("wheels"), c = h("div", "card");
    const sel = h("select"); Store.WHEEL_LEVELS.forEach(function (l) { const o = h("option", "", Store.WHEEL_NAMES[l]); o.value = l; sel.appendChild(o); });
    sel.value = wLevel;
    sel.addEventListener("change", function () { if (dirty.wheel) { if (!window.confirm("Bỏ thay đổi chưa lưu của vòng quay này?")) { sel.value = wLevel; return; } loadAll().then(function () { wLevel = sel.value; renderWheels(); }); return; } wLevel = sel.value; renderWheels(); });
    c.appendChild(field("Vòng quay", sel));
    const items = D.wheels[wLevel] = (D.wheels[wLevel] || []).map(function (x) { return Object.assign({}, x); });
    const total = function () { return items.reduce(function (a, x) { return a + (Number(x.count) || 0); }, 0); };
    const info = h("p", "note"); const upd = function () { info.textContent = "Tổng " + total() + "/" + Store.WHEEL_MAX + " ô (cần ít nhất 2). Tỉ lệ trúng = số ô của giá trị ÷ tổng số ô."; };
    items.forEach(function (it, i) {
      const r = h("div", "wrow");
      const lab = input("text", it.label, { maxlength: 30, placeholder: "vd 5K hoặc Chúc may mắn" }); lab.className = "w-label";
      const cnt = input("number", it.count, { min: 1, max: Store.WHEEL_MAX }); cnt.className = "w-count";
      const col = input("color", it.color || Store.PALETTE[i % Store.PALETTE.length]);
      lab.addEventListener("input", function () { it.label = lab.value; dirty.wheel = true; });
      cnt.addEventListener("input", function () { it.count = Number(cnt.value); dirty.wheel = true; upd(); });
      col.addEventListener("input", function () { it.color = col.value; dirty.wheel = true; });
      r.append(lab, cnt, h("span", "", "ô"), col, link("Xóa", function () { items.splice(i, 1); D.wheels[wLevel] = items; dirty.wheel = true; renderWheels(); }, true));
      c.appendChild(r);
    });
    upd(); c.appendChild(info);
    c.appendChild(btn("+ Thêm giá trị", "btn btn-secondary", function () { items.push({ id: Store.uid(), label: "", count: 1, color: Store.PALETTE[items.length % Store.PALETTE.length] }); D.wheels[wLevel] = items; dirty.wheel = true; renderWheels(); }));
    c.appendChild(saveBar("wheel", async function () {
      const clean = Store.cleanWheelItems(items);
      if (clean.reduce(function (a, x) { return a + x.count; }, 0) < 2) { say("Vòng quay cần ít nhất 2 ô.", false); return; }
      const w = {}; w[wLevel] = clean;
      if (await adm("admin_import", { p_data: { wheels: w } })) { dirty.wheel = false; await loadAll(); renderWheels(); say("Đã lưu vòng quay " + Store.WHEEL_NAMES[wLevel] + ".", true); }
    }));
    el.appendChild(c);
    el.appendChild(h("p", "note", "Mẹo: ghi giá trị dạng “5K” hoặc “2,5K”. Hệ thống đọc số trước chữ K để cộng vào lì xì của người chơi; ô chữ như “Chúc may mắn” tính là 0."));
  }

  /* ====================== CÀI ĐẶT ====================== */
  function renderSettings() {
    const el = box("settings"), s = D.settings || {};
    const c = h("div", "card"); c.appendChild(h("h2", "", "Lượt chơi và phần thưởng"));
    const g = h("div", "grid2");
    const ce = input("number", cfg.costs.easy, { min: 0 }), ch = input("number", cfg.costs.hard, { min: 0 }), ci = input("number", cfg.costs.impossible, { min: 0 });
    const st = input("number", cfg.startTurns, { min: 0 }), fs = input("number", cfg.freeSpins, { min: 0 });
    const ip = input("text", cfg.impossiblePrize, { maxlength: 20 });
    g.append(field("Lượt tốn mỗi ván Easy", ce), field("Lượt tốn mỗi ván Hard", ch), field("Lượt tốn mỗi ván Impossible", ci),
             field("Lượt cho người chơi mới", st), field("Số lần quay Free / người", fs), field("Lì xì Impossible khi thắng", ip));
    c.appendChild(g);
    c.appendChild(h("h3", "", "Quiz")); c.lastChild.style.marginTop = "14px";
    const g2 = h("div", "grid2");
    const tm = input("number", s.timePerQuestion !== undefined ? s.timePerQuestion : 20, { min: 0, max: 300 });
    const bpE = input("text", (s.bigPrize || {}).easy || "36K", { maxlength: 20 }), bpH = input("text", (s.bigPrize || {}).hard || "72K", { maxlength: 20 });
    const shE = input("checkbox"), shH = input("checkbox"); shE.checked = !s.shuffleAnswers || s.shuffleAnswers.easy !== false; shH.checked = !s.shuffleAnswers || s.shuffleAnswers.hard !== false;
    g2.append(field("Giây mỗi câu (0 = không giới hạn)", tm), field("Lì xì khi đúng hết 8 câu Easy", bpE), field("Lì xì khi đúng hết 8 câu Hard", bpH));
    const lE = h("label"); lE.append(shE, document.createTextNode(" Đảo vị trí đáp án Easy")); const lH = h("label"); lH.append(shH, document.createTextNode(" Đảo vị trí đáp án Hard"));
    g2.append(lE, lH); c.appendChild(g2);
    c.appendChild(h("p", "note", "Số lượt chỉ tính khi ván BẮT ĐẦU (server trừ ngay). Đổi ở đây chỉ áp dụng cho các ván sau."));
    c.appendChild(btn("Lưu cài đặt", "btn btn-primary", async function () {
      const a = await adm("admin_settings_save", { p_costs: { easy: Number(ce.value), hard: Number(ch.value), impossible: Number(ci.value) }, p_start_turns: Number(st.value), p_free_spins: Number(fs.value), p_impossible_prize: ip.value });
      if (!a) return;
      const b = await adm("admin_import", { p_data: { settings: { timePerQuestion: Math.max(0, Math.min(300, Math.round(Number(tm.value) || 0))), shuffleAnswers: { easy: shE.checked, hard: shH.checked }, bigPrize: { easy: bpE.value.trim() || "36K", hard: bpH.value.trim() || "72K" } } } });
      if (b) { await loadAll(); renderSettings(); say("Đã lưu cài đặt.", true); }
    }));
    el.appendChild(c);

    const lc = h("div", "card"); lc.style.marginTop = "14px";
    lc.appendChild(h("h2", "", "Ảnh hiện khi thua Impossible"));
    const prev = h("img", "lose-prev"); prev.alt = ""; prev.hidden = !D.loseImage; if (D.loseImage) prev.src = D.loseImage;
    const lf = input("file", "", { accept: "image/*" });
    lf.addEventListener("change", async function () {
      if (!lf.files[0]) return;
      try { const url = await fileToDataUrl(lf.files[0], 900); if (await adm("admin_import", { p_data: { loseImage: url } })) { D.loseImage = url; renderSettings(); say("Đã lưu ảnh.", true); } } catch (e) { say(e.message, false); }
    });
    lc.append(prev, lf);
    if (D.loseImage) lc.appendChild(btn("Bỏ ảnh", "link-btn danger", async function () { if (await adm("admin_import", { p_data: { loseImage: "" } })) { D.loseImage = null; renderSettings(); } }));
    el.appendChild(lc);

    const kc = h("div", "card"); kc.style.marginTop = "14px";
    kc.appendChild(h("h2", "", "Đổi mật khẩu host"));
    const nk = input("password", "", { autocomplete: "new-password" }), nk2 = input("password", "", { autocomplete: "new-password" });
    const ck = input("password", "", { autocomplete: "current-password" });
    kc.append(field("Mật khẩu hiện tại", ck), field("Mật khẩu mới (≥ 12 ký tự cho an toàn)", nk), field("Nhập lại", nk2));
    kc.appendChild(h("p", "note", "Đổi mật khẩu sẽ thu hồi mọi thiết bị đã lưu."));
    kc.appendChild(btn("Đổi mật khẩu", "btn btn-secondary", async function () {
      if (nk.value !== nk2.value) { say("Hai mật khẩu không khớp.", false); return; }
      if (nk.value.length < 12 && !window.confirm("Mật khẩu dưới 12 ký tự khá yếu. Vẫn đổi?")) return;
      const newPw = nk.value;
      const r = await Api.call("admin_set_key", { p_key: ck.value, p_new: newPw });
      if (!r.ok) { say(r.error === "auth" ? "Sai mật khẩu hiện tại." : errMsg(r), false); return; }
      clearDevice(); ck.value = nk.value = nk2.value = "";
      if (isDeviceKey()) { logout("Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới."); return; }
      KEY = newPw; say("Đã đổi mật khẩu host. Mọi thiết bị đã lưu phải nhập lại.", true);
    }));
    el.appendChild(kc);

    const tc = h("div", "card"); tc.style.marginTop = "14px";
    tc.appendChild(h("h2", "", "Thiết bị tin cậy (7 ngày)"));
    tc.appendChild(h("p", "note", "Khi bật, trang đăng nhập có ô “Lưu thiết bị này an toàn trong 7 ngày”. Thiết bị đã lưu vào web và tải lại trang không cần mật khẩu. Tắt tính năng là mọi thiết bị đã lưu bị đăng xuất ngay."));
    const tcb = h("input"); tcb.type = "checkbox"; tcb.disabled = true;
    const tcl = h("label", "wrow"); tcl.append(tcb, h("span", "", "Cho phép lưu thiết bị"));
    tc.appendChild(tcl);
    Api.call("admin_trust_get").then(function (r) { tcb.checked = !!(r && r.enabled); tcb.disabled = false; });
    tcb.addEventListener("change", async function () {
      const on = tcb.checked, r = await adm("admin_trust_set", { p_enabled: on });
      if (!r) { tcb.checked = !on; return; }
      if (!on) { clearDevice(); if (isDeviceKey()) { logout("Đã tắt lưu thiết bị. Hãy nhập mật khẩu."); return; } }
      say(on ? "Đã bật tính năng lưu thiết bị." : "Đã tắt, mọi thiết bị đã lưu bị đăng xuất.", true);
    });
    tc.appendChild(btn("Đăng xuất mọi thiết bị đã lưu", "btn btn-secondary", async function () {
      if (!(await UI.confirm("Thu hồi mọi thiết bị đã lưu (kể cả máy này)? Lần sau ai vào cũng phải nhập mật khẩu."))) return;
      if (await adm("admin_trust_revoke")) { clearDevice(); if (isDeviceKey()) logout("Đã thu hồi mọi thiết bị. Hãy nhập mật khẩu."); else say("Đã thu hồi mọi thiết bị đã lưu.", true); }
    }));
    el.appendChild(tc);
  }

  /* ====================== NẠP / SAO LƯU ====================== */
  let pending = null;
  function summarize(d) {
    const lines = [];
    LEVELS.forEach(function (l) { if (d.questions[l]) lines.push("• Câu hỏi " + Store.LEVEL_NAMES[l] + ": " + d.questions[l].length + " câu (sẽ THAY kho hiện có trên server)"); });
    Object.keys(d.wheels).forEach(function (w) { lines.push("• Vòng quay " + Store.WHEEL_NAMES[w] + ": " + d.wheels[w].length + " giá trị (sẽ thay)"); });
    if (d.settings) lines.push("• Cài đặt quiz (thời gian, đảo đáp án, lì xì 8 câu)");
    if (typeof d.loseImage === "string") lines.push("• Ảnh thua Impossible");
    if (d.skipped) lines.push("• Bỏ qua " + d.skipped + " câu hỏi không hợp lệ");
    return lines.join("\n");
  }
  function renderData() {
    const el = box("data"), c = h("div", "card");
    c.appendChild(h("h2", "", "Nạp dữ liệu cũ lên server"));
    c.appendChild(h("p", "note", "Chọn nguồn, xem tóm tắt rồi mới xác nhận. Mức hoặc vòng quay nào không có trong nguồn sẽ được giữ nguyên trên server."));
    const acts = h("div", "form-actions");
    acts.appendChild(btn("Từ dữ liệu cũ trong trình duyệt này", "btn btn-primary", function () {
      try { setPending(Store.parseImport(Store.exportJSON()), "dữ liệu trong trình duyệt (gồm bộ mẫu seed.js nếu bạn chưa sửa)"); } catch (e) { say(e.message, false); }
    }));
    const f = input("file", "", { accept: ".json,application/json" });
    f.addEventListener("change", function () {
      const file = f.files[0]; if (!file) return;
      if (file.size > 20 * 1024 * 1024) { say("File quá lớn.", false); return; }
      file.text().then(function (t) { try { setPending(Store.parseImport(t), "file " + file.name); } catch (e) { say(e.message, false); } });
    });
    c.appendChild(acts); c.appendChild(field("…hoặc từ file .json (bản cũ: Setting > Soạn câu hỏi > Xuất file)", f));
    const out = h("div"); out.id = "pending"; c.appendChild(out);
    el.appendChild(c);

    const bc = h("div", "card"); bc.style.marginTop = "14px";
    bc.appendChild(h("h2", "", "Sao lưu từ server"));
    bc.appendChild(h("p", "note", "Tải toàn bộ câu hỏi (kèm đáp án), vòng quay, cài đặt về máy. File này chứa đáp án đúng, đừng đưa lên repo công khai."));
    bc.appendChild(btn("Tải bản sao lưu (.json)", "btn btn-secondary", async function () {
      const r = await adm("admin_export"); if (!r) return;
      const blob = new Blob([JSON.stringify(r)], { type: "application/json" }), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "quizwheel-backup-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }));
    el.appendChild(bc);
    if (pending) showPending();
  }
  function setPending(parsed, from) { pending = { d: parsed, from: from }; showPending(); }
  function showPending() {
    const out = $("#pending"); out.textContent = "";
    const d = pending.d;
    out.appendChild(h("h3", "", "Sắp nạp từ " + pending.from));
    out.appendChild(h("pre", "preview", summarize(d) || "Không có gì để nạp."));
    const a = h("div", "form-actions");
    a.append(btn("Nạp lên server", "btn btn-primary", async function () {
      if (!(await UI.confirm("Nạp dữ liệu này lên server? Phần có trong tóm tắt sẽ ghi đè phần đang có."))) return;
      const data = { questions: d.questions, wheels: d.wheels };
      if (d.settings) data.settings = d.settings;
      if (typeof d.loseImage === "string") data.loseImage = d.loseImage;
      const r = await adm("admin_import", { p_data: data });
      if (r) { pending = null; await loadAll(); renderData(); say("Đã nạp xong (" + r.questions + " câu hỏi). Xem lại ở các tab Câu hỏi và Vòng quay.", true); }
    }), btn("Hủy", "btn btn-secondary", function () { pending = null; renderData(); }));
    out.appendChild(a);
  }

  window.addEventListener("beforeunload", function (e) { if (KEY && (dirty.questions || dirty.wheel)) { e.preventDefault(); e.returnValue = ""; } });
  document.addEventListener("DOMContentLoaded", function () {
    $("#login-form").addEventListener("submit", login);
    $("#btn-out").addEventListener("click", function () { logout(""); });
    if (!Api.configured) { $("#login-err").textContent = ERR.config; return; }
    Api.call("admin_trust_get").then(function (r) { $("#trust-row").hidden = !(r && r.ok && r.enabled); });
    autoLogin();
  });
})();
