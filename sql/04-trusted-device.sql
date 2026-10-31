-- ============================================================================
-- QuizWheel – 04-trusted-device.sql  (chạy SAU 01, 02, 03; chạy lại nhiều lần vẫn an toàn)
-- "Lưu thiết bị này an toàn 7 ngày" cho host: sau khi nhập mật khẩu, trình duyệt nhận một MÃ THIẾT BỊ ngẫu nhiên
-- (server chỉ lưu bản băm, hết hạn sau 7 ngày). Vào web / tải lại trang trong 7 ngày không cần nhập mật khẩu.
-- Mật khẩu host KHÔNG bao giờ được lưu trong trình duyệt. Host bật/tắt tính năng này trong tab Cài đặt.
-- Mã thiết bị có dạng "qwdev.xxxxx", gửi vào cùng tham số p_key như mật khẩu, nên mọi hàm admin_* dùng được ngay.
-- Việc nhạy cảm (đổi mật khẩu, cấp mã thiết bị mới) vẫn BẮT BUỘC nhập mật khẩu thật.
-- ============================================================================

alter table public.app_config add column if not exists trust_enabled boolean not null default true;

create table if not exists public.admin_devices (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.admin_devices enable row level security;
revoke all on public.admin_devices from anon, authenticated;

-- Kiểm tra quyền host: mã thiết bị còn hạn (nếu tính năng đang bật) HOẶC mật khẩu đúng. Mã thiết bị được kiểm tra trước,
-- nên host trên thiết bị tin cậy không bị khóa ngoài khi có người đoán mật khẩu.
create or replace function public._admin_state(p_key text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c app_config;
begin
  select * into c from app_config where id = 1 for update;
  if c.admin_hash is null then return 'nokey'; end if;
  if c.trust_enabled and left(coalesce(p_key, ''), 6) = 'qwdev.' then
    if exists (select 1 from admin_devices
                where token_hash = encode(digest(substr(p_key, 7), 'sha256'), 'hex') and expires_at > now()) then
      return 'ok';
    end if;
  end if;
  if c.admin_locked_until is not null and c.admin_locked_until > now() then return 'locked'; end if;
  if p_key is not null and c.admin_hash = crypt(p_key, c.admin_hash) then
    if c.admin_fails > 0 or c.admin_locked_until is not null then
      update app_config set admin_fails = 0, admin_locked_until = null where id = 1;
    end if;
    return 'ok';
  end if;
  update app_config set
    admin_locked_until = case when admin_fails + 1 >= 8 then now() + interval '15 minutes' else admin_locked_until end,
    admin_fails = case when admin_fails + 1 >= 8 then 0 else admin_fails + 1 end
  where id = 1;
  return 'bad';
end $$;

-- Như _adm_err nhưng chỉ chấp nhận MẬT KHẨU (không nhận mã thiết bị)
create or replace function public._adm_err_pw(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if left(coalesce(p_key, ''), 6) = 'qwdev.' then return jsonb_build_object('ok', false, 'error', 'need_password'); end if;
  return public._adm_err(p_key);
end $$;

-- Đổi mật khẩu: cần mật khẩu hiện tại; đổi xong thì mọi thiết bị tin cậy bị thu hồi
create or replace function public.admin_set_key(p_key text, p_new text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err_pw(p_key); if err is not null then return err; end if;
  if p_new is null or length(p_new) < 8 then return jsonb_build_object('ok', false, 'error', 'short_key'); end if;
  if left(p_new, 6) = 'qwdev.' then return jsonb_build_object('ok', false, 'error', 'bad_key'); end if;
  update app_config set admin_hash = crypt(p_new, gen_salt('bf')) where id = 1;
  delete from admin_devices;
  return jsonb_build_object('ok', true);
end $$;

-- Công khai: tính năng đang bật hay tắt (để trang đăng nhập biết có hiện ô "Lưu thiết bị" hay không)
create or replace function public.admin_trust_get() returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('ok', true, 'enabled', trust_enabled) from app_config where id = 1
$$;

-- Cấp mã thiết bị (cần mật khẩu thật). Trả về mã MỘT LẦN DUY NHẤT; server chỉ giữ bản băm.
create or replace function public.admin_trust_device(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb; v_tok text; v_exp timestamptz := now() + interval '7 days'; v_on boolean;
begin
  err := public._adm_err_pw(p_key); if err is not null then return err; end if;
  select trust_enabled into v_on from app_config where id = 1;
  if not v_on then return jsonb_build_object('ok', false, 'error', 'trust_off'); end if;
  delete from admin_devices where expires_at <= now();
  v_tok := encode(gen_random_bytes(32), 'hex');
  insert into admin_devices (token_hash, expires_at) values (encode(digest(v_tok, 'sha256'), 'hex'), v_exp);
  return jsonb_build_object('ok', true, 'token', 'qwdev.' || v_tok, 'expiresAt', v_exp, 'days', 7);
end $$;

-- Thiết bị tự quên mình (nút Thoát). Không cần xác thực: chỉ người có đúng mã mới xóa được dòng của mã đó.
create or replace function public.admin_forget_device(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if left(coalesce(p_key, ''), 6) = 'qwdev.' then
    delete from admin_devices where token_hash = encode(digest(substr(p_key, 7), 'sha256'), 'hex');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Bật/tắt tính năng. Tắt = xóa hết thiết bị tin cậy ngay.
create or replace function public.admin_trust_set(p_key text, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  update app_config set trust_enabled = coalesce(p_enabled, false) where id = 1;
  if not coalesce(p_enabled, false) then delete from admin_devices; end if;
  return jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, false));
end $$;

-- Thu hồi mọi thiết bị tin cậy (mất máy, mượn máy người khác...). Máy đang dùng cũng phải nhập lại mật khẩu.
create or replace function public.admin_trust_revoke(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  delete from admin_devices;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public._admin_state(text), public._adm_err_pw(text) from public, anon, authenticated;
revoke all on function public.admin_set_key(text, text), public.admin_trust_get(), public.admin_trust_device(text),
  public.admin_forget_device(text), public.admin_trust_set(text, boolean), public.admin_trust_revoke(text) from public, anon, authenticated;
grant execute on function public.admin_set_key(text, text), public.admin_trust_get(), public.admin_trust_device(text),
  public.admin_forget_device(text), public.admin_trust_set(text, boolean), public.admin_trust_revoke(text) to anon;
