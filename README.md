# QuizWheel (demo)
Mở `index.html` bằng Chrome/Edge (hoặc Live Server) để chạy. Không cần cài thêm gì.

## Luồng chơi hiện có
- **Free (1K)**: vào thẳng vòng quay Free, quay 1 lần.
- **Easy (2 - 10K)**: bốc ngẫu nhiên 2 câu từ kho câu hỏi Easy, mỗi câu đúng +50 điểm (mỗi câu chỉ chọn 1 lần).
  - Đạt 100 điểm -> quay vòng quay **Easy**.
  - Còn lại (đúng 1 câu hoặc sai hết) -> quay vòng quay **Free**.
- **Hard (20 - 50K)**: bốc ngẫu nhiên 4 câu từ kho câu hỏi Hard, mỗi câu đúng +25 điểm.
  - Đủ 100 điểm -> vòng quay **Hard**; 25 - 75 điểm -> vòng quay **Easy**; 0 điểm -> vòng quay **Free**.
- **Impossible (100K)**: không dùng A/B/C/D và không có vòng quay. Bốc ngẫu nhiên 1 câu gồm 2 ý, người chơi gõ 2 hàng ngày/tháng/năm (`__/__/__`).
  - Đúng cả 2 ý -> "Chúc mừng, bạn đã thắng 100K!".
  - Không đủ 2 ý -> hiện bức ảnh do host tải lên (Setting > Câu hỏi > Impossible).

## Setting (host)
- Tab **Câu hỏi**: chọn mức (Easy / Hard / Impossible) rồi soạn kho câu hỏi riêng (Easy cần >= 2 câu, Hard cần >= 4 câu), chỉnh thời gian mỗi câu, và bật/tắt **Đảo vị trí đáp án** riêng cho Easy và Hard (mặc định bật: mỗi lần chơi, 4 đáp án kèm ảnh được xáo trộn A/B/C/D).
- Tab **Vòng quay**: chọn mức (Free / Easy / Hard) rồi chỉnh giá trị, số ô, màu riêng cho từng vòng.
  - Nút **Xem thử vòng quay** nằm ngay trong tab này (quay không giới hạn, để host kiểm tra). Thanh trên cùng không còn nút "Vòng quay", nên người chơi chỉ vào được vòng quay sau khi làm xong quiz.

## Dữ liệu đăng kèm web và chế độ host
- **`data/seed.js`** chứa bộ câu hỏi, vòng quay, ảnh "thua" và cài đặt mà MỌI người chơi sẽ thấy khi mở link.
- **Cập nhật dữ liệu (cách mới, khuyên dùng):** dùng tab **Đăng web** (xem mục "Đăng web" bên dưới), không cần xuất/nhập file hay GitHub Desktop.
- **Cập nhật dữ liệu (cách thủ công cũ, vẫn dùng được):** ở máy bạn vào Setting > Soạn câu hỏi > **Xuất file**, mở file `.json` bằng Visual Studio, Ctrl+A rồi dán đè lên phần sau dấu `=` trong `data/seed.js` (giữ dấu `;` ở cuối), sau đó commit/push lại. Dữ liệu sửa riêng trong trình duyệt (LocalStorage) luôn được ưu tiên hơn `seed.js`; nút "Khôi phục mặc định" sẽ quay về đúng dữ liệu đăng kèm.
- **Chế độ host:** khi mở bằng `file://` hoặc `localhost` thì luôn có nút "Soạn câu hỏi". Trên web công khai, nút này bị ẩn với người chơi (vì màn hình soạn lộ đáp án đúng). Host mở link một lần với đuôi `?host=1` (ví dụ `https://tên-bạn.github.io/QuizWheel/?host=1`) để bật trên trình duyệt của mình, `?host=0` để tắt. Đây chỉ là cách ngăn xem lén thông thường, không phải bảo mật: dữ liệu nằm trong file `seed.js` công khai.
- Thư mục có file `.nojekyll` để GitHub Pages phục vụ nguyên các file, không xử lý bằng Jekyll.

## Đăng web (tab thứ 3 trong màn hình host)
Tab **Đăng web** ghi thẳng `data/seed.js` vào repo GitHub của bạn bằng GitHub REST API, thay cho các bước Xuất file > dán vào `seed.js` > commit/push.

**Cách dùng**
1. Mở web ở chế độ host, vào Setting > Soạn câu hỏi > tab **Đăng web**.
2. Kiểm tra 4 ô: **Tài khoản GitHub (owner)**, **Tên repo**, **Nhánh** (mặc định `main`), **Đường dẫn file** (mặc định `data/seed.js`, chỉ nhận file `.js`). Khi web chạy trên GitHub Pages (`<owner>.github.io/<repo>/`) hai ô đầu được điền sẵn. Giá trị này được nhớ trong trình duyệt (KHÔNG gồm mã).
3. Dán **mã truy cập (token)** vào ô mã (xem cách tạo ở dưới). Có nút **Hiện mã** / **Xóa mã**.
4. Xem phần **Tóm tắt trước khi đăng** (số câu hỏi mỗi mức, số ô mỗi vòng quay, có ảnh "thua" không, dung lượng file mới).
5. Bấm **Đăng lên web** và xác nhận. Dữ liệu sẽ ghi đè file và **hiện công khai cho mọi người, kể cả đáp án đúng**. Thành công thì có link xem commit.
6. GitHub Pages cần khoảng 1-2 phút để dựng lại; người chơi có thể phải làm mới trang (Ctrl+F5) hoặc đợi vài phút do bộ nhớ đệm.

**Cách tạo token (kiểm tra lại tên menu trên GitHub vì có thể đổi)**
GitHub > ảnh đại diện > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token. Chọn Resource owner là tài khoản của bạn; Expiration ngắn (ví dụ 30 ngày); Repository access: Only select repositories, chọn đúng repo QuizWheel; Permissions > Repository permissions > Contents: Read and write; bấm Generate token rồi sao chép mã (chỉ hiện một lần). Không gửi mã cho ai, không dán vào chat hay vào file trong repo.

**Bảo mật**
- Mã chỉ lưu trong `sessionStorage` (đóng tab là mất), không vào LocalStorage, không vào file xuất, không vào `seed.js`, không vào URL, không in ra console. Mở web với `?host=0` sẽ xóa mã.
- Web chỉ gọi `https://api.github.com`, không tải thư viện ngoài. Người chơi không thấy tab này; hàm đăng cũng từ chối khi không ở chế độ host.
- Đây vẫn là web không có máy chủ: ai chiếm được trình duyệt của host khi mã còn trong phiên thì dùng được mã. Vì vậy hãy dùng mã chỉ cấp cho 1 repo, quyền Contents, hạn ngắn, và bấm **Xóa mã** khi dùng xong.

**Lỗi thường gặp**
- 401: mã sai/hết hạn, tạo mã mới. 403: mã thiếu quyền Contents ghi, hoặc bị giới hạn tốc độ (đợi vài phút). 404: sai tên tài khoản/repo/nhánh, hoặc mã chưa được cấp quyền vào repo. 409/422: file vừa bị sửa ở nơi khác (web tự thử lại 1 lần, nếu vẫn lỗi thì bấm đăng lại).
- File lớn hơn 1 MB sẽ có cảnh báo; lớn hơn 5 MB thì bị chặn (hãy bớt ảnh).
