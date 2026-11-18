# Nhật ký triển khai Blackjack

## Quyết định đã chốt (từ bảng câu hỏi)
1A công khai nhẹ (bảng luật + thanh "độ khó"), cược bằng số dư thật · 2B bộ đếm thắng KHÔNG bao giờ reset · 3A thắng +1×, Blackjack tự nhiên +1,5×, hòa hoàn cược · 4A bỏ ván giữa chừng = thua · 5A thanh cược ¼ số dư → toàn bộ, bước 0,1K, làm tròn xuống · 6A host bật/tắt + chỉnh chuỗi % (mặc định 50/35/20/5/0) · 7A ghi lịch sử ván.

## Milestone
- [x] M0 Khảo sát mã nguồn
- [x] M1 Engine
- [x] M2 Hình lá bài và bàn (bản này)
- [x] M3 Hoạt ảnh (bản này)
- [x] M4 Gắn vào QuizWheel (chưa có tiền) (bản này)
- [x] M5 SQL 12-blackjack (viết xong, CHƯA chạy trên PostgreSQL thật) · [x] M6 nối server (đã thử với server GIẢ LẬP, chưa với Supabase thật) nối server · [ ] M7 host · [ ] M8 hồi quy + đóng gói

## M1 – file mới
- js/blackjack/blackjack-cards.js (dữ liệu 52 lá, shuffle Fisher-Yates)
- js/blackjack/blackjack-engine.js (luật, trạng thái, kiểm tra hành động)
- tests/blackjack-engine.test.js (chạy: `node --test tests/blackjack-engine.test.js`)
File cũ: không sửa file nào. index.html chưa nạp script Blackjack (việc của M4).

## Ghi chú cho các milestone sau
- startRound({deck}) nhận bộ bài chỉ định (id lá) để M5/M6 có thể dựng ván theo kết quả server đã chốt.
- Engine dừng ở soft 17 (RULES.dealerHitsSoft17 = false).

## M2 – file mới / đổi
- js/blackjack/blackjack-cards.js (thêm phần vẽ: createCardElement, createBackElement, setCardFace; dữ liệu M1 giữ nguyên)
- js/blackjack/blackjack-render.js (mount/render/getAnchors/cardElement/relabel/unmount)
- css/blackjack.css (lá bài, bàn, 3 bố cục: máy tính, màn hẹp <=600px, điện thoại ngang thấp)
- tests/blackjack-preview.html (trang xem trước, chỉ để phát triển) · tests/blackjack-visual-check.py (kiểm tra tự động)
- Chạy kiểm tra: `node --test tests/blackjack-engine.test.js` và `python3 tests/blackjack-visual-check.py` (cần Playwright + Chromium)

## Việc cần làm ở M3 / M4 (ghi lại để không sót)
- M3: lá bài đã có cấu trúc .bj-card > .bj-card-inner > .bj-front/.bj-back; lật = bỏ/thêm class `is-down`. Phần tử lá giữ nguyên khi render lại (key = id lá, lá úp của nhà cái key `dealer-hole`, khi lật dùng lại chính phần tử đó). render(state, view) có view.showPlayerScore/showDealerScore/showResult/busy/message để hoạt ảnh giấu điểm và kết quả tới khi bài tới nơi. Cần css/blackjack-animations.css (hiệu ứng banner kết quả, confetti, reduced-motion cho hoạt ảnh).
- M4: thêm khóa i18n sau vào CẢ vi và en trong js/i18n.js (hiện chỉ có chữ dự phòng tiếng Việt trong blackjack-render.js, FALLBACK_VI): bj.title, bj.exit, bj.dealer, bj.player, bj.hit, bj.stand, bj.new, bj.deck, bj.msg.idle, bj.msg.dealing, bj.msg.yourTurn, bj.msg.dealerTurn, bj.badge.blackjack, bj.badge.bust, bj.result.win, bj.result.lose, bj.result.push, bj.result.blackjack, bj.result.dealerBlackjack, bj.result.bust. Nối I18n.onChange -> BlackjackRender.relabel() (và render lại để các chữ động đổi theo).
- Nút dùng sẵn class .btn / .btn-secondary của QuizWheel; font "Baloo 2" lấy từ trang chính.

## M3 – file mới
- js/blackjack/blackjack-animation.js (phiên hoạt ảnh: fly/flip/collect/effect/wait, hủy bằng lỗi đặc biệt, CONFIG + setSpeed, móc setSfx)
- js/blackjack/blackjack.js (bộ điều khiển: init/open/stop/startNewRound/getState/isBusy; luồng ván mới, HIT, STAND; không chứa luật)
- css/blackjack-animations.css (lá đang bay, banner kết quả, ánh sáng thắng/thua/hòa, confetti, reduced-motion)
- tests/blackjack-play.html (trang chơi thử) · tests/blackjack-anim-check.py (50 kiểm tra tự động bằng Playwright)
File cũ: không sửa file nào (blackjack-render.js, engine, cards giữ nguyên). index.html vẫn chưa nạp script Blackjack (việc của M4).
Chạy: `python3 tests/blackjack-anim-check.py` · `node --test tests/blackjack-engine.test.js` · `python3 tests/blackjack-visual-check.py`

## Thiết kế cần nhớ
- Mỗi hành động = 1 phiên (BlackjackAnimation.newSession). Hủy = lỗi có cờ bjCancel; controller bắt bằng A.isCancel. Lá trước của CÙNG tay phải tới nơi rồi mới thêm lá mới (tránh trượt chồng chéo).
- Lỗi bất ngờ trong phiên: engine.reset() về IDLE, nhả khóa busy (nút không kẹt).
- Móc âm thanh: BlackjackAnimation.setSfx(fn) nhận "deal" | "land" | "flip" | "collect" | "win" | "lose" | "push" | "blackjack".
- Thoát/điều hướng: gọi Blackjack.stop(). Vào lại: Blackjack.open().

## Việc cần làm ở M4 (bổ sung)
- Nối i18n (danh sách khóa ở phần M2), I18n.onChange -> BlackjackRender.relabel() + render lại.
- Nối âm thanh: blackjack-audio.js tổng hợp bằng Web Audio, đọc âm lượng từ Store.loadAudio(); BlackjackAnimation.setSfx(...)
- main.js: go() gọi Blackjack.open() khi vào, Blackjack.stop() khi rời màn blackjack; thêm "blackjack" vào NEED_LOGIN; nút trang chủ; nạp CSS (blackjack.css, blackjack-animations.css) và 5 script theo thứ tự cards, engine, render, animation, blackjack (trước main.js).
- Nên thêm Page Visibility: tab bị ẩn khi đang chia bài -> stop() hoặc để hoạt ảnh tiếp tục (cần quyết khi tích hợp).

## M4 – file mới / đổi
Mới: js/blackjack/blackjack-audio.js (tiếng tổng hợp bằng Web Audio, đọc Settings.sound(); không file âm thanh mới) · tests/blackjack-integration-check.py (31 kiểm tra, máy chủ Supabase giả lập, phục vụ qua HTTP)
Đổi (nhỏ): index.html (2 link CSS, nút #btn-blackjack, <section id="screen-blackjack">, 6 script trước main.js) · js/main.js (+5 dòng: NEED_LOGIN thêm "blackjack"; go() mở/dừng Blackjack; click nút; Blackjack.init; I18n.onChange -> Blackjack.refresh) · js/i18n.js (21 khóa vi + en) · css/blackjack.css (nút trang chủ + #screen-blackjack) · js/blackjack/blackjack.js (open gắn âm thanh, stop gỡ, thêm refresh()) · tests/blackjack-play.html
Quyết định: Blackjack YÊU CẦU ĐĂNG NHẬP (cùng quy ước Gacha/Quiz và để M5-M6 dùng số dư thật). Không tiêu lượt Quiz/Gacha. Không có nhạc nền ở màn Blackjack (MUSIC_SCREENS không đổi). Tab bị ẩn giữa lúc chia: hoạt ảnh cứ chạy tiếp (bạn đã đồng ý). Thoát = bỏ ván ngay, chưa hỏi xác nhận (sẽ thêm cùng quy tắc "bỏ ván = thua" ở M5-M6).
Chạy: `python3 tests/blackjack-integration-check.py`

## M5 – file mới
- sql/12-blackjack.sql · tests/blackjack-sql-sim.py (mô phỏng thuật toán bằng Python, không phải chạy SQL)
- Thêm: players.bj_wins, app_config.bj_enabled + bj_chain, bảng bj_games (RLS, không policy), plays.kind 'blackjack'.
- Hàm người chơi: api_bj_state(token) · api_bj_start(token, bet) · api_bj_hit(token) · api_bj_stand(token) · api_bj_abandon(token)
- Hàm host: admin_bj_config(key, enabled, chain) · admin_bj_reset_wins(key, playerId). Hàm cũ chỉ THÊM trường: api_config(+bjEnabled), api_history/admin_history(+outcome, bet), admin_players(+bjWins), admin_settings(+bjEnabled, bjChain).
- Cược trừ ngay lúc chia (plays.reward_k = −cược), cập nhật khi xong ván; bỏ ván = thua; start khi còn ván mở = ván cũ bị xử thua.
- Hợp đồng cho M6: lá bài là id như client ("spades-A", "hearts-10"). start trả player[2] + dealer[1 lá ngửa]; lá úp CHỈ lộ ở stand/bust (dealer = [ngửa, úp, rút...]); Blackjack tự nhiên trả done:true + dealer 2 lá. Server không tự stand khi đạt 21: client gọi stand. Engine client phải nhận bài do server đưa (không tự xáo) -> cần chế độ "kịch bản" ở M6.
- Chỗ cần chốt/giả định: hòa 8% trong phần không thắng, Blackjack tự nhiên 5% trong ván thắng (hằng số trong SQL); mục tiêu hòa mà người chơi dừng < 17 => thành thua; thua mà người chơi đúng 21 => thành hòa.
- Hệ quả của 2B: với chuỗi mặc định, đã thắng 4 ván là tỉ lệ thắng về 0% mãi (trừ khi host reset bằng admin_bj_reset_wins hoặc sửa chuỗi).

## M5 – bổ sung: hồi phục tỉ lệ (đã chốt)
- Thay 2B: chỉ sau khi thắng >= 1 ván; mỗi ván thua/quá 21/bỏ ván +3 điểm % (hằng số trong _bj_settle) tới mức của bậc ngay trước; hòa giữ nguyên; thắng về mức gốc bậc kế tiếp. Cột players.bj_rate (null = mức gốc). admin_bj_reset_wins đặt bj_wins=0 và bj_rate=null. admin_players trả thêm bjRate.
- Chưa chốt: giữ "chốt cứng kết quả" hay chuyển "thiên lệch nhẹ" (xem trả lời trong chat).

## M5 – ĐỔI HƯỚNG: bài chia thật + thiên lệch nhẹ (đã chốt, thay "chốt cứng")
- sql/12-blackjack.sql viết lại phần chia bài: không còn target/hòa 8%/Blackjack 5% cố định. Bốn lá đầu chia đều, nhà cái xem bài (Blackjack tự nhiên của hai bên xử ngay: outcome blackjack | dealer_blackjack | push). Lá rút thêm: lá làm quá 21 có trọng số e^g (người chơi) / e^-g (nhà cái). Lá úp (bj_games.hole) chốt lúc chia, chỉ lộ ở stand/bust.
- bj_chain mặc định ĐỔI thành [50,40,33,27,22] = tỉ lệ thắng mục tiêu của người chơi chuẩn (chiến thuật cơ bản); _bj_bias() đổi % -> g theo bảng hiệu chuẩn; dưới ~21% không khả thi (g chặn ở 4). Hồi phục +3% giữ nguyên (áp lên % mục tiêu).
- Mô phỏng (tests/blackjack-sql-sim.py): thắng thực của người chơi chuẩn 50.4/40.0/33.1/27.0/22.3%; ẩu kém 10-13 điểm.
- Việc cho M6: api_bj_start có thể trả done:true ngay (blackjack/dealer_blackjack/push) kèm dealer 2 lá; engine client cần chế độ nhận bài từ server (kể cả lá úp).

## M6 – Nối server (xong, thử bằng server giả lập)
- Sửa: js/api.js (+bjState/bjStart/bjHit/bjStand/bjAbandon, mã lỗi mới), js/i18n.js (vi/en: số dư, cược, độ khó, luật, thông báo, lịch sử; "Ván mới" -> "Chia bài"/"Deal"), js/main.js (init có api/onAuth, ẩn nút khi host tắt, lịch sử ván Blackjack, fmtK 2 số lẻ), js/blackjack/blackjack-engine.js (+feed, +setHole), blackjack-render.js (bảng cược, độ khó, luật, dòng tiền ở banner), blackjack.js (chế độ SERVER), css/blackjack.css.
- Chế độ SERVER: Blackjack.init({api}) -> cược/bộ bài/kết toán ở server; engine trình duyệt chỉ phát lại bài server đưa và phải KHỚP kết quả server (lệch = lỗi đồng bộ, tải lại số dư). startNewRound({deck}) vẫn là chế độ local không cược (test).
- Hành vi: đạt 21 thì tự dừng bài; thoát giữa ván hỏi xác nhận rồi abandon (thua); mở màn hình mà server còn ván dở thì tự tính thua + thông báo; lỗi mạng giữa ván giữ nguyên bàn; hết tiền (< 0,1K) / host tắt thì khóa nút Chia bài; cược tự nâng lên mức tối thiểu ¼ số dư mới.
- Test mới: tests/bj_fake_server.py (cài lại hợp đồng + thuật toán SQL), tests/blackjack-server-check.py (~40 kiểm tra + 80 ván ngẫu nhiên), engine +4 test (38/38). Test cũ đã cập nhật (dùng server giả, nhận hộp thoại xác nhận).
- Chưa làm: host (M7: bật/tắt, chuỗi %, reset bj_wins, lịch sử host), README/TESTING (M8). Phía SQL chưa chạy trên PostgreSQL thật.

## M7 – Host (xong, thử bằng server giả lập)
- Sửa js/host-admin.js (host.html KHÔNG đổi): tab Cài đặt có thẻ "Blackjack" (công tắc bật/tắt + chuỗi % theo bậc, kiểm tra 1-10 số 0-100, lưu riêng bằng admin_bj_config; server cũ chưa chạy 12-blackjack.sql thì hiện hướng dẫn); tab Người chơi: nhãn "Blackjack thắng N" (không hiện tỉ lệ hồi phục), menu Thêm > Blackjack > Đặt lại độ khó (admin_bj_reset_wins, có xác nhận); Lịch sử host hiện ván Blackjack (cược, kết quả, tiền). kfmt 2 số lẻ.
- Test mới: tests/blackjack-host-check.py (22 kiểm tra) + phần admin_* trong tests/bj_fake_server.py.
- Còn lại: M8 (hồi quy tổng, README, TESTING, đóng gói) và việc chạy 12-blackjack.sql trên Supabase thật.

## M8 – Hồi quy và đóng gói (xong)
- Toàn bộ test tự động đạt (engine 38/38; visual 22; anim 50; integration 32; server 44; host 22). node --check mọi JS, i18n vi/en 214/214, không có ảnh/URL ngoài trong code Blackjack.
- Đối chiếu SQL 12 với bản mới nhất của các hàm được thay (api_config, api_history, admin_history, admin_players, admin_settings): không mất trường nào, chỉ thêm trường Blackjack. Các hàm Quiz/Gacha không bị sửa; dòng plays kind 'blackjack' có status 'finished', wheel null, spun true nên không bị hiểu là ván dở / chờ quay.
- Thay đổi so với bản M4 nhận vào: sửa css/blackjack.css, js/api.js, js/i18n.js, js/main.js, js/host-admin.js, js/blackjack/{blackjack,blackjack-engine,blackjack-render}.js, README.md, TESTING.md; thêm sql/12-blackjack.sql, tests/{bj_fake_server.py, blackjack-server-check.py, blackjack-host-check.py, blackjack-sql-sim.py}; cập nhật tests/{blackjack-engine.test.js, blackjack-integration-check.py}. index.html, host.html không đổi trong phần này.
- CHƯA làm được: chạy sql/12-blackjack.sql trên PostgreSQL thật; thử với Supabase thật; thử trên điện thoại/Safari thật.

## Sau M8 – ảnh nút Blackjack
- Nút Blackjack ở trang chủ dùng ảnh assets/images/btn-blackjack.png (do bạn cung cấp, thu về 640x277 như btn-start/btn-setting; 2,2 MB -> 215 KB). index.html: <button id="btn-blackjack"> chứa <img>, aria-label theo i18n (home.blackjack). Đã bỏ phần nút vẽ bằng CSS trong css/blackjack.css. Để đổi ảnh sau này: thay file PNG (giữ tỉ lệ ~2,3:1, rộng 640px).
