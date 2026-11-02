-- ============================================================================
-- QuizWheel – 07-lixi.sql  (chạy SAU 01 đến 06; chạy lại nhiều lần vẫn an toàn)
-- 1) Người chơi MỚI không còn được cho sẵn lượt: tạo xong có 0 lượt.
-- 2) Sau khi đăng nhập lần đầu, người chơi rút 1 trong 9 bao lì xì: server random 2 đến 10 lượt chơi (đều nhau),
--    cộng vào số lượt. Chỉ rút MỘT LẦN DUY NHẤT cho mỗi người. Lượt Free vẫn như cũ (cấu hình "Số lần quay Free").
-- 3) Host có nút "Cho rút lại" (để thử nghiệm hoặc bù cho ai đó). Lượt đã nhận trước đó không bị trừ lại.
-- LƯU Ý: người chơi ĐÃ CÓ từ trước (cột lixi_turns còn trống) cũng sẽ được rút lì xì ở lần đăng nhập tới.
-- ============================================================================
alter table public.players add column if not exists lixi_turns int;   -- null = chưa rút; có số = số lượt đã nhận

create or replace function public.api_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_p players; v_c app_config; v_a plays; v_s plays; v_rew numeric;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_p from players where id = v_pid;
  select * into v_c from app_config where id = 1;
  select * into v_a from plays where player_id = v_pid and status = 'active' order by started_at desc limit 1;
  select * into v_s from plays where player_id = v_pid and status = 'finished' and wheel is not null and not spun order by started_at desc limit 1;
  select coalesce(sum(reward_k), 0) into v_rew from plays where player_id = v_pid;
  return jsonb_build_object(
    'ok', true,
    'player', jsonb_build_object('name', v_p.name, 'turns', v_p.turns, 'freeLeft', greatest(0, v_c.free_spins - v_p.free_used),
                                     'lixiPending', (v_p.lixi_turns is null)),
    'active', case when v_a.id is null then null else jsonb_build_object('playId', v_a.id, 'level', v_a.level, 'total', v_a.total) end,
    'pendingSpin', case when v_s.id is null then null else jsonb_build_object('playId', v_s.id, 'wheel', v_s.wheel, 'level', v_s.level) end,
    'rewardK', v_rew, 'paidK', v_p.paid_k);
end $$;

create or replace function public.admin_players(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  return jsonb_build_object('ok', true, 'players', coalesce((select jsonb_agg(x order by lower(x ->> 'name')) from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'turns', p.turns, 'freeUsed', p.free_used, 'active', p.active, 'lixi', p.lixi_turns,
             'paidK', p.paid_k,
             'rewardK', (select coalesce(sum(reward_k), 0) from plays where player_id = p.id),
             'plays', (select count(*) from plays where player_id = p.id),
             'lastAt', (select max(started_at) from plays where player_id = p.id)) x
    from players p) y), '[]'::jsonb));
end $$;

create or replace function public.admin_player_create(p_key text, p_name text, p_pin text, p_turns int default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb; v_c app_config; v_id uuid;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  if p_name is null or length(trim(p_name)) < 1 or length(trim(p_name)) > 30 then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  if p_pin is null or length(p_pin) < 4 or length(p_pin) > 12 then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
  select * into v_c from app_config where id = 1;
  begin
    insert into players (name, pin_hash, turns)
      values (trim(p_name), crypt(p_pin, gen_salt('bf')), greatest(0, coalesce(p_turns, 0))) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Rút lì xì: p_slot (0..8) chỉ là bao người chơi bấm; SỐ LƯỢT do server random, không thể rút lại.
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
  v_n := 2 + floor(random() * 9)::int;                               -- 2..10, đều nhau
  update players set lixi_turns = v_n, turns = turns + v_n where id = v_pid;
  -- Giá trị các bao còn lại chỉ để hiện cho vui sau khi mở (không có ý nghĩa gì khác)
  select jsonb_agg(case when i = p_slot then v_n else 2 + floor(random() * 9)::int end order by i)
    into v_all from generate_series(0, 8) i;
  return jsonb_build_object('ok', true, 'slot', p_slot, 'amount', v_n, 'turns', v_p.turns + v_n, 'all', v_all);
end $$;

-- Host: cho người chơi rút lì xì lại (không trừ lượt đã nhận)
create or replace function public.admin_lixi_reset(p_key text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  update players set lixi_turns = null where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.api_lixi_open(text, int), public.admin_lixi_reset(text, uuid) from public, anon, authenticated;
grant execute on function public.api_lixi_open(text, int) to anon;
grant execute on function public.admin_lixi_reset(text, uuid) to anon;
