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
