# Kiểm tra giao diện Blackjack (M2) bằng Chromium/Playwright. Chạy: python3 tests/blackjack-visual-check.py
# Không cần mạng: trang xem trước tests/blackjack-preview.html chỉ nạp file cục bộ.
import os, sys
from playwright.sync_api import sync_playwright

URL = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "blackjack-preview.html"))
fails = []
def check(ok, msg):
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    reqs, errs = [], []
    pg.on("request", lambda r: reqs.append(r.url))
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(URL)

    # ---- 52 lá ----
    info = pg.evaluate("""() => {
      const cards = [...document.querySelectorAll('#sheet .bj-card')];
      const ids = cards.map(c => c.dataset.id);
      const out = { n: cards.length, unique: new Set(ids).size, bad: [] };
      cards.forEach(c => {
        const r = c.dataset.rank, front = c.querySelector('.bj-front');
        const corners = front.querySelectorAll('.bj-corner').length;
        const pips = front.querySelectorAll('.bj-pip').length;
        const court = front.querySelectorAll('.bj-court .bj-portrait').length;
        const want = r === 'A' ? 1 : (['J','Q','K'].includes(r) ? 0 : Number(r));
        if (corners !== 2) out.bad.push(c.dataset.id + ' góc=' + corners);
        if (pips !== want) out.bad.push(c.dataset.id + ' pip=' + pips + ' cần ' + want);
        if (['J','Q','K'].includes(r) && court !== 2) out.bad.push(c.dataset.id + ' court=' + court);
        if (c.dataset.color !== (['hearts','diamonds'].includes(c.dataset.suit) ? 'red' : 'black')) out.bad.push(c.dataset.id + ' màu');
        if (!c.querySelector('.bj-back .bj-emblem')) out.bad.push(c.dataset.id + ' thiếu mặt sau');
        if (getComputedStyle(c.querySelector('.bj-face')).backfaceVisibility !== 'hidden') out.bad.push(c.dataset.id + ' backface');
      });
      out.imgs = document.querySelectorAll('img, picture, canvas').length;
      return out;
    }""")
    check(info["n"] == 52 and info["unique"] == 52, "52 lá, id không trùng (%s/%s)" % (info["n"], info["unique"]))
    check(not info["bad"], "mỗi lá: 2 góc, đúng số biểu tượng, J/Q/K có 2 nửa, đúng màu, có mặt sau %s" % info["bad"][:5])
    check(info["imgs"] == 0, "không dùng <img>/<picture>/<canvas> cho lá bài")
    check(all(u.startswith("file://") for u in reqs), "không có tài nguyên ngoài (%d request, đều cục bộ)" % len(reqs))
    css = open(os.path.join(os.path.dirname(__file__), "..", "css", "blackjack.css"), encoding="utf-8").read()
    check("url(" not in css and "data:image" not in css, "blackjack.css không có url()/ảnh base64")

    # ---- lật 3D: hai mặt riêng, xoay khối trong ----
    flip = pg.evaluate("""() => {
      const c = BlackjackCards.createCardElement(BlackjackCards.getCard('hearts-K'), { faceDown: true });
      document.body.appendChild(c);
      const inner = c.querySelector('.bj-card-inner'), cs = getComputedStyle(inner);
      const r = { style: cs.transformStyle, down: cs.transform, front: !!c.querySelector('.bj-front .bj-corner'), back: !!c.querySelector('.bj-back') };
      c.classList.remove('is-down'); r.up = getComputedStyle(inner).transform; c.remove(); return r;
    }""")
    check(flip["style"] == "preserve-3d" and flip["front"] and flip["back"] and flip["down"] != "none" and flip["up"] == "none", "lật 3D: preserve-3d, hai mặt riêng, is-down xoay rotateY(180deg)")

    # ---- lá úp không lộ mặt ----
    pg.evaluate("window.__scenario('Lượt người chơi')")
    hole = pg.evaluate("""() => {
      const el = document.querySelector('#game .bj-dealer .bj-card[data-key="dealer-hole"]');
      return { exists: !!el, down: el && el.classList.contains('is-down'), id: el && (el.dataset.id || null), frontHtml: el ? el.querySelector('.bj-front').innerHTML : null,
               ptxt: document.querySelector('#game .bj-dealer .bj-score').textContent };
    }""")
    check(hole["exists"] and hole["down"] and hole["id"] is None and hole["frontHtml"] == "", "lá úp của nhà cái: úp, không id, mặt trước rỗng (không lộ trong DOM)")
    check("?" in hole["ptxt"], "điểm nhà cái khi còn úp chỉ tính lá ngửa: '%s'" % hole["ptxt"])

    # ---- lá úp được lật: dùng lại đúng phần tử, gắn mặt trước ----
    same = pg.evaluate("""() => {
      const before = document.querySelector('#game .bj-dealer .bj-card[data-key="dealer-hole"]');
      window.__scenario('Lượt người chơi'); // dựng lại từ đầu: phần tử mới
      const el = document.querySelector('#game .bj-dealer .bj-card[data-key="dealer-hole"]');
      return before !== el;
    }""")
    reuse = pg.evaluate("""() => {
      const g = BlackjackEngine.createGame(); const R = BlackjackRender;
      const used = {}; const stack = r => r.map(x => { const s = BlackjackCards.SUITS.find(s => !used[s + '-' + x]); used[s + '-' + x] = 1; return s + '-' + x; });
      g.startRound({ deck: stack(['10','9','8','7','2']) }); g.beginPlayerTurn(); R.render(g.getState(), {});
      const el = document.querySelector('#game .bj-dealer .bj-card[data-key="dealer-hole"]');
      g.playerStand(); g.revealDealer(); R.render(g.getState(), {});
      const el2 = document.querySelector('#game .bj-dealer .bj-card:nth-child(2)');
      return { same: el === el2, id: el2.dataset.id, key: el2.dataset.key, hasFront: !!el2.querySelector('.bj-front .bj-corner') };
    }""")
    check(reuse["same"] and reuse["hasFront"] and reuse["key"] == reuse["id"], "lá úp được lật vẫn là CÙNG phần tử DOM, nay có mặt trước (%s)" % reuse["id"])

    # ---- không nhân đôi listener khi mount lại ----
    clicks = pg.evaluate("""() => {
      let n = 0; const host = document.getElementById('game');
      BlackjackRender.mount(host, { onAction: a => { n++; } });
      BlackjackRender.mount(host, { onAction: a => { n++; } });
      window.__scenario('Lượt người chơi');
      host.querySelector('[data-act="hit"]').click();
      host.querySelector('[data-act="exit"]').click();
      return n;
    }""")
    check(clicks == 2, "mount nhiều lần không nhân đôi listener (2 lần bấm -> %d lần gọi)" % clicks)

    # ---- nút theo trạng thái ----
    st = pg.evaluate("""() => {
      const q = a => document.querySelector('#game [data-act="' + a + '"]');
      const o = {};
      window.__scenario('Lượt người chơi'); o.turn = [q('hit').disabled, q('stand').disabled, q('new').hidden];
      window.__scenario('Thắng'); o.result = [q('hit').disabled, q('stand').disabled];
      window.__scenario('Ván hoàn tất'); o.done = [q('hit').hidden, q('stand').hidden, q('new').hidden];
      window.__scenario('Chưa chia'); o.idle = [q('hit').hidden, q('new').hidden];
      return o;
    }""")
    check(st["turn"] == [False, False, True], "lượt người chơi: Rút/Dừng bật, Ván mới ẩn")
    check(st["result"] == [True, True], "đã ra kết quả: Rút/Dừng tắt")
    check(st["done"] == [True, True, False] and st["idle"] == [True, False], "hết ván / chưa chia: chỉ còn nút Ván mới")

    # ---- kết quả & huy hiệu ----
    rs = pg.evaluate("""() => {
      const o = {}; const t = () => { const r = document.querySelector('#game .bj-result'); return r.hidden ? null : r.dataset.kind + ':' + r.textContent; };
      ['Thắng','Thua','Hòa','Quá 21','Blackjack'].forEach(n => { window.__scenario(n); o[n] = t(); });
      window.__scenario('Quá 21'); o.bust = document.querySelector('#game .bj-player .bj-badge').textContent;
      window.__scenario('Blackjack'); o.bj = document.querySelector('#game .bj-player .bj-badge').textContent;
      return o;
    }""")
    check(rs["Thắng"].startswith("win:") and rs["Thua"].startswith("lose:") and rs["Hòa"].startswith("push:") and rs["Quá 21"].startswith("lose:") and rs["Blackjack"].startswith("blackjack:"), "banner kết quả đúng loại: %s" % rs)
    check("Quá 21" in rs["bust"] and "Blackjack" in rs["bj"], "huy hiệu Quá 21 / Blackjack hiển thị")

    # ---- I18n: dùng I18n.t khi có, và relabel() gọi I18n.apply ----
    tr = pg.evaluate("""() => {
      let applied = 0; window.I18n = { t: k => k === 'bj.hit' ? 'HIT!' : k, apply: () => { applied++; } };
      window.__scenario('Lượt người chơi');
      const o = { hit: document.querySelector('#game [data-act="hit"]').textContent, fb: document.querySelector('#game [data-act="stand"]').textContent, key: document.querySelector('#game [data-act="hit"]').dataset.i18n };
      BlackjackRender.relabel(); o.applied = applied; delete window.I18n; return o;
    }""")
    check(tr["key"] == "bj.hit" and tr["applied"] == 1 and tr["fb"] == "Dừng bài", "nút dùng khóa i18n (data-i18n), relabel() gọi I18n.apply, khóa thiếu thì dùng chữ dự phòng")
    check(not errs, "không có lỗi JS/console: %s" % errs)

    # ---- không tràn ngang, 4 cỡ màn hình x các tình huống ----
    SIZES = [("máy tính", 1280, 800), ("tablet", 820, 1100), ("điện thoại dọc", 390, 844), ("điện thoại dọc nhỏ", 320, 640), ("điện thoại ngang", 844, 390)]
    SC = ["Chưa chia", "Lượt người chơi", "Người chơi 5 lá", "Người chơi 11 lá", "Nhà cái 8 lá", "Blackjack", "Quá 21", "Thắng"]
    for name, w, h in SIZES:
        q = b.new_page(viewport={"width": w, "height": h}); q.goto(URL); worst = 0; tiny = 99
        for sc in SC:
            q.evaluate("n=>window.__scenario(n)", sc)
            r = q.evaluate("""() => {
              const g = document.getElementById('game'), t = g.querySelector('.bj-table').getBoundingClientRect(), W = document.documentElement.clientWidth; let m = 0;
              g.querySelectorAll('.bj-card,.bj-btn,.bj-result,.bj-score').forEach(e => { if (e.hidden) return; const r = e.getBoundingClientRect(); if (r.width) m = Math.max(m, t.left - r.left, r.right - t.right, r.right - W, -r.left); });
              const c = g.querySelector('.bj-card'); return [Math.round(m), Math.round(document.documentElement.scrollWidth - W), c ? Math.round(c.getBoundingClientRect().width) : 0]; }""")
            worst = max(worst, r[0], r[1]); tiny = min(tiny, r[2] or 99)
        check(worst <= 1, "%s %dx%d: không tràn ngang ở %d tình huống (lá rộng tối thiểu %dpx)" % (name, w, h, len(SC), tiny))
        q.close()
    b.close()

print("\nKẾT QUẢ:", "ĐẠT" if not fails else "%d LỖI" % len(fails))
sys.exit(1 if fails else 0)
