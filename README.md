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
- **Cập nhật dữ liệu:** ở máy bạn vào Setting > Soạn câu hỏi > **Xuất file**, mở file `.json` bằng Visual Studio, Ctrl+A rồi dán đè lên phần sau dấu `=` trong `data/seed.js` (giữ dấu `;` ở cuối), sau đó commit/push lại. Dữ liệu sửa riêng trong trình duyệt (LocalStorage) luôn được ưu tiên hơn `seed.js`; nút "Khôi phục mặc định" sẽ quay về đúng dữ liệu đăng kèm.
- **Chế độ host:** khi mở bằng `file://` hoặc `localhost` thì luôn có nút "Soạn câu hỏi". Trên web công khai, nút này bị ẩn với người chơi (vì màn hình soạn lộ đáp án đúng). Host mở link một lần với đuôi `?host=1` (ví dụ `https://tên-bạn.github.io/QuizWheel/?host=1`) để bật trên trình duyệt của mình, `?host=0` để tắt. Đây chỉ là cách ngăn xem lén thông thường, không phải bảo mật: dữ liệu nằm trong file `seed.js` công khai.
- Thư mục có file `.nojekyll` để GitHub Pages phục vụ nguyên các file, không xử lý bằng Jekyll.
