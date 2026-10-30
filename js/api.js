// api.js – nói chuyện với Supabase qua các hàm api_* (xem 01-schema.sql). Không dùng thư viện ngoài, chỉ fetch.
// Server giữ đáp án, lượt chơi, kết quả quay. Trình duyệt chỉ giữ "token phiên" (không phải PIN).
(function () {
  const KEY_T = "quizwheel.v2.token";
  const cfg = window.QUIZWHEEL_CONFIG || {};
  const BASE = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(BASE) && !!cfg.SUPABASE_KEY;
  let token = "";
  try { token = localStorage.getItem(KEY_T) || ""; } catch (e) { token = ""; }

  function setToken(t) {
    token = t || "";
    try { if (token) localStorage.setItem(KEY_T, token); else localStorage.removeItem(KEY_T); } catch (e) {}
  }

  // Gọi 1 hàm trên server. Luôn trả về object { ok, ... }; lỗi mạng -> { ok:false, error:"network" }
  async function rpc(fn, params) {
    if (!configured) return { ok: false, error: "config" };
    let res;
    try {
      res = await fetch(BASE + "/rest/v1/rpc/" + fn, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": cfg.SUPABASE_KEY },
        body: JSON.stringify(params || {})
      });
    } catch (e) { return { ok: false, error: "network" }; }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data || typeof data !== "object") return { ok: false, error: "server", status: res.status };
    if (data.ok === false && data.error === "auth") setToken("");   // phiên hết hạn / bị khóa
    return data;
  }

  // Mã lỗi -> câu thông báo (đa ngôn ngữ)
  function errText(code) {
    const known = ["invalid", "locked", "disabled", "network", "config", "auth", "no_turns", "free_used", "pool", "active", "pending_spin",
                   "bad_count", "bad_level", "stale", "no_play", "not_active", "no_wheel", "wheel_unavailable"];
    return I18n.t("err." + (known.indexOf(code) >= 0 ? code : "generic"));
  }

  window.Api = {
    errText: errText, call: rpc,
    configured: configured,
    hasToken: function () { return !!token; },
    config: function () { return rpc("api_config"); },
    async login(name, pin) {
      const r = await rpc("api_login", { p_name: name, p_pin: pin });
      if (r.ok && r.token) setToken(r.token);
      return r;
    },
    async logout() { const t = token; setToken(""); if (t) await rpc("api_logout", { p_token: t }); },
    state: function () { return rpc("api_state", { p_token: token }); },
    start: function (level, count) { return rpc("api_start", { p_token: token, p_level: level, p_count: count || 0 }); },
    question: function (playId) { return rpc("api_question", { p_token: token, p_play: playId }); },
    answer: function (playId, index, choice, parts) {
      return rpc("api_answer", { p_token: token, p_play: playId, p_index: index, p_choice: choice === undefined ? null : choice, p_parts: parts || null });
    },
    spin: function (playId) { return rpc("api_spin", { p_token: token, p_play: playId }); },
    history: function () { return rpc("api_history", { p_token: token }); }
  };
})();
