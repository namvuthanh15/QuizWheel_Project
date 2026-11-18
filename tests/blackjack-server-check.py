# Kiểm tra chế độ SERVER của Blackjack (M6) bằng Chromium/Playwright + máy chủ GIẢ LẬP (tests/bj_fake_server.py, cài lại hợp đồng của sql/12-blackjack.sql).
# KHÔNG chạy SQL thật. Chạy: python3 tests/blackjack-server-check.py   (in PASS/FAIL, thoát mã 1 nếu có FAIL)
import os, sys, json, re, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bj_fake_server import FakeBJ

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
def session(b, bj, viewport=None, reduced=False):
    ctx = b.new_context(viewport=viewport or {"width": 1280, "height": 900}, reduced_motion="reduce" if reduced else "no-preference")
    def rpc(route):
        fn = route.request.url.split("/rpc/")[-1].split("?")[0]
        if fn == "api_state": body = {"ok": True, "player": PLAYER, "active": None, "pendingSpin": None, "pendingBag": None}
        elif fn == "api_config": body = {"ok": True, "bjEnabled": bj.enabled}
        elif fn == "api_login": body = {"ok": True, "token": "t"}
        elif fn.startswith("api_bj_") or fn == "api_history": body = bj.handle(fn, json.loads(route.request.post_data or "{}"))
        else: body = {"ok": True}
        route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(body))
    ctx.route(re.compile(r"https://[a-z0-9-]+\.supabase\.co/rest/v1/rpc/.*"), rpc)
    ctx.route(re.compile(r"https://fonts\.(googleapis|gstatic)\.com/.*"), lambda r: r.abort())
    ctx.add_init_script("try { localStorage.setItem('quizwheel.v2.token', 't'); } catch (e) {}")
    pg = ctx.new_page(); errs = []; dialogs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text else None)
    return ctx, pg, errs, dialogs

def open_bj(pg, dialogs=None, accept=True):
    def on_dialog(d):
        if dialogs is not None: dialogs.append(d.message)
        d.accept() if accept else d.dismiss()
    pg.on("dialog", on_dialog)
    pg.goto(URL)
    pg.wait_for_function("() => window.Blackjack && document.getElementById('btn-blackjack')")
    pg.wait_for_timeout(400)
    pg.evaluate("() => Blackjack.setSpeed(3)")
    pg.evaluate("() => document.getElementById('btn-blackjack').click()")
    pg.wait_for_function("() => !document.getElementById('screen-blackjack').hidden")
def idle(pg): pg.wait_for_function("() => !Blackjack.isBusy()", timeout=25000)
def txt(pg, ref): return pg.evaluate("(r) => { const e = document.querySelector('[data-ref=' + r + ']'); return e ? e.textContent : null; }", ref)
def wait_bal(pg, s): pg.wait_for_function("(s) => document.querySelector('[data-ref=bal]').textContent === s", arg=s, timeout=8000)
def phase(pg): return pg.evaluate("() => Blackjack.getState().phase")
def deal(pg): pg.click("[data-act=new]"); pg.wait_for_function("() => Blackjack.isBusy() || Blackjack.getState().phase !== 'IDLE'"); idle(pg)

with sync_playwright() as p:
    b = p.chromium.launch()

    # ===== A. Mở màn hình: số dư, thanh cược ¼..toàn bộ, độ khó =====
    bj = FakeBJ(10.0); ctx, pg, errs, dl = session(b, bj); open_bj(pg, dl)
    wait_bal(pg, "10K")
    rng = pg.evaluate("() => { const r = document.querySelector('[data-ref=betRange]'); return [r.min, r.max, r.value, r.disabled]; }")
    check(rng[0] == "25" and rng[1] == "100" and rng[2] == "25" and rng[3] is False, "thanh cược: từ ¼ số dư (2,5K) đến hết (10K), bước 0,1K %s" % rng)
    check(txt(pg, "betVal") == "2,5K", "giá trị cược hiển thị kiểu Việt: %s" % txt(pg, "betVal"))
    check(pg.evaluate("() => [document.querySelectorAll('[data-ref=diffBar] i').length, document.querySelectorAll('[data-ref=diffBar] i.on').length]") == [5, 1], "thanh độ khó: 5 bậc, đang ở bậc 1 (không hiện phần trăm)")
    check("%" not in pg.evaluate("() => document.querySelector('[data-ref=betBox]').textContent"), "bảng cược không lộ tỉ lệ %")
    check(pg.locator("[data-act=new]").is_enabled(), "nút Chia bài bật khi có số dư")
    check(bj.calls.count("api_bj_state") == 1 and "api_bj_start" not in bj.calls, "mở màn hình chỉ gọi api_bj_state")

    # ===== B. Thắng thường: +1× cược, số dư cập nhật =====
    bj.script = ["spades-10", "hearts-10", "spades-9", "hearts-7"]
    deal(pg)
    check(phase(pg) == "PLAYER_TURN" and pg.evaluate("() => Blackjack.getState().dealer.cards[1].hidden === true"), "chia theo bài server: lượt người chơi, lá úp nhà cái vẫn úp")
    check(txt(pg, "bal") == "7,5K", "tiền cược trừ ngay khi chia (10K - 2,5K): %s" % txt(pg, "bal"))
    check(pg.evaluate("() => document.querySelector('[data-ref=betRange]').disabled"), "đang chơi: thanh cược khóa")
    check(not any("hearts-7" in str(v) for fn, v in bj.params), "(server giữ lá úp: trình duyệt chưa nhận)")
    pg.click("[data-act=stand]"); idle(pg)
    check(txt(pg, "resultText") == "Bạn thắng!" and txt(pg, "resultDelta") == "+2,5K", "kết quả thắng + dòng tiền: %s / %s" % (txt(pg, "resultText"), txt(pg, "resultDelta")))
    wait_bal(pg, "12,5K"); check(True, "số dư sau ván thắng = 12,5K (từ server)")
    check(bj.calls.count("api_bj_stand") == 1 and pg.evaluate("() => Blackjack.getState().dealer.cards.map(c => c.id).join()") == "hearts-10,hearts-7", "lá úp thật lộ ra khi STAND: hearts-7")
    check(pg.evaluate("() => document.querySelector('[data-ref=diffBar]').querySelectorAll('i.on').length") == 2, "thắng 1 ván: độ khó lên bậc 2")

    # ===== C. Blackjack tự nhiên: +1,5× =====
    bj.script = ["spades-A", "hearts-9", "spades-K", "hearts-7"]
    pg.evaluate("() => document.querySelector('[data-ref=betRange]').value = 31; document.querySelector('[data-ref=betRange]').dispatchEvent(new Event('input', {bubbles: true}))")
    check(txt(pg, "betVal") == "3,1K" and bj.balance == 12.5, "kéo thanh cược lên 3,1K")
    deal(pg)
    check(txt(pg, "resultText") == "Blackjack! Bạn thắng!" and txt(pg, "resultDelta") == "+4,65K", "Blackjack tự nhiên trả 1,5×: %s" % txt(pg, "resultDelta"))
    wait_bal(pg, "17,15K"); check(abs(bj.balance - 17.15) < 1e-9 and bj.params[-2][1]["p_bet"] == 3.1, "số dư 12,5 + 4,65 = 17,15K; bet gửi lên server = 3,1")

    # ===== D. Quá 21: mất cược =====
    bj.script = ["spades-10", "hearts-10", "spades-6", "hearts-7", "clubs-K"]
    deal(pg); pg.click("[data-act=hit]"); idle(pg)
    check(txt(pg, "resultText") == "Bạn quá 21" and txt(pg, "resultDelta") == "−4,2K", "quá 21 (cược tự nâng lên mức tối thiểu ¼ số dư mới = 4,2K): %s / %s" % (txt(pg, "resultText"), txt(pg, "resultDelta")))
    wait_bal(pg, "12,95K"); check(pg.evaluate("() => Blackjack.getState().dealer.cards.length") == 2 and pg.evaluate("() => !Blackjack.getState().dealer.holeHidden"), "bust: lá úp được lật, nhà cái không rút thêm")

    # ===== E. Đủ 21 thì tự dừng bài; thắng =====
    bj.script = ["spades-10", "hearts-9", "spades-5", "hearts-7", "clubs-6", "clubs-2"]
    n_stand = bj.calls.count("api_bj_stand")
    deal(pg); pg.click("[data-act=hit]"); idle(pg)
    check(bj.calls.count("api_bj_stand") == n_stand + 1 and txt(pg, "resultText") == "Bạn thắng!" and phase(pg) == "ROUND_COMPLETE", "đạt 21 -> tự dừng bài, nhà cái rút 2 (16 -> 18), người chơi thắng")

    # ===== F. Không có lỗi JS =====
    check(not errs, "không lỗi JS/console (nhóm A-E): %s" % errs[:3])
    ctx.close()

    # ===== G. Thoát giữa ván: hỏi xác nhận; đồng ý -> bỏ ván = thua =====
    bj = FakeBJ(10.0); ctx, pg, errs, dl = session(b, bj); open_bj(pg, dl); wait_bal(pg, "10K")
    bj.script = ["spades-10", "hearts-10", "spades-9", "hearts-7"]; deal(pg)
    pg.click("[data-act=exit]"); pg.wait_for_function("() => !document.getElementById('screen-home').hidden")
    pg.wait_for_function("() => true"); pg.wait_for_timeout(300)
    check(len(dl) == 1 and "thua" in dl[0], "thoát giữa ván: hiện hỏi xác nhận (%s)" % dl[:1])
    check(bj.calls.count("api_bj_abandon") == 1 and bj.rows[0]["outcome"] == "abandoned" and bj.balance == 7.5 and bj.game is None, "đồng ý thoát: server tính thua (mất 2,5K), không còn ván mở")
    ctx.close()
    # từ chối -> ở lại
    bj = FakeBJ(10.0); ctx, pg, errs, dl = session(b, bj); open_bj(pg, dl, accept=False); wait_bal(pg, "10K")
    bj.script = ["spades-10", "hearts-10", "spades-9", "hearts-7"]; deal(pg)
    pg.click("[data-act=exit]"); pg.wait_for_timeout(400)
    check(pg.evaluate("() => !document.getElementById('screen-blackjack').hidden") and "api_bj_abandon" not in bj.calls and phase(pg) == "PLAYER_TURN", "không đồng ý thoát: ván tiếp tục, server không bị gọi abandon")
    # xong ván rồi thoát -> không hỏi
    pg.click("[data-act=stand]"); idle(pg); n = len(dl); pg.click("[data-act=exit]"); pg.wait_for_function("() => !document.getElementById('screen-home').hidden")
    check(len(dl) == n and "api_bj_abandon" not in bj.calls, "ván đã kết toán: thoát không hỏi, không abandon")
    ctx.close()

    # ===== H. Điều hướng đi nơi khác giữa ván: server tự được báo bỏ ván =====
    bj = FakeBJ(10.0); ctx, pg, errs, dl = session(b, bj); open_bj(pg, dl); wait_bal(pg, "10K")
    bj.script = ["spades-10", "hearts-10", "spades-9", "hearts-7"]; deal(pg)
    pg.evaluate("() => document.getElementById('btn-setting') && document.getElementById('btn-setting').click()")
    pg.evaluate("() => document.querySelector('[data-nav=home]') && document.querySelector('[data-nav=home]').click()")
    pg.evaluate("() => document.querySelector('[data-nav=settings]') ? 0 : 0")
    pg.evaluate("() => Blackjack.stop()"); pg.wait_for_timeout(300)
    check(bj.rows[0]["outcome"] == "abandoned" and bj.game is None, "Blackjack.stop() giữa ván: abandon gửi lên server")
    ctx.close()

    # ===== I. Ván dở còn trên server khi mở lại (tải lại trang) -> tính thua + thông báo =====
    bj = FakeBJ(10.0); bj.script = ["spades-10", "hearts-10", "spades-9", "hearts-7"]; bj.handle("api_bj_start", {"p_bet": 2.5})
    ctx, pg, errs, dl = session(b, bj); open_bj(pg, dl); wait_bal(pg, "7,5K"); pg.wait_for_timeout(300)
    check(bj.rows[0]["outcome"] == "abandoned" and bj.game is None, "mở màn hình khi server còn ván dở: ván cũ bị tính thua")
    check("tính thua" in (txt(pg, "msg") or ""), "hiện thông báo: %s" % txt(pg, "msg"))
    ctx.close()

    # ===== J. Lỗi mạng giữa ván: bàn giữ nguyên, nút không kẹt, thử lại được =====
    bj = FakeBJ(10.0); ctx, pg, errs, dl = session(b, bj); open_bj(pg, dl); wait_bal(pg, "10K")
    bj.script = ["spades-10", "hearts-10", "spades-6", "hearts-7", "clubs-2"]; deal(pg)
    bj.fail["api_bj_hit"] = "network"; pg.click("[data-act=hit]"); idle(pg)
    check(phase(pg) == "PLAYER_TURN" and pg.evaluate("() => Blackjack.getState().player.cards.length") == 2 and pg.locator("[data-act=hit]").is_enabled(), "HIT lỗi mạng: bàn giữ nguyên, nút còn dùng được")
    del bj.fail["api_bj_hit"]; pg.click("[data-act=hit]"); idle(pg)
    check(pg.evaluate("() => Blackjack.getState().player.cards.length") == 3, "bỏ lỗi mạng, thử lại: rút được lá")
    check(not errs, "không lỗi JS/console (nhóm J): %s" % errs[:3])
    ctx.close()

    # ===== K. Server trả kết quả lệch engine: coi là lỗi đồng bộ, tải lại số dư =====
    bj = FakeBJ(10.0); ctx, pg, errs, dl = session(b, bj); open_bj(pg, dl); wait_bal(pg, "10K")
    bj.script = ["spades-10", "hearts-10", "spades-9", "hearts-7"]; deal(pg)
    bj.fail["api_bj_stand"] = "wrong_outcome"; pg.click("[data-act=stand]"); idle(pg); pg.wait_for_timeout(500)
    check("đồng bộ" in (txt(pg, "msg") or "") and phase(pg) == "IDLE" and txt(pg, "bal") == "12,5K", "lệch kết quả: báo lỗi đồng bộ, dọn bàn, số dư lấy lại từ server (%s / %s)" % (txt(pg, "msg"), txt(pg, "bal")))
    check(pg.locator("[data-act=new]").is_enabled(), "sau lỗi đồng bộ vẫn chia ván mới được")
    ctx.close()

    # ===== L. Hết tiền / tắt Blackjack =====
    bj = FakeBJ(0.05); ctx, pg, errs, dl = session(b, bj); open_bj(pg, dl); wait_bal(pg, "0,05K"); pg.wait_for_timeout(200)
    check(pg.locator("[data-act=new]").is_disabled() and pg.evaluate("() => document.querySelector('[data-ref=betRange]').disabled") and "Số dư chưa đủ" in (txt(pg, "msg") or ""), "số dư < 0,1K: không cho chia, có thông báo")
    ctx.close()
    bj = FakeBJ(10.0, enabled=False); ctx, pg, errs, dl = session(b, bj)
    pg.goto(URL); pg.wait_for_function("() => window.Blackjack"); pg.wait_for_timeout(600)
    check(pg.evaluate("() => document.getElementById('btn-blackjack').hidden"), "host tắt Blackjack: nút ở trang chủ bị ẩn")
    pg.evaluate("() => Blackjack.open()"); pg.wait_for_timeout(500)
    check(pg.locator("[data-act=new]").is_disabled() and "tạm tắt" in (txt(pg, "msg") or ""), "mở thẳng khi đang tắt: nút Chia bài khóa + thông báo")
    ctx.close()

    # ===== M. Bấm dồn Chia bài: chỉ một lần gọi server =====
    bj = FakeBJ(10.0); ctx, pg, errs, dl = session(b, bj); open_bj(pg, dl); wait_bal(pg, "10K")
    pg.evaluate("() => { const b = document.querySelector('[data-act=new]'); b.click(); b.click(); b.click(); }"); idle(pg)
    check(bj.calls.count("api_bj_start") == 1, "bấm Chia bài 3 lần liên tiếp: server chỉ nhận 1 lần (%d)" % bj.calls.count("api_bj_start"))
    ctx.close()

    # ===== N. Ngôn ngữ + khung luật + lịch sử =====
    bj = FakeBJ(10.0); ctx, pg, errs, dl = session(b, bj); open_bj(pg, dl); wait_bal(pg, "10K")
    pg.evaluate("() => I18n.set('en')")
    check(txt(pg, "betVal") == "2.5K" and pg.locator("[data-act=new]").inner_text() == "Deal", "English: 2.5K / Deal (%s)" % txt(pg, "betVal"))
    check(not pg.locator("[data-ref=rules]").is_visible(), "khung luật mặc định ẩn")
    pg.wait_for_timeout(900)   # đổi ngôn ngữ vẽ lại chữ (dòng trạng thái có thể đổi số dòng): đợi ổn định rồi mới đo
    pos0 = pg.evaluate("() => { const r = document.querySelector('[data-act=new]').getBoundingClientRect(), q = document.querySelector('[data-ref=betBox]').getBoundingClientRect(); return [Math.round(r.top + scrollY), q.height]; }")
    pg.evaluate("() => document.querySelector('[data-act=rules]').click()")   # bấm bằng JS: chuột thật của Playwright có thể tự cuộn trang vài px làm sai phép đo
    check(pg.locator("[data-ref=rules]").is_visible() and "rises as you keep winning" in txt(pg, "rules") and "reloading counts as a loss" in txt(pg, "rules"), "bấm Luật: hiện luật ngắn, nói rõ càng thắng càng khó và thoát = thua")
    check(pg.locator("[data-ref=rules] li").count() == 4 and len(txt(pg, "rules")) < 330, "khung luật gọn: 4 dòng, dưới 330 ký tự (%d)" % len(txt(pg, "rules")))
    pg.wait_for_timeout(300)
    pos1 = pg.evaluate("() => { const r = document.querySelector('[data-act=new]').getBoundingClientRect(), q = document.querySelector('[data-ref=betBox]').getBoundingClientRect(); return [Math.round(r.top + scrollY), q.height]; }")
    check(abs(pos0[0] - pos1[0]) <= 1 and pos0[1] == pos1[1], "khung luật nổi: nút Chia bài và bảng cược KHÔNG bị xô khi mở luật %s -> %s" % (pos0, pos1))
    check(pg.evaluate("() => document.querySelector('[data-act=rules]').getAttribute('aria-expanded')") == "true", "nút Luật báo aria-expanded=true khi mở")
    pg.keyboard.press("Escape"); check(not pg.locator("[data-ref=rules]").is_visible(), "nhấn Esc: đóng khung luật")
    pg.click("[data-act=rules]"); pg.mouse.click(5, 300); check(not pg.locator("[data-ref=rules]").is_visible(), "bấm ra ngoài: đóng khung luật")
    pg.click("[data-act=rules]"); pg.click("[data-act=rules]"); check(not pg.locator("[data-ref=rules]").is_visible(), "bấm nút Luật lần nữa: đóng")
    pg.click("[data-act=rules]"); pg.evaluate("() => document.querySelector('[data-ref=betRange]').focus()"); pg.click("[data-ref=betVal]"); check(not pg.locator("[data-ref=rules]").is_visible(), "bấm vào chỗ khác của bảng cược: đóng khung luật")
    pg.evaluate("() => I18n.set('vi')")
    bj.script = ["spades-10", "hearts-10", "spades-9", "hearts-7"]; deal(pg); pg.click("[data-act=stand]"); idle(pg)
    pg.evaluate("() => document.querySelector('[data-act=exit]').click()"); pg.wait_for_function("() => !document.getElementById('screen-home').hidden")
    pg.evaluate("() => document.getElementById('btn-start').click()"); pg.wait_for_function("() => !document.getElementById('screen-levels').hidden")
    pg.evaluate("() => document.querySelector('[data-nav=history]') && document.querySelector('[data-nav=history]').click()")
    pg.wait_for_function("() => !document.getElementById('screen-history').hidden", timeout=5000)
    pg.wait_for_function("() => document.querySelectorAll('#screen-history .hist-item').length >= 1", timeout=5000)
    row = pg.evaluate("() => document.querySelector('#screen-history .hist-item').textContent")
    check("Blackjack" in row and "Thắng" in row and "+2.5K" in row, "Lịch sử người chơi hiện ván Blackjack: %s" % row[-40:])
    ctx.close()

    # ===== O. Điện thoại: bảng cược không tràn ngang =====
    bj = FakeBJ(10.0); ctx, pg, errs, dl = session(b, bj, viewport={"width": 360, "height": 740}); open_bj(pg, dl); wait_bal(pg, "10K")
    pg.click("[data-act=rules]")
    ov = pg.evaluate("() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, box: (() => { const r = document.querySelector('[data-ref=betBox]').getBoundingClientRect(); return [r.left, r.right]; })() })")
    check(ov["sw"] <= ov["cw"] and ov["box"][0] >= 0 and ov["box"][1] <= ov["cw"], "360px: bảng cược + khung luật không tràn ngang %s" % ov)
    ctx.close()

    # ===== P. 80 ván ngẫu nhiên qua giao diện thật: engine của trình duyệt luôn khớp server, số dư luôn khớp =====
    # (mỗi ván nạp lại 1000K và mở lại màn hình, vì cược tối thiểu = ¼ số dư nên chơi liên tục sẽ hết tiền rất nhanh)
    bj = FakeBJ(1000.0); ctx, pg, errs, dl = session(b, bj, reduced=True); open_bj(pg, dl); wait_bal(pg, "1000K")
    outs = {}; bad = 0; hits = 0
    for i in range(80):
        bj.balance = 1000.0; pg.evaluate("() => Blackjack.open()"); wait_bal(pg, "1000K")
        deal(pg)
        guard = 0
        while phase(pg) == "PLAYER_TURN" and guard < 8:
            guard += 1
            sc = pg.evaluate("() => Blackjack.getState().player.score.total")
            if sc < 15 + (i % 3): pg.click("[data-act=hit]"); idle(pg); hits += 1
            else: break
        if phase(pg) == "PLAYER_TURN": pg.click("[data-act=stand]"); idle(pg)
        pg.wait_for_function("() => Blackjack.getState().phase === 'ROUND_COMPLETE'", timeout=8000)
        pg.wait_for_function("(v) => parseFloat(document.querySelector('[data-ref=bal]').textContent.replace(',', '.')) === v", arg=bj.balance, timeout=5000)
        if abs((bj.balance - 1000.0) - bj.rows[0]["reward"]) > 1e-6: bad += 1
        r = txt(pg, "resultText"); outs[r] = outs.get(r, 0) + 1
    check(not errs, "80 ván ngẫu nhiên: không lỗi JS/đồng bộ (%d HIT, kết quả %s) %s" % (hits, outs, errs[:2]))
    check(bad == 0 and bj.game is None and bj.calls.count("api_bj_start") == 80, "80 ván: mỗi ván số dư = 1000 + tiền thắng/thua của server, không còn ván mở")
    ctx.close()
    b.close()

print("\nTỔNG: %d lỗi" % len(fails))
for f in fails: print(" -", f)
sys.exit(1 if fails else 0)
