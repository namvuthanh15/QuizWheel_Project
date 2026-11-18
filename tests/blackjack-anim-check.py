# Kiểm tra hoạt ảnh Blackjack (M3) bằng Chromium/Playwright. Chạy: python3 tests/blackjack-anim-check.py
# Không cần mạng. Dùng bộ bài chỉ định để kết quả xác định. Mọi mục in PASS/FAIL; thoát mã 1 nếu có FAIL.
import os, sys, json
from playwright.sync_api import sync_playwright

URL = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "blackjack-play.html"))
fails = []
def check(ok, msg):
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok: fails.append(msg)

def wait_idle(pg, timeout=20000):
    pg.wait_for_function("() => !Blackjack.isBusy()", timeout=timeout)

def new_page(b, **ctx):
    c = b.new_context(viewport={"width": 1280, "height": 900}, **ctx)
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type in ("error", "warning") else None)
    pg.goto(URL)
    # đếm "unhandled rejection"
    pg.evaluate("() => { window.__unhandled = 0; window.addEventListener('unhandledrejection', () => window.__unhandled++); }")
    return pg, errs

def start(pg, ranks):
    pg.evaluate("(r) => { window.__started = Blackjack.startNewRound({ deck: __deck(r) }); }", ranks)

def snap(pg):
    return pg.evaluate("""() => {
      const q = s => document.querySelector(s);
      const hand = h => [...document.querySelectorAll(h + ' > .bj-card')].map(c => ({ key: c.dataset.key, down: c.classList.contains('is-down'), face: !!c.dataset.id }));
      return { phase: Blackjack.getState().phase, busy: Blackjack.isBusy(),
        p: hand('[data-ref=pHand]'), d: hand('[data-ref=dHand]'),
        pScore: q('[data-ref=pScore]').hidden ? null : q('[data-ref=pScore]').textContent,
        dScore: q('[data-ref=dScore]').hidden ? null : q('[data-ref=dScore]').textContent,
        resultShown: !q('[data-ref=result]').hidden, resultText: q('[data-ref=resultText]').textContent,
        hitDis: q('[data-ref=hit]').disabled, standDis: q('[data-ref=stand]').disabled, newHidden: q('[data-ref=newRound]').hidden, newDis: q('[data-ref=newRound]').disabled,
        fx: q('.bj-table').dataset.fx || null, confetti: document.querySelectorAll('.bj-confetti').length,
        flying: document.querySelectorAll('.is-flying').length, running: document.querySelector('.bj-table').getAnimations({subtree:true}).filter(a => a.playState === 'running').length,
        leftover: document.querySelectorAll('.bj-fx').length };
    }""")

with sync_playwright() as p:
    b = p.chromium.launch()

    # ===== 1. Chia bài: thứ tự, lá úp, điểm không lộ sớm =====
    pg, errs = new_page(b)
    pg.evaluate("""() => {
      window.__order = [];
      const seen = new Set();
      new MutationObserver(() => {
        for (const c of document.querySelectorAll('.bj-hand > .bj-card')) {
          const side = c.parentElement.dataset.ref === 'pHand' ? 'P' : 'D';
          const k = side + ':' + c.dataset.key + ':' + (c.classList.contains('is-down') ? 'down' : 'up');
          if (!seen.has(c.dataset.key + side)) { seen.add(c.dataset.key + side); window.__order.push(k); }
        }
      }).observe(document.querySelector('.bj-table'), { childList: true, subtree: true });
      window.__scoreEarly = false;
      const t = setInterval(() => {
        const ps = document.querySelector('[data-ref=pScore]'), ds = document.querySelector('[data-ref=dScore]');
        if (Blackjack.getState().phase === 'DEALING' && (!ps.hidden || !ds.hidden)) window.__scoreEarly = true;
        window.__flying = Math.max(window.__flying || 0, document.getAnimations().length);
      }, 16);
      window.__t = t;
    }""")
    start(pg, ["K", "9", "5", "7", "2", "3"])  # P: K,5=15 (+2 = 17)  D: 9,7=16 -> rút 3 = 19
    pg.wait_for_timeout(100)
    s0 = snap(pg)
    check(s0["busy"] and s0["hitDis"] and s0["standDis"], "đang chia: nút HIT/STAND khóa, busy=true")
    wait_idle(pg)
    order = pg.evaluate("() => window.__order")
    check(len(order) == 4 and [o.split(":")[0] for o in order] == ["P", "D", "P", "D"], "thứ tự chia P,D,P,D (thực tế: %s)" % [o.split(":")[0] for o in order])
    check(order[3].startswith("D:dealer-hole") and order[3].endswith(":down"), "lá thứ 4 là lá úp của nhà cái")
    check(all(o.endswith(":up") for o in order[:3]), "ba lá đầu ngửa")
    check(not pg.evaluate("() => window.__scoreEarly"), "điểm không hiện trước khi chia xong")
    pg.evaluate("() => clearInterval(window.__t)")
    s1 = snap(pg)
    check(s1["phase"] == "PLAYER_TURN" and not s1["hitDis"] and not s1["standDis"], "chia xong -> PLAYER_TURN, HIT/STAND mở")
    check(s1["pScore"] == "15" and s1["dScore"] and s1["dScore"].replace(" ", "") == "9+?", "điểm: bạn 15, nhà cái '9 + ?' (không lộ lá úp) -> %s / %s" % (s1["pScore"], s1["dScore"]))
    check(s1["d"][1]["down"] and not s1["d"][1]["face"], "lá úp nhà cái chưa có mặt trước trong DOM")
    check(s1["running"] == 0 and s1["flying"] == 0, "không còn animation/class bay sau khi chia")
    check("deal" in pg.evaluate("() => window.__sfx") and "land" in pg.evaluate("() => window.__sfx"), "phát móc âm thanh deal/land")

    # ===== 2. HIT nhiều lần, rồi STAND: lật lá úp, nhà cái rút nhiều lá =====
    # P: K,5 ; hit 2 -> 17. D: 9,7=16 -> rút 2 -> 18 (hoặc ...) ; thử bài: sau hit thêm, dealer rút lá tiếp
    pg.click("[data-act=hit]")
    pg.wait_for_timeout(120)
    s = snap(pg)
    check(s["busy"] and s["hitDis"] and s["standDis"], "đang HIT: nút khóa")
    check(s["pScore"] is None or s["pScore"] == "15", "điểm cũ chưa nhảy sớm khi lá HIT còn đang bay (%s)" % s["pScore"])
    wait_idle(pg)
    s = snap(pg)
    check(len(s["p"]) == 3 and s["pScore"] == "17", "HIT: 3 lá, điểm 17 (%s)" % s["pScore"])
    pg.click("[data-act=stand]")
    pg.wait_for_timeout(150)
    s = snap(pg)
    check(s["busy"] and s["hitDis"] and s["standDis"], "đang STAND: nút khóa")
    check(s["dScore"] is None or "?" in s["dScore"], "trước khi lật, điểm nhà cái vẫn '? ' (%s)" % s["dScore"])
    wait_idle(pg)
    pg.wait_for_timeout(250)  # hiệu ứng CSS của banner/ánh sáng (không phải animation của lá) có thể còn vài chục ms
    s = snap(pg)
    check(s["phase"] == "ROUND_COMPLETE" and s["resultShown"] and not s["newHidden"] and not s["newDis"], "ván xong: hiện kết quả + nút Ván mới")
    check(not s["d"][1]["down"] and s["d"][1]["face"], "lá úp nhà cái đã lật có mặt trước (%s)" % s["d"])
    # dealer: 9+7=16 -> rút 3 -> 19; phải có 3 lá
    check(len(s["d"]) == 3, "nhà cái rút thêm khi 16 (có %d lá)" % len(s["d"]))
    check(s["running"] == 0 and s["flying"] == 0, "không còn animation/class bay sau khi xong ván (running=%d flying=%d)" % (s["running"], s["flying"]))
    if s["running"] or s["flying"]: print("   chi tiết:", pg.evaluate("() => [...document.querySelector('.bj-table').getAnimations({subtree:true})].filter(a => a.playState === 'running').map(a => a.constructor.name + ' ' + (a.animationName || '') + ' ' + (a.effect.target.className || a.effect.target.tagName) + ' ' + (a.effect.pseudoElement || ''))"), pg.evaluate("() => [...document.querySelectorAll('.is-flying,.has-flight')].map(n => n.className)"))
    check(s["fx"] in ("win", "lose", "push", "blackjack"), "có hiệu ứng kết quả data-fx=%s" % s["fx"])

    # ===== 3. Ván mới sau kết quả: thu bài rồi chia lại, hiệu ứng cũ biến mất =====
    pg.click("[data-act=new]")
    pg.wait_for_timeout(80)
    s = snap(pg)
    check(s["busy"] and s["fx"] is None, "ván mới: hiệu ứng cũ được dọn ngay")
    wait_idle(pg)
    s = snap(pg)
    natural = s["phase"] == "ROUND_COMPLETE" and s["fx"] in ("blackjack", "lose", "push")  # bộ bài ngẫu nhiên có thể ra Blackjack tự nhiên (~5%)
    check(len(s["p"]) == 2 and len(s["d"]) == 2 and ((s["phase"] == "PLAYER_TURN" and not s["resultShown"]) or natural), "ván mới chia lại 2+2 lá, không còn kết quả của ván cũ (phase=%s)" % s["phase"])
    pg.evaluate("() => Blackjack.stop()")
    s = snap(pg)
    check(len(s["p"]) == 0 and len(s["d"]) == 0 and s["phase"] == "IDLE", "stop(): bàn trống, IDLE")
    check(errs == [] and pg.evaluate("() => window.__unhandled") == 0, "không lỗi console / unhandled rejection (nhóm 1-3): %s" % errs)
    pg.context.close()

    # ===== 4. Blackjack tự nhiên + người chơi bust + nhà cái bust =====
    pg, errs = new_page(b)
    pg.evaluate("() => Blackjack.open()")
    start(pg, ["A", "9", "K", "7"]); wait_idle(pg)
    s = snap(pg)
    check(s["phase"] == "ROUND_COMPLETE" and s["resultShown"] and "Blackjack" in s["resultText"] and s["fx"] == "blackjack", "Blackjack tự nhiên: lật lá úp, hiện kết quả + hiệu ứng blackjack (%s)" % s["resultText"])
    check(s["d"][1]["face"] and not s["d"][1]["down"], "Blackjack: lá úp đã lật")
    pg.click("[data-act=new]")
    pg.evaluate("() => { window.__confMax = 0; }")
    wait_idle(pg)
    # người chơi bust: K,Q + hit 5
    start(pg, ["K", "9", "Q", "7", "5"]); wait_idle(pg)
    pg.click("[data-act=hit]"); wait_idle(pg)
    s = snap(pg)
    check(s["phase"] == "ROUND_COMPLETE" and s["fx"] == "lose" and "21" in s["resultText"], "người chơi quá 21: kết quả thua, hiệu ứng lose (%s)" % s["resultText"])
    check(len(s["d"]) == 2 and s["d"][1]["face"], "bust: nhà cái lật lá úp nhưng không rút thêm")
    pg.click("[data-act=new]"); wait_idle(pg) if False else None
    pg.wait_for_function("() => Blackjack.getState().phase === 'PLAYER_TURN' || Blackjack.getState().phase === 'ROUND_COMPLETE'")
    wait_idle(pg)
    # nhà cái bust: P 10,8=18 stand ; D 6,10 -> 16 rút K -> 26
    start(pg, ["10", "6", "8", "10", "K"]); wait_idle(pg)
    pg.click("[data-act=stand]"); wait_idle(pg)
    s = snap(pg)
    check(s["fx"] == "win" and s["confetti"] >= 0 and len(s["d"]) == 3, "nhà cái bust: người chơi thắng, nhà cái rút 1 lá (%d lá)" % len(s["d"]))
    pg.wait_for_timeout(100)
    check(snap(pg)["resultShown"], "banner kết quả vẫn hiển thị")
    check(errs == [] and pg.evaluate("() => window.__unhandled") == 0, "không lỗi (nhóm 4): %s" % errs)
    pg.context.close()

    # ===== 5. Hủy: thoát khi đang chia / đang lật; mở lại; ván mới đè =====
    pg, errs = new_page(b)
    start(pg, ["K", "9", "5", "7"])
    pg.wait_for_timeout(500)  # giữa lúc chia
    pg.click("[data-act=exit]")
    s = snap(pg)
    check(not s["busy"] and len(s["p"]) == 0 and len(s["d"]) == 0 and s["running"] == 0, "thoát khi đang chia: bàn trống, không còn animation (running=%d)" % s["running"])
    if s["running"]: print("   chi tiết:", pg.evaluate("() => document.getAnimations().map(a => (a.effect && a.effect.target ? (a.effect.target.className || a.effect.target.tagName) : '?') + ' ' + a.playState)"))
    check(pg.evaluate("() => window.__exits") == 1, "onExit được gọi 1 lần")
    pg.wait_for_timeout(1800)
    s = snap(pg)
    check(len(s["p"]) == 0 and len(s["d"]) == 0 and s["phase"] == "IDLE", "1.8s sau khi thoát: không có lá nào xuất hiện thêm")
    pg.evaluate("() => Blackjack.open()")
    start(pg, ["K", "9", "5", "7", "2", "3"]); wait_idle(pg)
    s = snap(pg)
    check(s["phase"] == "PLAYER_TURN" and len(s["p"]) == 2 and len(s["d"]) == 2, "mở lại sau khi hủy: chia bình thường, không lá thừa")
    # thoát khi đang lật lá úp
    pg.click("[data-act=stand]")
    pg.wait_for_function("() => document.querySelector('[data-ref=dHand] .bj-card-inner') && document.getAnimations().some(a => a.effect && a.effect.target && a.effect.target.classList.contains('bj-card-inner'))", timeout=5000)
    pg.evaluate("() => document.querySelector('[data-act=exit]').click()")
    s = snap(pg)
    check(not s["busy"] and s["running"] == 0 and s["flying"] == 0 and len(s["d"]) == 0, "thoát khi đang lật: dọn sạch, không animation / class bay")
    pg.wait_for_timeout(1500)
    check(len(snap(pg)["d"]) == 0, "sau khi thoát lúc lật: không có lá hiện lại")
    check(pg.evaluate("() => window.__unhandled") == 0 and errs == [], "không lỗi (nhóm 5): %s" % errs)
    pg.context.close()

    # ===== 6. Bấm dồn / ván mới đè lên ván cũ =====
    pg, errs = new_page(b)
    pg.evaluate("""() => { const d = __deck(['K','9','5','7','2']); window.__r = [Blackjack.startNewRound({deck:d}), Blackjack.startNewRound({deck:d}), Blackjack.startNewRound({deck:d})]; }""")
    wait_idle(pg)
    s = snap(pg)
    check(s["phase"] == "PLAYER_TURN" and len(s["p"]) == 2 and len(s["d"]) == 2, "bấm Ván mới 3 lần liên tiếp: chỉ chia một ván (2+2 lá)")
    res = pg.evaluate("() => Promise.all(window.__r)")
    check(res == [True, False, False], "chỉ lần gọi đầu được chạy: %s" % res)
    for _ in range(6):
        pg.evaluate("() => { document.querySelector('[data-act=hit]').click(); document.querySelector('[data-act=hit]').click(); document.querySelector('[data-act=stand]').click(); }")
        pg.wait_for_timeout(30)
    wait_idle(pg)
    s = snap(pg)
    check(s["phase"] in ("PLAYER_TURN", "ROUND_COMPLETE") and not s["busy"], "bấm HIT/STAND dồn dập: không kẹt (phase=%s)" % s["phase"])
    check(len(set(c["key"] for c in s["p"] + s["d"])) == len(s["p"]) + len(s["d"]), "không có lá trùng trên bàn")
    # ván mới đè lên khi đang chạy qua open() (như vào lại màn hình): kết quả cũ không ghi đè
    pg.evaluate("() => Blackjack.open()")
    start(pg, ["10", "10", "9", "7"]); pg.wait_for_timeout(300)
    pg.evaluate("() => Blackjack.open()")  # mở lại giữa lúc chia
    pg.wait_for_timeout(1500)
    s = snap(pg)
    check(s["phase"] == "IDLE" and len(s["p"]) == 0 and not s["busy"] and not s["newHidden"] and not s["newDis"], "open() giữa lúc chia: sạch, nút Ván mới dùng được")
    check(pg.evaluate("() => window.__unhandled") == 0 and errs == [], "không lỗi (nhóm 6): %s" % errs)
    pg.context.close()

    # ===== 7. Giảm chuyển động =====
    pg, errs = new_page(b, reduced_motion="reduce")
    check(pg.evaluate("() => BlackjackAnimation.isReducedMotion()"), "nhận ra prefers-reduced-motion")
    t0 = pg.evaluate("() => performance.now()")
    start(pg, ["A", "9", "K", "7"]); wait_idle(pg)
    dt = pg.evaluate("() => performance.now()") - t0
    s = snap(pg)
    check(s["phase"] == "ROUND_COMPLETE" and s["fx"] == "blackjack" and s["confetti"] == 0, "reduced-motion: vẫn ra kết quả, không confetti")
    check(dt < 2500, "reduced-motion: cả ván Blackjack tự nhiên xong trong %.0f ms" % dt)
    check(pg.evaluate("() => window.__unhandled") == 0 and errs == [], "không lỗi (nhóm 7): %s" % errs)
    pg.context.close()

    # ===== 8. Màn hình hẹp (điện thoại dọc) và nhiều lá =====
    pg, errs = new_page(b)
    pg.set_viewport_size({"width": 375, "height": 740})
    start(pg, ["2", "9", "3", "7", "2", "4", "5", "2", "3", "4", "A", "5"]); wait_idle(pg)
    for _ in range(5):
        pg.click("[data-act=hit]"); wait_idle(pg)
    s = snap(pg)
    over = pg.evaluate("() => document.documentElement.scrollWidth > innerWidth + 1")
    check(not over, "375px, %d lá: không tràn ngang" % len(s["p"]))
    check(s["running"] == 0, "375px: animation kết thúc sạch")
    pg.context.close()

    b.close()

print("\nTỔNG: %d lỗi" % len(fails))
for f in fails: print(" -", f)
sys.exit(1 if fails else 0)
