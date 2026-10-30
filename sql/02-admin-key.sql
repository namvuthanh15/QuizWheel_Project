-- ============================================================================
-- QuizWheel – 02-admin-key.sql  (chạy SAU 01-schema.sql)
-- Đặt MẬT KHẨU HOST. Sửa chuỗi bên dưới thành mật khẩu của bạn (>= 12 ký tự, khó đoán), rồi Run.
-- Mật khẩu này chỉ được lưu dạng băm trong database. Đừng đưa vào file nào trong repo GitHub.
-- Sau này đổi được ngay trong web (tab Người chơi > Đổi mật khẩu host).
-- ============================================================================
do $$
declare v_key text := 'setkeoroisui';
begin
  if v_key like 'DOI-MAT-KHAU-NAY%' or length(v_key) < 12 then
    raise exception 'Hãy sửa v_key thành mật khẩu thật (>= 12 ký tự) rồi chạy lại.';
  end if;
  update public.app_config set admin_hash = extensions.crypt(v_key, extensions.gen_salt('bf')), admin_fails = 0, admin_locked_until = null where id = 1;
end $$;
