# QuizWheel

Web game lì xì: người chơi đăng nhập bằng tên + PIN, rút 9 bao lì xì đầu tiên để nhận lượt, rồi chọn mức **Free / Easy / Hard / Impossible**,
trả lời câu hỏi và quay vòng quay / rút bao lì xì nhận thưởng. Giao diện HTML/CSS/JavaScript thuần, dữ liệu và luật chơi nằm trên **Supabase**
(server giữ đáp án đúng, số lượt, kết quả quay và lịch sử), web đăng bằng **GitHub Pages**.

## Hai trang web
| Trang | Ai dùng | Làm gì |
|---|---|---|
| `index.html` | Người chơi | Đăng nhập, rút lì xì, chơi các mức, xem lịch sử, chỉnh âm lượng/ngôn ngữ |
| `host.html` | Host | Nhập mật khẩu host rồi quản lý người chơi (lượt, trả thưởng, lịch sử), câu hỏi, vòng quay, cài đặt, nạp/sao lưu dữ liệu |

## Cấu trúc thư mục
```
index.html           trang người chơi
host.html            trang quản lý của host
css/                 style.css (nền), components.css (giao diện), animations.css, home-bg.css, responsive.css
js/
  config.js          địa chỉ Supabase + khóa công khai (anon)
  api.js             gọi các hàm api_* / admin_* trên Supabase
  main.js            điều phối màn hình, đăng nhập, lịch sử
  quiz.js            quiz trắc nghiệm + nhập ngày (Impossible)
  wheel.js           vòng quay (Canvas)
  bags.js, lixi.js   rút bao lì xì sau khi quay / lúc đăng nhập lần đầu
  gacha.js           bảng chọn Quiz/GACHA ở mức Impossible + máy quay số ba cuộn chủ đề Tết
  store.js           giá, nhãn mức, vòng quay công khai từ server, âm lượng, bộ kiểm tra dữ liệu dùng chung với trang host
  i18n.js, lang.js   đa ngôn ngữ vi/en
  audio.js, settings.js, ui.js   âm thanh, màn Setting, tiện ích giao diện
  host-admin.js      toàn bộ trang host.html
  blackjack/         trò chơi Blackjack: cards (52 lá vẽ bằng code), engine (luật), render, animation, audio, blackjack.js (điều khiển)
data/seed.js         dữ liệu mẫu, CHỈ trang host dùng để "nạp" lên server lần đầu (xem mục bảo mật)
sql/                 các file chạy trong Supabase (xem bên dưới)
assets/              ảnh, nhạc, âm thanh
```

## Thiết lập từ đầu
1. **Supabase:** tạo project, vào SQL Editor và chạy lần lượt `sql/01-schema.sql` đến `sql/12-blackjack.sql`
   (chạy lại nhiều lần vẫn an toàn). `08a-reset-demo-data.sql` chỉ dùng khi muốn xóa dữ liệu thử. Đặt mật khẩu host bằng `02-admin-key.sql`.
2. **`js/config.js`:** điền địa chỉ project và khóa công khai (anon key) của Supabase.
3. **GitHub Pages:** đưa toàn bộ thư mục lên repo (để `index.html` ở gốc, giữ file `.nojekyll`), vào Settings → Pages → Deploy from a branch → nhánh `main`, thư mục `/ (root)`.
4. Mở `host.html`, nhập mật khẩu host, vào tab **Nạp / sao lưu** để đưa câu hỏi và vòng quay lên server (từ `data/seed.js` hoặc từ file xuất).

## GACHA ở mức Impossible
Bấm Impossible sẽ hiện bảng chọn **Trả lời quiz** hoặc **GACHA** (máy quay số ba cuộn). Luật (do server giữ, chạy bằng `sql/11-gacha.sql`):
- Mỗi người chơi có **1 lượt Gacha**; quay tốn **1 lượt chơi**. Ba bao lì xì đỏ = thắng lớn, nhận đúng giải Impossible (cài ở tab Cài đặt).
- Quay xong (trúng **hay trượt**) mức Impossible bị **khóa**. Thắng quiz Impossible cũng khóa. Chọn làm quiz thì mất lượt Gacha.
- Host mở lại ở tab Người chơi (nút **Mở lại Impossible**): gỡ khóa và cấp thêm 1 lượt Gacha.
- Xác suất thắng lớn: mặc định ở tab Cài đặt, và **tỉ lệ riêng cho từng người** ở tab Người chơi (nút **Tỉ lệ Gacha**). Con số này chỉ host thấy, trình duyệt người chơi không bao giờ nhận được.
- Kết quả ba cuộn do server chọn trước, hoạt ảnh chỉ diễn lại nên không thể gian lận bằng cách tải lại trang. Ván Gacha được ghi vào Lịch sử.

## Cập nhật nội dung
Soạn câu hỏi, vòng quay, cài đặt và lượt chơi trực tiếp ở `host.html`; thay đổi có hiệu lực ngay cho người chơi, không cần đăng lại web.
Chỉ khi sửa code (`css/`, `js/`, `*.html`) mới phải Commit và Push lại.

## Bảo mật cần nhớ
- Đáp án đúng nằm trên server, trang người chơi không tải bộ câu hỏi. **`data/seed.js` thì có chứa đáp án đúng** và là file công khai trên GitHub Pages:
  sau khi đã nạp lên server, nên xóa file này khỏi repo (hoặc để ở máy bạn, không đăng) nếu không muốn ai đọc được đáp án.
- Khóa trong `config.js` là khóa công khai, an toàn khi nằm trong web. Mật khẩu host không bao giờ nằm trong mã nguồn.
- Mọi thứ chạy trên trình duyệt người chơi, nên chỉ coi là chơi vui, không dùng cho phần thưởng có giá trị lớn mà không có bước kiểm tra thủ công của host.


## Blackjack (cược bằng số dư lì xì)
Nút **Blackjack** ở trang chủ (cần đăng nhập). Không tiêu lượt Quiz / Gacha. Ván chơi **cược bằng số dư lì xì** của người chơi (số dư = “Đã trúng” − “Đã trả” ở tab Người chơi), do server giữ hoàn toàn (`sql/12-blackjack.sql`).
- **Luật:** chia người chơi, nhà cái, người chơi, nhà cái (úp); Ace 1 hoặc 11; Blackjack tự nhiên = 2 lá đầu đủ 21; nhà cái xem bài ngay khi chia, rút tới 17 và **dừng ở soft 17**; không có Double / Split / Insurance. Đạt 21 thì tự dừng bài.
- **Tiền:** cược từ ¼ số dư (làm tròn xuống, tối thiểu 0,1K) đến toàn bộ, bước 0,1K, trừ ngay khi chia. Thắng +1× cược, Blackjack tự nhiên +1,5×, hòa hoàn cược, thua / quá 21 / nhà cái Blackjack mất cược. **Thoát giữa ván hoặc tải lại trang = thua.** Số dư dưới 0,1K thì không chơi được.
- **Độ khó:** bài chia thật nhưng các lá rút thêm bị **thiên lệch nhẹ** theo “bậc” của người chơi (bậc = số ván đã thắng; không tự về 0, host đặt lại được). Chuỗi mặc định là tỉ lệ thắng mục tiêu của người chơi dùng chiến thuật cơ bản: **50, 40, 33, 27, 22 %** (xấp xỉ, sàn khả thi khoảng 21%; người chơi ẩu thắng ít hơn khoảng 10 điểm). Mỗi ván thua cộng 3 điểm % cho tới mức của bậc trước, hòa giữ nguyên, thắng thì sang bậc sau. Người chơi chỉ thấy thanh “Độ khó” và bảng luật, **không thấy con số %**.
- **Host (tab Cài đặt → thẻ Blackjack):** bật/tắt (tắt thì nút ở trang chủ ẩn) và đặt chuỗi %. **Tab Người chơi:** nhãn “Blackjack thắng N”, menu Thêm → Blackjack → **Đặt lại độ khó**; Lịch sử (người chơi và host) có ván Blackjack kèm cược, kết quả, tiền.
- **Bảo mật:** bộ bài còn lại và lá úp nằm trong bảng `bj_games` (bật RLS, không có policy) nên trình duyệt không đọc được; tiền cược trừ ở server trước khi trình duyệt thấy bài; mỗi người chỉ có một ván mở. Trình duyệt chỉ phát lại bài server đưa và phải khớp kết quả server (lệch thì báo lỗi và tải lại số dư).
- **Đã thêm vào `sql/12-blackjack.sql`** (không đổi hàm cũ, chỉ thêm trường): cột `players.bj_wins`, `players.bj_rate`, `app_config.bj_enabled`, `app_config.bj_chain`; bảng `bj_games`; loại ván `blackjack` trong `plays`; hàm `api_bj_*`, `admin_bj_config`, `admin_bj_reset_wins`.
- Mã nguồn: `js/blackjack/` và `css/blackjack*.css`. Mọi lá bài vẽ bằng HTML / CSS / SVG, không có ảnh bài. Âm thanh Blackjack tự tổng hợp và dùng chung thanh Sound ở Setting.
- Chưa có Supabase (chưa điền `config.js`) thì Blackjack chỉ chạy chế độ thử, không cược.
- Tiến độ và quyết định thiết kế: xem `BLACKJACK_LOG.md`. Kiểm thử: xem `TESTING.md`.

### Triển khai Blackjack
1. Supabase → SQL Editor: chạy `sql/12-blackjack.sql` (chạy lại nhiều lần vẫn an toàn).
2. Commit và Push toàn bộ thư mục lên GitHub Pages như thường lệ.
3. Mở `host.html` → tab Cài đặt → thẻ **Blackjack** để kiểm tra bật/tắt và chuỗi %.
4. Đăng nhập một người chơi thử, chơi một ván nhỏ, rồi xem Lịch sử và tab Người chơi của host để chắc số dư khớp.
