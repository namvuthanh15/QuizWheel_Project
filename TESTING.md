# Kiểm thử QuizWheel (Milestone 8)

Đã kiểm tra tự động 144 mục trên Chrome (Chromium) với 3 cách mở: qua server có thư mục con (giống GitHub Pages),
và bấm đúp `index.html` (file://). Kết quả: **tất cả đạt** sau khi sửa các lỗi ghi ở cuối file.

## Quiz
- [x] Dữ liệu hợp lệ / kho trống / kho thiếu câu / LocalStorage hỏng / dữ liệu sai cấu trúc
- [x] Đáp án đúng, đáp án sai (chỉ đánh dấu ô sai, KHÔNG lộ đáp án đúng, không hiện giải thích)
- [x] Bấm đáp án dồn dập (điểm chỉ cộng một lần), ô khóa sau khi chọn
- [x] Hết giờ (không lộ đáp án), sang câu mới chỉ có 1 timer, rời quiz thì timer dừng
- [x] 2 câu bốc ngẫu nhiên không trùng nhau; câu cuối; mốc điểm Easy (100 / còn lại) và Hard (100 / 25-75 / 0)
- [x] Impossible: đúng cả 2 ý, đúng 1 ý, bỏ trống, hết giờ, gõ năm 2 số, ô chỉ nhận chữ số
- [x] Chữ có thẻ HTML được hiển thị nguyên văn, không chạy

## Spin the Wheel
- [x] Góc dừng trùng ô kim chỉ: 300 vòng thử cho mỗi mức, và các vòng 2/3/7/13/20 ô
- [x] Chỉ quay 1 lần khi chơi thật; bấm đúp không quay hai lần; kết quả chỉ hiện sau khi dừng hẳn
- [x] 0 ô và 1 ô: khóa nút Quay, có hướng dẫn
- [x] Thêm / sửa / xóa; tối đa 20 ô; giá trị rỗng, số âm, số thập phân; lưu và tải lại
- [x] Nhãn rất dài, ký tự lạ, thẻ HTML
- [x] Rời màn hình khi đang quay

## Website
- [x] Không lỗi JS, không 404, mọi đường dẫn đúng chữ hoa/thường (GitHub Pages phân biệt hoa thường)
- [x] Không tràn ngang ở 360, 390, 768, 1280, 1920 px trên 10 màn hình
- [x] Bàn phím: Tab, Enter, Space; nút và ô nhập đều có tên cho trình đọc màn hình
- [x] Tương phản chữ đạt 4.5:1; hỗ trợ giảm chuyển động (nền tắt, vòng quay quay ngắn)
- [x] Soạn câu hỏi: lỗi nhập, ảnh meme (tự thu nhỏ), file không phải ảnh, ảnh hỏng
- [x] Xuất / nhập file: JSON hỏng, sai cấu trúc, ảnh SVG lạ bị loại, bộ nhớ đầy báo lỗi
- [x] Đổi ngôn ngữ (vi/en), nhớ sau khi tải lại; âm lượng được lưu

## Bổ sung sau khi thêm "Đảo vị trí đáp án"
- [x] Đảo BẬT: đáp án đúng đổi chỗ giữa các lượt, ảnh đi cùng đáp án của nó, bấm ô đúng vẫn được tính, kho câu hỏi gốc không bị đổi
- [x] Đảo TẮT: giữ đúng thứ tự A,B,C,D; Easy và Hard bật/tắt độc lập; cài đặt được nhớ; cài đặt bản cũ vẫn dùng được
- [x] Chữ rất dài không có dấu cách (câu hỏi, đáp án, giải thích, nhãn vòng quay): không tràn ngang
- [x] Chạm bằng ngón tay (điện thoại giả lập): Start, chọn mức, đáp án, quay vòng quay
- [x] Xem thử vòng quay chỉ có trong phần soạn của host; thanh trên cùng không còn nút "Vòng quay"

## Dữ liệu đăng kèm web (Milestone 9)
- [x] Khách mở web công khai (tên miền không phải localhost, LocalStorage trống) thấy đúng 20 câu Easy, 30 câu Hard, 1 câu Impossible, 3 vòng quay (19/10/8 ô), ảnh "thua", 60 giây, đảo đáp án
- [x] Chơi thật bằng dữ liệu đó: Easy, Hard (có câu toàn ảnh), Impossible (thắng, thua có ảnh, không lộ ngày đúng), Free
- [x] Khách không thấy nút "Soạn câu hỏi" và không vào được màn hình soạn bằng đường khác
- [x] `?host=1` bật chế độ host (được nhớ), `?host=0` tắt; `file://` và `localhost` luôn là host
- [x] Dữ liệu riêng trong trình duyệt được ưu tiên hơn `seed.js`; "Khôi phục mặc định" quay về dữ liệu đăng kèm
- [x] Thiếu `seed.js` (404) hoặc `seed.js` sai cấu trúc/ảnh lạ: tự rơi về bộ mẫu, không lỗi

## Cần bạn thử bằng tay (máy tự động không làm được)
- [ ] Điện thoại thật (iPhone Safari, Android Chrome): chạm, cuộn, vòng quay mượt không
- [ ] Nghe thật: nhạc nền, tiếng click, tiếng sai, tiếng wow; âm lượng kéo thanh
- [ ] Soạn câu hỏi bằng ảnh meme thật từ điện thoại
- [ ] Mở link sau khi đăng lên mạng bằng một thiết bị khác (Milestone 9)

## Lỗi đã sửa trong Milestone 8
1. Rời vòng quay khi đang quay: kết quả và tiếng "wow" vẫn hiện ở màn hình khác.
2. Màn hình Soạn vòng quay bị tràn ngang trên điện thoại (nút Xóa chạy ra ngoài).
3. Ảnh "thua" rỗng ở màn kết quả hiện thành một chấm nhỏ (CSS đè thuộc tính hidden). Đã thêm quy tắc chung `[hidden]`.
4. Chữ footer khó đọc trên nền cam đậm (độ tương phản 3.6, nay 4.8).
5. Vòng quay chưa tôn trọng chế độ giảm chuyển động.
6. Bấm đúp "Quay thưởng" có thể mở vòng quay hai lần; trạng thái câu nhập ngày cũ còn sót khi chơi mức khác.
7. Chữ rất dài không có dấu cách (200 ký tự liền) làm trang bị kéo rộng ngang gần 4000px. Đã cho chữ do host nhập tự ngắt dòng.
