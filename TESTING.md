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

## Tab "Đăng web" (Milestone 10)
Kiểm tra tự động bằng Playwright + Chromium: **245 mục, tất cả đạt**. GitHub được giả lập bằng `page.route("https://api.github.com/**")`, dùng token GIẢ, web chạy qua `python -m http.server` từ thư mục cha (có thư mục con) và qua tên miền công khai `quizwheel.test` (ánh xạ về 127.0.0.1).
- [x] Luồng thành công (22 mục): đúng 1 GET rồi 1 PUT; URL/header đúng; body có message/content/sha/branch; base64 giải mã khớp từng byte (tiếng Việt, emoji, `</script>`, U+2028); giữ khối comment đầu file; link commit mở tab mới với `rel="noopener noreferrer"`
- [x] Đăng lại đúng dữ liệu hiện có thì file sinh ra giống hệt `data/seed.js` hiện tại (từng byte)
- [x] Vòng khứ hồi: phục vụ lại nội dung đã PUT làm `seed.js` cho ngữ cảnh mới (LocalStorage trống): số câu, số ô, ảnh thua, cài đặt đều đúng
- [x] Lỗi (77 mục): 401, 403 (thiếu quyền / rate limit hai kiểu), 404 (file mới -> tạo mới; sai repo/nhánh; ở bước PUT), 409 rồi thành công, 409 hai lần, 422, 500, mã lạ 418, đường dẫn là thư mục, mạng đứt, offline, timeout 30 giây thật; nút mở khóa lại, không lỗi JS
- [x] Chống bấm đúp: bấm 3 lần chỉ 1 PUT; gọi hàm đăng khi đang chạy không tạo request mới
- [x] Bảo mật: token chỉ ở sessionStorage + header Authorization tới api.github.com (quét LocalStorage, `Store.exportJSON()`, DOM kể cả thuộc tính, mọi request, console, thông báo); ô mã `type=password`; Xóa mã làm sạch sessionStorage và ô nhập; `?host=0` xóa mã
- [x] Đầu vào (38 mục): thiếu owner/repo/token, `..`, bắt đầu bằng `/`, ký tự lạ, không phải `.js`, token có khoảng trắng: báo lỗi và KHÔNG gọi mạng; dữ liệu rỗng hỏi xác nhận riêng; > 5 MB bị chặn; 1-5 MB cảnh báo và vẫn đăng đúng
- [x] Phân quyền: người chơi không thấy `#tab-publish`; gọi `Publish.publish()` bị từ chối, 0 request; `?host=1` bật, `?host=0` tắt
- [x] Giao diện: không tràn ngang ở 320/360/390/768/1280 px (cả Tiếng Việt và English, kể cả lỗi dài 400 ký tự liền); bàn phím Tab/Enter/Space; vi và en có đúng cùng bộ khóa
- [x] Hồi quy: Easy, Hard, Impossible, Free, vòng quay, soạn câu hỏi, Xuất/Nhập file; không lỗi JS mới
- Ghi chú: Chromium tự ghi "Failed to load resource" vào console khi gặp HTTP 4xx/5xx giả lập; đó không phải lỗi JS và đã được loại khỏi phép đếm lỗi.

## Chưa kiểm thử được: cần bạn tự thử với GitHub thật
- [ ] Đăng thật bằng token thật (nên thử bằng một thay đổi nhỏ, ví dụ sửa 1 chữ trong 1 câu hỏi, rồi xem commit mới xuất hiện trong repo)
- [ ] Tên menu thật trên GitHub khi tạo token (README chỉ đối chiếu được qua tài liệu bên thứ ba)
- [ ] Thời gian GitHub Pages dựng lại và bộ nhớ đệm trên thiết bị người chơi
- [ ] Repo thuộc tổ chức (organization) có thể cần quản trị viên duyệt token fine-grained
- [ ] Nhánh có bảo vệ (branch protection) có thể từ chối ghi trực tiếp (sẽ hiện lỗi 403/422 kèm lời nhắn của GitHub)

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

## Sửa lỗi chữ đáp án tràn ô trên điện thoại
- [x] Ô đáp án A-D cao theo nội dung (không còn aspect-ratio cứng); điện thoại <= 600px chuyển sang 1 cột
- [x] Đáp án 60 ký tự (có dấu, không dấu cách, kèm/không kèm ảnh) hiển thị trọn vẹn ở 320, 360, 390, 414, 768, 1280 px; không cắt, không tràn ngang, ô >= 44px
