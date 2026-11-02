-- ============================================================================
-- QuizWheel – 08a-reset-demo-data.sql   *** CHỈ CHẠY MỘT LẦN, KHÔNG HOÀN LẠI ĐƯỢC ***
-- Xóa dữ liệu demo cũ để bắt đầu cơ chế bao lì xì sạch sẽ:
--   * toàn bộ lịch sử ván chơi (nên "Đã trúng" của mọi người về 0) và số tiền "Đã trả" về 0;
--   * cấu hình vòng quay cũ của 5 vòng easy/easy4/easy6/hard/hard6 (host lập lại ở tab Vòng quay) và giá trị lì xì cũ.
-- GIỮ NGUYÊN: tài khoản, PIN, số lượt, vòng quay Free, kho câu hỏi, cài đặt.
-- Chạy SAU 08-bag-draw.sql.
-- ============================================================================
delete from public.plays;
update public.players set paid_k = 0;
delete from public.wheels where level in ('easy', 'easy4', 'easy6', 'hard', 'hard6');
update public.app_config set bag_values = '{}'::jsonb where id = 1;
