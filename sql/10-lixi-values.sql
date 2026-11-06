-- ============================================================================
-- QuizWheel – 10-lixi-values.sql  (chạy SAU 07/08/09; chạy lại nhiều lần vẫn an toàn, KHÔNG xóa dữ liệu)
-- Host chỉnh số lượt nằm trong 9 bao lì xì mà người chơi rút ở lần đăng nhập đầu tiên.
--   * Host đặt 9 giá trị (mỗi giá trị 0 đến 100 lượt) ở trang host, tab Cài đặt.
--   * Mỗi lần có người rút, SERVER xáo trộn 9 giá trị đó vào 9 bao rồi người chơi bấm 1 bao: nhận đúng giá trị trong bao ấy.
--     Sau khi mở, 8 bao còn lại hiện giá trị thật của chúng (không còn là số ngẫu nhiên giả như trước).
--   * Mặc định 2,3,4,5,6,7,8,9,10 (giống khoảng 2–10 trước đây). Người đã rút rồi thì KHÔNG bị ảnh hưởng.
-- ============================================================================
alter table public.app_config add column if not exists lixi_values jsonb not null default '[2,3,4,5,6,7,8,9,10]'::jsonb;

create or replace function public.admin_lixi_get(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb; v jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  select lixi_values into v from app_config where id = 1;
  return jsonb_build_object('ok', true, 'values', v);
end $$;

create or replace function public.admin_lixi_save(p_key text, p_values jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb; v_clean jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  if p_values is null or jsonb_typeof(p_values) <> 'array' or jsonb_array_length(p_values) <> 9 then
    return jsonb_build_object('ok', false, 'error', 'bad_data', 'message', 'Cần đúng 9 giá trị');
  end if;
  if exists (select 1 from jsonb_array_elements(p_values) x where jsonb_typeof(x) <> 'number') then
    return jsonb_build_object('ok', false, 'error', 'bad_data', 'message', 'Mỗi bao phải là một con số');
  end if;
  if exists (select 1 from jsonb_array_elements(p_values) x
              where (x #>> '{}')::numeric <> floor((x #>> '{}')::numeric) or (x #>> '{}')::numeric < 0 or (x #>> '{}')::numeric > 100) then
    return jsonb_build_object('ok', false, 'error', 'bad_data', 'message', 'Mỗi bao là số nguyên từ 0 đến 100');
  end if;
  select jsonb_agg(((x #>> '{}')::numeric)::int order by ord) into v_clean from jsonb_array_elements(p_values) with ordinality as t(x, ord);
  update app_config set lixi_values = v_clean where id = 1;
  return jsonb_build_object('ok', true, 'values', v_clean);
end $$;

-- Rút lì xì: p_slot (0..8) chỉ là bao người chơi bấm; 9 giá trị do host đặt, server xáo trộn rồi chốt. Chỉ rút MỘT lần.
create or replace function public.api_lixi_open(p_token text, p_slot int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_p players; v_n int; v_all jsonb;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 8 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  select * into v_p from players where id = v_pid for update;
  if v_p.lixi_turns is not null then
    return jsonb_build_object('ok', false, 'error', 'already', 'amount', v_p.lixi_turns);
  end if;
  select jsonb_agg(v order by random()) into v_all
    from jsonb_array_elements((select lixi_values from app_config where id = 1)) v;     -- xáo trộn 9 giá trị vào 9 bao
  v_n := (v_all ->> p_slot)::int;
  update players set lixi_turns = v_n, turns = turns + v_n where id = v_pid;
  return jsonb_build_object('ok', true, 'slot', p_slot, 'amount', v_n, 'turns', v_p.turns + v_n, 'all', v_all);
end $$;

revoke all on function public.admin_lixi_get(text), public.admin_lixi_save(text, jsonb), public.api_lixi_open(text, int) from public, anon, authenticated;
grant execute on function public.admin_lixi_get(text) to anon;
grant execute on function public.admin_lixi_save(text, jsonb) to anon;
grant execute on function public.api_lixi_open(text, int) to anon;
