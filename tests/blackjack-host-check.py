# Kiểm tra phần HOST của Blackjack (M7) trên host.html bằng Chromium/Playwright + máy chủ GIẢ LẬP (tests/bj_fake_server.py). KHÔNG chạy SQL thật.
# Chạy: python3 tests/blackjack-host-check.py   (in PASS/FAIL, thoát mã 1 nếu có FAIL)
import os, sys, json, re, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bj_fake_server import FakeBJ

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
_srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(_Quiet, directory=ROOT))
threading.Thread(target=_srv.serve_forever, daemon=True).start()
URL = "http://127.0.0.1:%d/host.html" % _srv.server_address[1]
fails = []
def check(ok, msg):
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok: fails.append(msg)

def session(b, bj, viewport=None):
    ctx = b.new_context(viewport=viewport or {"width": 1280, "height": 900})
    def rpc(route):
        fn = route.request.url.split("/rpc/")[-1].split("?")[0]
        h = getattr(bj, fn, None)
        body = bj.handle(fn, json.loads(route.request.post_data or "{}")) if h else {"ok": True}
        route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(body))
    ctx.route(re.compile(r"https://[a-z0-9-]+\.supabase\.co/rest/v1/rpc/.*"), rpc)
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text else None)
    pg.goto(URL); pg.fill("#key", "secret-host-pass"); pg.click("#login-go")
    pg.wait_for_function("() => !document.getElementById('sec-app').hidden", timeout=8000)
    return ctx, pg, errs
def tab(pg, name): pg.click("#tabs button:has-text('%s')" % name)

with sync_playwright() as p:
    b = p.chromium.launch()

    # ===== Tab Cài đặt: thẻ Blackjack =====
    bj = FakeBJ(10.0); bj.wins = 2; bj.rate = 36.0
    ctx, pg, errs = session(b, bj); tab(pg, "Cài đặt")
    card = pg.locator(".card:has(h2:has-text('Blackjack'))")
    check(card.count() == 1 and card.locator("input[type=checkbox]").is_checked(), "thẻ Blackjack có công tắc, đang bật")
    chain = card.locator("input[type=text]")
    check(chain.input_value() == "50, 40, 33, 27, 22", "chuỗi mặc định hiển thị: %s" % chain.input_value())
    check("Server chưa có Blackjack" not in card.inner_text(), "server có Blackjack: không hiện cảnh báo chạy SQL")
    # lưu hợp lệ
    chain.fill("55, 45.5; 30 22"); card.locator("input[type=checkbox]").uncheck(); card.locator("button:has-text('Lưu Blackjack')").click()
    pg.wait_for_function("() => document.querySelector('#msg').textContent.includes('Đã lưu Blackjack')", timeout=5000)
    check(bj.chain == [55, 45.5, 30, 22] and bj.enabled is False, "lưu: gửi đúng chuỗi [55, 45.5, 30, 22] và tắt Blackjack (%s, %s)" % (bj.chain, bj.enabled))
    pg.wait_for_timeout(200)
    check(pg.locator(".card:has(h2:has-text('Blackjack')) input[type=checkbox]").is_checked() is False and pg.locator(".card:has(h2:has-text('Blackjack')) input[type=text]").input_value() == "55, 45.5, 30, 22", "tải lại từ server: công tắc tắt, chuỗi mới")
    # chuỗi sai -> không gọi server
    n = bj.calls.count("admin_bj_config")
    for bad in ["", "abc", "50, 120", "-1", "1,2,3,4,5,6,7,8,9,10,11"]:
        pg.locator(".card:has(h2:has-text('Blackjack')) input[type=text]").fill(bad)
        pg.locator("button:has-text('Lưu Blackjack')").click(); pg.wait_for_timeout(100)
        ok = "không hợp lệ" in pg.inner_text("#msg") and bj.calls.count("admin_bj_config") == n
        check(ok, "chuỗi sai %r bị chặn ngay ở trang host, không gọi server" % bad)
    # bật lại
    pg.locator(".card:has(h2:has-text('Blackjack')) input[type=checkbox]").check(); pg.locator(".card:has(h2:has-text('Blackjack')) input[type=text]").fill("50,40")
    pg.locator("button:has-text('Lưu Blackjack')").click(); pg.wait_for_function("() => document.querySelector('#msg').textContent.includes('Đã lưu Blackjack')", timeout=5000)
    check(bj.enabled is True and bj.chain == [50, 40], "bật lại + chuỗi 2 bậc [50, 40]")

    # ===== Tab Người chơi: bậc + đặt lại =====
    tab(pg, "Người chơi")
    row = pg.locator("tr.prow").first
    check("Blackjack thắng 2" in row.inner_text(), "dòng người chơi hiện số ván Blackjack đã thắng (2)")
    check("36" not in row.inner_text(), "không lộ tỉ lệ hồi phục (36) trên bảng")
    row.locator("button.menu-btn").click()
    item = pg.locator(".menu-pop:visible .menu-item:has-text('Đặt lại độ khó')")
    check(item.count() == 1, "menu Thêm có mục Blackjack > Đặt lại độ khó")
    item.click(); pg.wait_for_selector("#modal-ok", state="visible"); pg.click("#modal-cancel"); pg.wait_for_timeout(150)
    check(bj.wins == 2 and "admin_bj_reset_wins" not in bj.calls, "bấm Hủy ở hộp xác nhận: không đổi gì")
    row.locator("button.menu-btn").click(); pg.locator(".menu-pop:visible .menu-item:has-text('Đặt lại độ khó')").click()
    pg.wait_for_selector("#modal-ok", state="visible"); pg.click("#modal-ok")
    pg.wait_for_function("() => document.querySelector('#msg').textContent.includes('Đã đặt lại')", timeout=5000)
    check(bj.wins == 0 and bj.rate is None and "Blackjack thắng" not in pg.locator("tr.prow").first.inner_text(), "xác nhận: bj_wins về 0, bj_rate bỏ, dòng người chơi không còn nhãn")

    # ===== Lịch sử host =====
    bj.script = ["spades-10", "hearts-10", "spades-9", "hearts-7"]; bj.handle("api_bj_start", {"p_bet": 2.5}); bj.handle("api_bj_stand", {})
    tab(pg, "Người chơi"); pg.locator("tr.prow").first.locator("button:has-text('Lịch sử')").click()
    pg.wait_for_selector(".hist-item", timeout=5000)
    t = pg.locator(".hist-item").first.inner_text()
    check("Blackjack" in t and "cược 2.5K" in t and "Thắng" in t and "+2.5K" in t, "lịch sử host: %s" % " | ".join(t.split("\n")))
    check(not errs, "không lỗi JS/console: %s" % errs[:2])
    ctx.close()

    # ===== Server chưa chạy 12-blackjack.sql: cảnh báo, không vỡ trang =====
    bj = FakeBJ(10.0)
    old = FakeBJ._admin_settings if hasattr(FakeBJ, "_admin_settings") else None
    ctx = b.new_context(); 
    def rpc(route):
        fn = route.request.url.split("/rpc/")[-1].split("?")[0]
        body = bj.handle(fn, json.loads(route.request.post_data or "{}")) if hasattr(bj, fn) else {"ok": True}
        if fn == "admin_settings": body = {k: v for k, v in body.items() if k not in ("bjEnabled", "bjChain")}
        if fn == "admin_players": body["players"][0].pop("bjWins", None); body["players"][0].pop("bjRate", None)
        route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(body))
    ctx.route(re.compile(r"https://[a-z0-9-]+\.supabase\.co/rest/v1/rpc/.*"), rpc); ctx.route(re.compile(r"https://fonts\..*"), lambda r: r.abort())
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.fill("#key", "x"); pg.click("#login-go"); pg.wait_for_function("() => !document.getElementById('sec-app').hidden", timeout=8000)
    tab(pg, "Cài đặt")
    check("Server chưa có Blackjack" in pg.locator(".card:has(h2:has-text('Blackjack'))").inner_text(), "server cũ: hiện hướng dẫn chạy sql/12-blackjack.sql")
    pg.locator("button:has-text('Lưu Blackjack')").click(); pg.wait_for_timeout(150)
    check("12-blackjack.sql" in pg.inner_text("#msg") and not bj.calls.count("admin_bj_config"), "server cũ: bấm Lưu Blackjack không gọi server, nhắc chạy SQL")
    check(not errs, "server cũ: không lỗi JS (%s)" % errs[:2])
    ctx.close()

    # ===== Điện thoại: thẻ Blackjack không tràn ngang =====
    bj = FakeBJ(10.0); ctx, pg, errs = session(b, bj, viewport={"width": 360, "height": 740}); tab(pg, "Cài đặt")
    ov = pg.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    check(ov[0] <= ov[1], "360px: tab Cài đặt không tràn ngang %s" % ov)
    ctx.close(); b.close()

print("\nTỔNG: %d lỗi" % len(fails))
for f in fails: print(" -", f)
sys.exit(1 if fails else 0)
