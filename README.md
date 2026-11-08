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
  store.js           giá, nhãn mức, vòng quay công khai từ server, âm lượng, bộ kiểm tra dữ liệu dùng chung với trang host
  i18n.js, lang.js   đa ngôn ngữ vi/en
  audio.js, settings.js, ui.js   âm thanh, màn Setting, tiện ích giao diện
  host-admin.js      toàn bộ trang host.html
data/seed.js         dữ liệu mẫu, CHỈ trang host dùng để "nạp" lên server lần đầu (xem mục bảo mật)
sql/                 các file chạy trong Supabase (xem bên dưới)
assets/              ảnh, nhạc, âm thanh
```

## Thiết lập từ đầu
1. **Supabase:** tạo project, vào SQL Editor và chạy lần lượt `sql/01-schema.sql` đến `sql/10-lixi-values.sql`
   (chạy lại nhiều lần vẫn an toàn). `08a-reset-demo-data.sql` chỉ dùng khi muốn xóa dữ liệu thử. Đặt mật khẩu host bằng `02-admin-key.sql`.
2. **`js/config.js`:** điền địa chỉ project và khóa công khai (anon key) của Supabase.
3. **GitHub Pages:** đưa toàn bộ thư mục lên repo (để `index.html` ở gốc, giữ file `.nojekyll`), vào Settings → Pages → Deploy from a branch → nhánh `main`, thư mục `/ (root)`.
4. Mở `host.html`, nhập mật khẩu host, vào tab **Nạp / sao lưu** để đưa câu hỏi và vòng quay lên server (từ `data/seed.js` hoặc từ file xuất).

## Cập nhật nội dung
Soạn câu hỏi, vòng quay, cài đặt và lượt chơi trực tiếp ở `host.html`; thay đổi có hiệu lực ngay cho người chơi, không cần đăng lại web.
Chỉ khi sửa code (`css/`, `js/`, `*.html`) mới phải Commit và Push lại.

## Bảo mật cần nhớ
- Đáp án đúng nằm trên server, trang người chơi không tải bộ câu hỏi. **`data/seed.js` thì có chứa đáp án đúng** và là file công khai trên GitHub Pages:
  sau khi đã nạp lên server, nên xóa file này khỏi repo (hoặc để ở máy bạn, không đăng) nếu không muốn ai đọc được đáp án.
- Khóa trong `config.js` là khóa công khai, an toàn khi nằm trong web. Mật khẩu host không bao giờ nằm trong mã nguồn.
- Mọi thứ chạy trên trình duyệt người chơi, nên chỉ coi là chơi vui, không dùng cho phần thưởng có giá trị lớn mà không có bước kiểm tra thủ công của host.
