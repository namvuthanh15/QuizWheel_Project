# Kiểm tra tích hợp Blackjack vào QuizWheel (M4) bằng Chromium/Playwright, với máy chủ Supabase GIẢ LẬP (không gọi mạng thật).
# Chạy: python3 tests/blackjack-integration-check.py   (cần Playwright + Chromium). In PASS/FAIL, thoát mã 1 nếu có FAIL.
import os, sys, json, re, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bj_fake_server import FakeBJ   # máy chủ Blackjack giả lập (M6)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
_srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=ROOT))
threading.Thread(target=_srv.serve_forever, daemon=True).start()
URL = "http://127.0.0.1:%d/index.html" % _srv.server_address[1]
fails = []
def check(ok, msg):
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok: fails.append(msg)

PLAYER = {"name": "Nam", "turns": 3, "freeLeft": 1, "lixiPending": False, "impLocked": False, "gachaLeft": 1}
def make_ctx(b, logged_in=True, **kw):
    ctx = b.new_context(viewport=kw.pop("viewport", {"width": 1280, "height": 900}), **kw)
    state = {"auth": logged_in, "calls": [], "bj": FakeBJ(10.0)}
    def rpc(route):
        fn = route.request.url.split("/rpc/")[-1].split("?")[0]
        state["calls"].append(fn)
        if fn == "api_state":
            body = {"ok": True, "player": PLAYER, "active": None, "pendingSpin": None, "pendingBag": None} if state["auth"] else {"ok": False, "error": "auth"}
        elif fn == "api_login": state["auth"] = True; body = {"ok": True, "token": "t"}
        elif fn.startswith("api_bj_") or fn == "api_history": body = state["bj"].handle(fn, json.loads(route.request.post_data or "{}"))
        else: body = {"ok": True}
        route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(body))
    ctx.route(re.compile(r"https://[a-z0-9-]+\.supabase\.co/rest/v1/rpc/.*"), rpc)
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
    if logged_in: ctx.add_init_script("try { localStorage.setItem('quizwheel.v2.token', 't'); } catch (e) {}")
    return ctx, state

def page(ctx):
    pg = ctx.new_page(); errs = []; failed = []
    pg.on("dialog", lambda d: d.accept())   # thoát giữa ván server hỏi xác nhận (bj.confirmExit)
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text else None)
    pg.on("requestfailed", lambda r: failed.append(r.url) if r.url.startswith("http://127.0.0.1") else None)
    pg.goto(URL)
    pg.evaluate("() => { window.__unhandled = 0; window.addEventListener('unhandledrejection', () => window.__unhandled++); }")
    return pg, errs, failed

def visible_screen(pg):
    return pg.evaluate("() => [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id.replace('screen-', ''))")
def wait_screen(pg, name): pg.wait_for_function("(n) => { const e = document.getElementById('screen-' + n); return e && !e.hidden; }", arg=name, timeout=8000)
def wait_idle(pg): pg.wait_for_function("() => !Blackjack.isBusy()", timeout=20000)
def bj_cards(pg): return pg.evaluate("() => document.querySelectorAll('#bj-mount .bj-card[data-key]').length")
def bj_anims(pg): return pg.evaluate("() => document.querySelector('.bj-table') ? document.querySelector('.bj-table').getAnimations({subtree:true}).filter(a => a.playState === 'running').length : 0")

with sync_playwright() as p:
    b = p.chromium.launch()

    # ===== 0. Tĩnh: file nạp đúng thứ tự, nút Start còn nguyên =====
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    order = [m for m in re.findall(r'<script src="(js/[^"]+)"', html)]
    idx = {s: i for i, s in enumerate(order)}
    chain = ["js/ui.js", "js/audio.js", "js/blackjack/blackjack-cards.js", "js/blackjack/blackjack-engine.js", "js/blackjack/blackjack-render.js", "js/blackjack/blackjack-animation.js", "js/blackjack/blackjack-audio.js", "js/blackjack/blackjack.js", "js/main.js"]
    check(all(c in idx for c in chain) and [idx[c] for c in chain] == sorted(idx[c] for c in chain), "thứ tự nạp script: ui, audio, cards, engine, render, animation, audio-bj, blackjack, main")
    check('id="btn-start"' in html and 'id="btn-setting"' in html and 'id="btn-blackjack"' in html, "trang chủ giữ nút Start + Setting, thêm nút Blackjack")
    check("css/blackjack.css" in html and "css/blackjack-animations.css" in html, "index.html nạp 2 file CSS Blackjack")
    check(re.search(r'NEED_LOGIN = \[[^\]]*"gacha", "blackjack"\]', open(os.path.join(ROOT, "js/main.js"), encoding="utf-8").read()) is not None, "NEED_LOGIN giữ nguyên các mục cũ, thêm \"blackjack\" ở cuối")
    vi = set(re.findall(r'"(bj\.[\w.]+|home\.blackjack)"\s*:', open(os.path.join(ROOT, "js/i18n.js"), encoding="utf-8").read()))
    src = open(os.path.join(ROOT, "js/i18n.js"), encoding="utf-8").read()
    dvi = src.split("  const DICT = {")[1]
    vi_part, en_part = dvi.split("    en: {")
    kv = set(re.findall(r'"((?:bj\.[\w.]+)|home\.blackjack)"\s*:', vi_part)); ke = set(re.findall(r'"((?:bj\.[\w.]+)|home\.blackjack)"\s*:', en_part))
    check(len(kv) >= 21 and kv == ke, "khóa i18n bj.* có đủ và khớp nhau ở vi/en (%d / %d)" % (len(kv), len(ke)))

    # ===== 1. Chưa đăng nhập: vào Blackjack bị chuyển sang đăng nhập =====
    ctx, st = make_ctx(b, logged_in=False); pg, errs, failed = page(ctx)
    wait_screen(pg, "login")
    pg.evaluate("() => { const x = document.createElement('button'); x.id = 'tmp-nav'; x.dataset.nav = 'blackjack'; document.body.appendChild(x); x.click(); }")
    pg.wait_for_timeout(300)
    check(visible_screen(pg) == ["login"], "chưa đăng nhập: vào Blackjack bị chuyển về đăng nhập (%s)" % visible_screen(pg))
    check(bj_cards(pg) == 0 and not pg.evaluate("() => Blackjack.getState()"), "chưa đăng nhập: Blackjack chưa được mở")
    ctx.close()

    # ===== 2. Đã đăng nhập: mở từ trang chủ, chơi, thoát =====
    ctx, st = make_ctx(b); pg, errs, failed = page(ctx)
    wait_screen(pg, "home")
    check(failed == [], "không có file cục bộ nào tải lỗi (404): %s" % failed)
    info = pg.evaluate("""() => { const q = id => document.getElementById(id), r = q('btn-blackjack').getBoundingClientRect(), s = q('btn-start').getBoundingClientRect(), g = q('btn-setting').getBoundingClientRect();
      return { txt: q('btn-blackjack').textContent, w: r.width, wStart: s.width, order: s.top < r.top && r.top < g.top, inView: r.bottom <= innerHeight } }""")
    check(info["txt"].strip() == "Blackjack" and abs(info["w"] - info["wStart"]) < 2 and info["order"], "nút Blackjack: chữ đúng, cùng bề rộng nút Start, nằm giữa Start và Setting (%s)" % info)
    pg.screenshot(path="/tmp/m4_home.png")
    pg.evaluate("() => { window.__bjsfx = []; const o = BlackjackAudio.play; BlackjackAudio.play = n => { window.__bjsfx.push(n); o(n); }; }")
    pg.click("#btn-blackjack"); wait_screen(pg, "blackjack")
    check(visible_screen(pg) == ["blackjack"] and pg.evaluate("() => Blackjack.getState().phase") == "IDLE", "mở từ trang chủ: màn Blackjack hiện, trạng thái IDLE")
    check(pg.evaluate("() => document.querySelector('.bj-title').textContent") == "Blackjack" and pg.locator("[data-act=new]").is_visible(), "bàn hiện đủ: tiêu đề + nút Chia bài")
    pg.click("[data-act=new]"); wait_idle(pg)
    ph = pg.evaluate("() => Blackjack.getState().phase")
    check(ph in ("PLAYER_TURN", "ROUND_COMPLETE") and bj_cards(pg) == 4, "bấm Chia bài trong QuizWheel: chia 4 lá (phase=%s)" % ph)
    sfx = pg.evaluate("() => window.__bjsfx")
    check("deal" in sfx and "land" in sfx, "hoạt ảnh phát tiếng Blackjack (%s)" % sorted(set(sfx)))
    pg.click("[data-act=exit]"); wait_screen(pg, "home")
    check(visible_screen(pg) == ["home"] and bj_cards(pg) == 0 and bj_anims(pg) == 0, "nút Thoát về trang chủ, bàn dọn sạch")
    check(pg.evaluate("() => !!document.getElementById('btn-start') && !document.getElementById('screen-home').hidden"), "trang chủ vẫn dùng được")
    # Start vẫn đi tới chọn mức
    pg.click("#btn-start"); wait_screen(pg, "levels")
    check(True, "nút Start vẫn mở màn chọn mức")
    pg.evaluate("() => document.querySelector('.nav-link, [data-nav=\"home\"]') && document.querySelector('[data-nav=\"home\"]').click()")
    wait_screen(pg, "home")

    # ===== 3. Thoát/điều hướng đi nơi khác giữa lúc chia bài =====
    pg.evaluate("() => { window.__bjsfx.length = 0; }")
    pg.click("#btn-blackjack"); wait_screen(pg, "blackjack")
    pg.click("[data-act=new]"); pg.wait_for_timeout(450)
    check(pg.evaluate("() => Blackjack.isBusy()"), "đang chia bài (busy)")
    pg.click("[data-act=exit]"); wait_screen(pg, "home")
    pg.wait_for_timeout(1800)
    check(bj_cards(pg) == 0 and bj_anims(pg) == 0 and not pg.evaluate("() => Blackjack.isBusy()"), "thoát giữa lúc chia: không lá nào hiện lại, không còn animation")
    # điều hướng sang Cài đặt (nút Setting) khi đang lật lá
    pg.click("#btn-blackjack"); wait_screen(pg, "blackjack")
    pg.evaluate("() => Blackjack.startNewRound({ deck: ['spades-K','hearts-9','clubs-5','clubs-7','diamonds-2','spades-3'] })"); wait_idle(pg)
    pg.click("[data-act=stand]"); pg.wait_for_timeout(1300)
    pg.evaluate("() => { const x = document.createElement('button'); x.dataset.nav = 'settings'; document.body.appendChild(x); x.click(); }")
    wait_screen(pg, "settings"); pg.wait_for_timeout(1500)
    check(bj_cards(pg) == 0 and bj_anims(pg) == 0 and pg.evaluate("() => Blackjack.getState().phase") == "IDLE", "điều hướng sang Cài đặt giữa lúc nhà cái chơi: hủy sạch, IDLE")
    # vào lại
    pg.evaluate("() => { const x = document.createElement('button'); x.dataset.nav = 'blackjack'; document.body.appendChild(x); x.click(); }")
    wait_screen(pg, "blackjack")
    check(bj_cards(pg) == 0 and pg.locator("[data-act=new]").is_visible() and not pg.evaluate("() => Blackjack.isBusy()"), "vào lại Blackjack: bàn trống, sẵn sàng")
    pg.click("[data-act=new]"); wait_idle(pg)
    check(bj_cards(pg) == 4 or pg.evaluate("() => Blackjack.getState().phase") == "ROUND_COMPLETE", "sau khi vào lại chơi bình thường")

    # ===== 4. Đổi ngôn ngữ khi đang mở =====
    pg.evaluate("() => Blackjack.open()")
    pg.evaluate("() => I18n.set('en')")
    t_en = pg.evaluate("() => ({ title: document.querySelector('.bj-title').textContent, exit: document.querySelector('[data-act=exit]').textContent, who: [...document.querySelectorAll('.bj-who')].map(e => e.textContent), nw: document.querySelector('[data-act=new]').textContent, msg: document.querySelector('[data-ref=msg]').textContent })")
    check(t_en["exit"] == "Exit" and t_en["who"] == ["Dealer", "You"] and t_en["nw"] == "Deal", "đổi sang English khi đang mở: nhãn đổi ngay (%s)" % t_en)
    pg.evaluate("() => Blackjack.startNewRound({ deck: ['spades-K','hearts-9','clubs-5','clubs-7','diamonds-2','spades-3'] })"); wait_idle(pg)
    check(pg.evaluate("() => document.querySelector('[data-ref=msg]').textContent") == "Your turn", "English: dòng trạng thái 'Your turn'")
    pg.evaluate("() => I18n.set('vi')")
    check(pg.evaluate("() => document.querySelector('[data-ref=msg]').textContent") == "Đến lượt bạn" and pg.evaluate("() => document.querySelector('[data-act=hit]').textContent") == "Rút bài", "đổi về tiếng Việt giữa ván: chữ đổi, ván không mất")
    pg.click("[data-act=stand]"); wait_idle(pg)
    pg.evaluate("() => I18n.set('en')")
    check(pg.evaluate("() => document.querySelector('[data-ref=resultText]').textContent") in ("You lose", "You win!", "Push"), "đổi ngôn ngữ khi đang hiện kết quả: banner đổi (%s)" % pg.evaluate("() => document.querySelector('[data-ref=resultText]').textContent"))
    pg.evaluate("() => I18n.set('vi')")

    # ===== 5. Âm thanh dùng chung thiết lập của QuizWheel =====
    r = pg.evaluate("""() => { let made = 0; const P = AudioContext.prototype, co = P.createOscillator, cb = P.createBufferSource;
      P.createOscillator = function () { made++; return co.apply(this, arguments); }; P.createBufferSource = function () { made++; return cb.apply(this, arguments); };
      const real = Settings.sound; Settings.sound = () => 0; BlackjackAudio.play('win'); BlackjackAudio.play('deal'); const muted = made;
      Settings.sound = () => 0.7; BlackjackAudio.play('win'); BlackjackAudio.play('deal'); BlackjackAudio.play('xyz');
      Settings.sound = real; P.createOscillator = co; P.createBufferSource = cb; return { muted: muted, after: made }; }""")
    check(r["muted"] == 0 and r["after"] >= 4, "tắt tiếng (Settings.sound=0): không phát gì; bật lại thì phát; tên lạ bị bỏ qua (%s)" % r)
    check(pg.evaluate("() => typeof Sfx.click === 'function' && typeof Sfx.wrong === 'function' && typeof Sfx.screen === 'function' && typeof Settings.sound === 'function'"), "API âm thanh cũ (Sfx, Settings) còn nguyên")
    pg.evaluate("() => Blackjack.stop()")
    check(errs == [] and pg.evaluate("() => window.__unhandled") == 0, "không lỗi console / unhandled rejection (nhóm 2-5): %s" % errs)
    ctx.close()

    # ===== 6. Đăng xuất khi đang ở Blackjack =====
    ctx, st = make_ctx(b); pg, errs, failed = page(ctx)
    wait_screen(pg, "home"); pg.click("#btn-blackjack"); wait_screen(pg, "blackjack")
    pg.click("[data-act=new]"); pg.wait_for_timeout(400)
    pg.evaluate("() => document.getElementById('btn-logout').click()")
    wait_screen(pg, "login"); pg.wait_for_timeout(1500)
    check(bj_cards(pg) == 0 and bj_anims(pg) == 0 and not pg.evaluate("() => Blackjack.isBusy()"), "đăng xuất giữa lúc chia: Blackjack dừng sạch")
    check(errs == [] and pg.evaluate("() => window.__unhandled") == 0, "không lỗi (nhóm 6): %s" % errs)
    ctx.close()

    # ===== 7. Điện thoại: không tràn ngang =====
    for vp in ({"width": 390, "height": 740}, {"width": 360, "height": 640}):
        ctx, st = make_ctx(b, viewport=vp); pg, errs, failed = page(ctx)
        wait_screen(pg, "home")
        ov1 = pg.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
        vis = pg.evaluate("() => { const r = document.getElementById('btn-blackjack').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }")
        pg.click("#btn-blackjack"); wait_screen(pg, "blackjack")
        pg.evaluate("() => Blackjack.startNewRound({ deck: ['spades-2','hearts-9','clubs-3','clubs-7','diamonds-2','spades-3','hearts-2','clubs-4','diamonds-3','spades-4'] })"); wait_idle(pg)
        for _ in range(4):
            if pg.locator("[data-act=hit]").is_enabled(): pg.click("[data-act=hit]"); wait_idle(pg)
        ov2 = pg.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
        pg.screenshot(path="/tmp/m4_mobile_%d.png" % vp["width"])
        check(not ov1 and vis and not ov2, "%dpx: trang chủ + bàn Blackjack không tràn ngang, nút trong màn hình" % vp["width"])
        ctx.close()

    b.close()

print("\nTỔNG: %d lỗi" % len(fails))
for f in fails: print(" -", f)
sys.exit(1 if fails else 0)
