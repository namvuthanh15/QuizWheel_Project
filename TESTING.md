# Kiểm thử QuizWheel

## Đã kiểm tra tự động sau đợt dọn code (30/10/2026)
Dùng Chromium (Playwright) với máy chủ Supabase **giả lập** (không dùng dữ liệu thật):
- [x] Trang người chơi: tải không lỗi JS, không 404; chỉ tải các file còn dùng (18 file, khoảng 154 KB thay vì 727 KB)
- [x] Đăng nhập sai PIN (báo lỗi) và đúng PIN; rút 1 trong 9 bao lì xì đầu tiên; thanh trên hiện tên và số lượt
- [x] Giá các mức hiển thị theo vòng quay (Free 2K, Easy 3 - 20K, Hard 20 - 50K, Impossible 100K)
- [x] Free: xác nhận, quay, kết quả, nút "Chơi tiếp"
- [x] Easy: chọn số câu, trả lời đúng hết -> vòng quay Easy -> ra số bao -> rút bao -> tổng tiền; trả lời sai hết -> vòng quay Free
- [x] Chọn sai chỉ đánh dấu ô sai, không lộ đáp án đúng
- [x] Lịch sử: hiện danh sách và tổng kết (đã trúng / host đã trả / còn chờ nhận)
- [x] Impossible: nhập hai ngày, thắng 100K
- [x] Setting: âm lượng, đổi ngôn ngữ vi/en; đăng xuất; mở lại trang vẫn còn đăng nhập
- [x] Điện thoại 390px: không tràn ngang ở màn lì xì, chọn mức, chọn số câu, quiz, lịch sử
- [x] Trang host: tải không lỗi, đăng nhập (giả lập), chuyển đủ 5 tab không lỗi
- [x] ESLint: không còn biến/hàm không dùng, không có tham chiếu tới thứ không tồn tại; mọi khóa dịch vi/en khớp nhau và không có khóa mồ côi

## Cần bạn thử bằng tay với Supabase thật
- [ ] Đăng nhập bằng một tài khoản thật, rút lì xì, chơi đủ Free / Easy / Hard / Impossible
- [ ] Màn **Lịch sử** của người chơi hiển thị đúng dữ liệu thật (trong bản giả lập thì hiển thị bình thường)
- [ ] Host trả thưởng, đổi số lượt, sửa câu hỏi/vòng quay rồi người chơi thấy thay đổi
- [ ] Điện thoại thật: chạm, cuộn, nhạc và âm thanh

## Đã kiểm tra khi thêm GACHA (mức Impossible)
**Server (SQL chạy thật trên PostgreSQL 16 cùng 01 đến 11):** 12 nhóm kiểm tra đạt
- [x] `11-gacha.sql` chạy lại nhiều lần không lỗi
- [x] Trúng lớn: ba cuộn [0,0,0], giải 100K, trừ 1 lượt, khóa Impossible, ghi ván và tiền thưởng
- [x] Trượt: khóa luôn, không có giải, ba cuộn không bao giờ giống nhau
- [x] Xác suất đúng thống kê: riêng 30% (867/3000), mặc định 5% (172/3000), mặc định 50% (1020/2000), 100% luôn trúng, 0% không bao giờ trúng
- [x] Đã khóa thì không quay lại, không làm quiz Impossible, không bị trừ lượt; hết lượt chơi thì từ chối, không khóa
- [x] Chọn quiz thì mất lượt Gacha; thua quiz không khóa; thắng quiz khóa; host mở lại thì cấp thêm 1 lượt Gacha
- [x] Đang có ván dở thì không quay Gacha; 8 yêu cầu quay song song chỉ 1 yêu cầu thành công
- [x] Trình duyệt không nhận được xác suất; sai mật khẩu host thì không đổi được xác suất / mở lại / mặc định
- [x] Quyền: người chơi (anon) không đọc được bảng, không gọi được hàm nội bộ

**Giao diện (máy chủ giả lập):** 34 mục đạt: bảng chọn, hủy / xác nhận, quay trúng và trượt, ba cuộn dừng đúng ô server trả về (lệch 0px), bấm dồn chỉ 1 lần quay, nhãn ĐÃ KHÓA, Lịch sử, rời màn hình khi đang quay, tiếng Anh, giảm chuyển động, điện thoại 360 và 390px.
**Trang host:** 16 mục đạt (tỉ lệ riêng, bỏ tỉ lệ riêng, nhập sai, mở lại, tỉ lệ mặc định, server chưa chạy 11-gacha.sql). **Hồi quy** các luồng cũ: 19 mục đạt.

## Cần bạn thử bằng tay với Supabase thật
- [ ] Chạy `sql/11-gacha.sql` trong SQL Editor, tải lại `host.html`: không còn dòng nhắc chạy 11-gacha.sql
- [ ] Đặt tỉ lệ riêng 100% cho một tài khoản thử, quay Gacha: phải trúng lớn; đặt 0%: phải trượt
- [ ] Mở lại Impossible ở host: người chơi thấy mức hết khóa và quay được lần nữa
- [ ] Cảm giác hoạt ảnh, âm thanh (tiếng "OMG" khi trúng, tiếng mèo cười khi trượt) trên điện thoại thật

## Đã kiểm tra khi gọn lại cột "Thao tác" ở trang host
- [x] Bảng người chơi gộp còn 6 cột (Tên, Lượt, Còn nợ, Impossible, Lần cuối, Thao tác); Free đã dùng, rút lì xì, số ván, trúng / đã trả, lượt Gacha còn nằm ở dòng nhỏ dưới giá trị chính
- [x] Tỉ lệ Gacha riêng KHÔNG hiện số ở bảng (chỉ nhãn "riêng"); số thật chỉ thấy trong hộp "Tỉ lệ Gacha"
- [x] Mỗi dòng có 3 nút chính (Đã trả, ± Lượt, Lịch sử) và menu "Thêm ▾" chia nhóm Lượt chơi / Impossible & Gacha / Tài khoản, mục Xóa tách riêng màu đỏ
- [x] Menu: bấm ra ngoài / Esc đóng và trả focus, ↑ ↓ chọn mục, mở menu khác thì menu cũ đóng, luôn nằm trong màn hình (hết chỗ thì mở lên trên), không đóng khi chỉ đổi chiều cao (thanh địa chỉ điện thoại) hoặc cuộn trong menu
- [x] Mọi thao tác cũ vẫn chạy đúng (Đã trả, ± Lượt, Lịch sử, Mở lại Impossible, Tỉ lệ Gacha, Xóa có xác nhận)
- [x] Điện thoại 360 và 390px: mỗi người chơi là một thẻ dọc (ẩn dòng tiêu đề, nhãn từng ô), nút cao tối thiểu 38px, mục menu cao tối thiểu 39px, không tràn ngang


## Blackjack (M1 đến M8)
Chạy tự động (cần Node 20+, Python 3, Playwright + Chromium; không cần mạng thật). Kết quả lần chạy cuối (M8):
- `node --test tests/blackjack-engine.test.js` – luật, điểm, Ace, Blackjack tự nhiên, nhà cái, hành động sai, chế độ server (feed / setHole): **38/38**
- `python3 tests/blackjack-visual-check.py` – 52 lá, mặt sau, bố cục máy tính / 600px / điện thoại ngang: **22 mục đạt**
- `python3 tests/blackjack-anim-check.py` – thứ tự chia, lá úp, điểm không lộ sớm, HIT/STAND, hủy giữa chừng, bấm dồn, giảm chuyển động: **50 mục đạt**
- `python3 tests/blackjack-integration-check.py` – mở từ trang chủ, bắt buộc đăng nhập, thoát / điều hướng / đăng xuất giữa ván, đổi ngôn ngữ, âm thanh theo thiết lập, 360 / 390px: **32 mục đạt**
- `python3 tests/blackjack-server-check.py` – chế độ server với máy chủ giả: số dư, thanh cược ¼ đến hết, thắng / Blackjack 1,5× / quá 21, tự dừng ở 21, thoát có xác nhận, ván dở, lỗi mạng, lệch kết quả, hết tiền, host tắt, bấm dồn, đổi ngôn ngữ, Lịch sử, 360px, **80 ván ngẫu nhiên**: **44 mục đạt**
- `python3 tests/blackjack-host-check.py` – trang host: thẻ Blackjack, kiểm tra chuỗi %, đặt lại độ khó, Lịch sử, server cũ chưa có SQL, 360px: **22 mục đạt**
- `python3 tests/blackjack-sql-sim.py` – mô phỏng thuật toán chia bài thiên lệch + hồi phục (in bảng tỉ lệ thắng theo bậc; **không phải chạy SQL thật**)
- Kiểm tra tĩnh: `node --check` mọi file JS, bộ khóa i18n vi/en khớp nhau (214/214), không có ảnh hoặc URL ngoài trong code Blackjack.

**Giới hạn của các test trên:** máy chủ trong `tests/bj_fake_server.py` là bản cài lại hợp đồng và thuật toán của `sql/12-blackjack.sql` bằng Python. Nó cho biết giao diện và logic khớp với thiết kế, **không chứng minh file SQL chạy đúng trên PostgreSQL thật**. Máy kiểm thử không có PostgreSQL.

Cần bạn thử bằng tay (chưa thể thử trong môi trường này):
- [ ] **Chạy `sql/12-blackjack.sql` trên Supabase thật** và xem có báo lỗi không (rồi chạy lại lần hai để chắc không lỗi)
- [ ] Chơi 1 ván thật: số dư trừ đúng cược ngay khi chia; thắng +1×, Blackjack tự nhiên +1,5×, hòa hoàn cược, thua mất cược; số dư và Lịch sử khớp
- [ ] Thoát giữa ván (nút Thoát, đóng tab, tải lại trang): ván bị tính thua, không hoàn cược, không kẹt ván mở
- [ ] Bấm HIT / STAND thật nhanh nhiều lần, và mở hai tab cùng một tài khoản: không bị trừ cược hai lần, không ra hai ván mở
- [ ] Host: bật/tắt Blackjack (nút trang chủ ẩn/hiện sau khi tải lại), đổi chuỗi %, Đặt lại độ khó; tab Người chơi “Còn nợ” khớp sau vài ván thắng/thua
- [ ] Cảm giác độ khó: chơi nhiều ván ở bậc 1 xem tỉ lệ thắng có gần mục tiêu không (cần vài chục ván mới đủ mẫu)
- [ ] Điện thoại thật và Safari: chạm, độ mượt hoạt ảnh, âm thanh Blackjack (Safari cần chạm trang một lần trước khi có tiếng), thanh cược kéo bằng ngón tay
- [ ] Kéo thanh Sound ở Setting về 0 rồi chơi Blackjack: phải im lặng; kéo lại thì có tiếng
- [ ] Quiz, Gacha, lì xì, Lịch sử với Supabase thật sau khi thêm Blackjack (mới hồi quy bằng máy chủ giả lập)
