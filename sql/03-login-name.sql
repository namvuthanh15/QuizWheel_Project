-- ============================================================================
-- QuizWheel – 03-login-name.sql  (chạy SAU 01 và 02; chạy lại nhiều lần vẫn an toàn)
-- Đăng nhập không phân biệt dấu / hoa thường / khoảng trắng thừa trong tên.
-- Hai tên chỉ khác nhau ở dấu (vd "Nam" và "Nấm") sẽ không cùng tồn tại được: host tạo trùng sẽ thấy "Tên này đã có người dùng".
-- Nếu đã có người chơi mà hai tên bị trùng sau chuẩn hóa, lệnh tạo chỉ mục bên dưới sẽ báo lỗi và dừng,
-- lúc đó đăng nhập vẫn chạy như cũ (chưa đổi gì). Hãy đổi tên một trong hai người rồi chạy lại.
-- ============================================================================

-- Chuẩn hóa tên để so khớp: bỏ dấu tiếng Việt, bỏ hoa/thường, gộp khoảng trắng thừa.
-- "Nguyễn Văn A", "nguyen  van a", "NGUYỄN VĂN A" -> cùng ra "nguyen van a". (Không cần extension unaccent.)
create or replace function public.norm_name(p_name text) returns text
language sql immutable parallel safe set search_path = pg_catalog as $$
  select btrim(regexp_replace(
           lower(replace(replace(regexp_replace(normalize(coalesce(p_name, ''), NFD), '[\u0300-\u036f]', '', 'g'), 'đ', 'd'), 'Đ', 'D')),
           '\s+', ' ', 'g'))
$$;

create unique index if not exists players_name_norm_uq on public.players (public.norm_name(name));
drop index if exists public.players_name_uq;

create or replace function public.api_login(p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v players; v_tok text;
begin
  select * into v from players where public.norm_name(name) = public.norm_name(p_name) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if v.locked_until is not null and v.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if v.pin_hash <> crypt(coalesce(p_pin, ''), v.pin_hash) then
    update players set
      locked_until = case when fails + 1 >= 5 then now() + interval '5 minutes' else locked_until end,
      fails = case when fails + 1 >= 5 then 0 else fails + 1 end
    where id = v.id;
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not v.active then return jsonb_build_object('ok', false, 'error', 'disabled'); end if;
  update players set fails = 0, locked_until = null where id = v.id;
  delete from sessions where expires_at < now();
  v_tok := encode(gen_random_bytes(24), 'hex');
  insert into sessions (token_hash, player_id, expires_at)
    values (encode(digest(v_tok, 'sha256'), 'hex'), v.id, now() + interval '30 days');
  return jsonb_build_object('ok', true, 'token', v_tok, 'name', v.name);
end $$;
