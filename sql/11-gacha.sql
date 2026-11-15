-- ============================================================================
-- QuizWheel – 11-gacha.sql  (chạy SAU 01 đến 10; chạy lại nhiều lần vẫn an toàn)
-- Tính năng GACHA cho mức Impossible (máy quay số ba cuộn chủ đề Tết):
--  * Mỗi người chơi có 1 lượt Gacha (players.gacha_left). Quay tốn 1 lượt chơi (turns).
--  * Quay do SERVER quyết định: trúng lớn (ba cuộn đều là bao lì xì đỏ) với xác suất app_config.gacha_rate (%),
--    hoặc xác suất RIÊNG của từng người (players.gacha_rate, host đặt; trình duyệt không bao giờ thấy các con số này).
--  * Trúng lớn nhận đúng giải của mức Impossible (impossible_prize).
--  * Sau khi quay (trúng hay trượt) mức Impossible bị KHÓA (players.imp_locked). Thắng quiz Impossible cũng khóa.
--  * Chọn làm quiz Impossible thì mất lượt Gacha (và ngược lại: đã quay Gacha thì mức bị khóa).
--  * Host "Mở lại" (admin_imp_reopen): gỡ khóa và cấp thêm 1 lượt Gacha.
-- ============================================================================

alter table public.players    add column if not exists imp_locked boolean not null default false;
alter table public.players    add column if not exists gacha_left int not null default 1 check (gacha_left >= 0);
alter table public.players    add column if not exists gacha_rate numeric check (gacha_rate is null or (gacha_rate >= 0 and gacha_rate <= 100));
alter table public.app_config add column if not exists gacha_rate numeric not null default 5 check (gacha_rate >= 0 and gacha_rate <= 100);

-- Cho phép loại ván 'gacha' trong bảng plays (gỡ ràng buộc cũ rồi tạo lại)
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.plays'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.plays drop constraint %I', c);
  end loop;
end $$;
alter table public.plays add constraint plays_kind_check check (kind in ('quiz', 'free', 'gacha'));

-- Thắng quiz Impossible => khóa mức (không cần sửa api_answer: bắt ngay khi ván kết thúc có thưởng)
create or replace function public._imp_win_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update players set imp_locked = true where id = new.player_id;
  return new;
end $$;
drop trigger if exists plays_imp_win_lock on public.plays;
create trigger plays_imp_win_lock after update on public.plays for each row
  when (old.status = 'active' and new.status = 'finished' and new.kind = 'quiz' and new.level = 'impossible'
        and new.reward_label is not null and new.reward_label <> '')
  execute function public._imp_win_lock();

-- ---------- Quay Gacha ----------
-- Trả về: {ok, win, reels:[a,b,c], prizeLabel, turns}. reels là số 0..5 (0 = bao lì xì đỏ; ba số 0 = trúng lớn).
-- Trượt thì ba số KHÔNG bao giờ giống hệt nhau.
create or replace function public.api_gacha_spin(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid; v_p players; v_c app_config; v_open plays; v_cost int := 1; v_rate numeric; v_win boolean; v_r int[];
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_p from players where id = v_pid for update;       -- khóa dòng: chặn bấm song song
  select * into v_c from app_config where id = 1;
  if v_p.imp_locked then return jsonb_build_object('ok', false, 'error', 'imp_locked'); end if;
  if v_p.gacha_left <= 0 then return jsonb_build_object('ok', false, 'error', 'gacha_used'); end if;
  select * into v_open from plays
   where player_id = v_pid and (status = 'active' or (status = 'finished' and wheel is not null and not spun))
   order by started_at desc limit 1;
  if v_open.id is not null then
    return jsonb_build_object('ok', false, 'error', case when v_open.status = 'active' then 'active' else 'pending_spin' end, 'playId', v_open.id);
  end if;
  if v_p.turns < v_cost then return jsonb_build_object('ok', false, 'error', 'no_turns', 'turns', v_p.turns, 'cost', v_cost); end if;

  v_rate := coalesce(v_p.gacha_rate, v_c.gacha_rate);               -- xác suất riêng của người này (nếu host đặt) hoặc mặc định
  v_win := (random() * 100) < v_rate;
  if v_win then
    v_r := array[0, 0, 0];
  else
    loop
      v_r := array[floor(random() * 6)::int, floor(random() * 6)::int, floor(random() * 6)::int];
      exit when not (v_r[1] = v_r[2] and v_r[2] = v_r[3]);
    end loop;
  end if;

  update players set turns = turns - v_cost, gacha_left = gacha_left - 1, imp_locked = true where id = v_pid;
  insert into plays (player_id, kind, level, total, cost, status, wheel, spun, result, reward_label, reward_k, finished_at)
    values (v_pid, 'gacha', 'impossible', 0, v_cost, 'finished', null, true,
            jsonb_build_object('reels', to_jsonb(v_r), 'win', v_win),
            case when v_win then v_c.impossible_prize else null end,
            case when v_win then public._reward_k(v_c.impossible_prize) else 0 end, now());
  return jsonb_build_object('ok', true, 'win', v_win, 'reels', to_jsonb(v_r),
                            'prizeLabel', case when v_win then v_c.impossible_prize else null end, 'turns', v_p.turns - v_cost);
end $$;

-- ---------- Host ----------
create or replace function public.admin_imp_reopen(p_key text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  update players set imp_locked = false, gacha_left = gacha_left + 1 where id = p_id;      -- mở khóa + cấp thêm 1 lượt Gacha
  if not found then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Xác suất trúng của RIÊNG một người (%). p_rate = null => bỏ ghi đè, dùng mức mặc định.
create or replace function public.admin_gacha_rate(p_key text, p_id uuid, p_rate numeric) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 100) then return jsonb_build_object('ok', false, 'error', 'bad_rate'); end if;
  update players set gacha_rate = p_rate where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Xác suất trúng MẶC ĐỊNH (%) cho mọi người chưa được đặt riêng
create or replace function public.admin_gacha_default(p_key text, p_rate numeric) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  if p_rate is null or p_rate < 0 or p_rate > 100 then return jsonb_build_object('ok', false, 'error', 'bad_rate'); end if;
  update app_config set gacha_rate = p_rate where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Các hàm sẵn có, thêm trường Gacha (giữ nguyên phần còn lại) ----------
-- api_start: mức Impossible đã khóa thì từ chối; bắt đầu làm quiz Impossible thì mất lượt Gacha
create or replace function public.api_start(p_token text, p_level text, p_count int default 0) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid; v_p players; v_c app_config; v_open plays; v_rule jsonb; v_cost int; v_typed boolean;
  v_qdata jsonb; v_perms jsonb; v_play uuid; v_shuf boolean;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_p from players where id = v_pid for update;      -- khóa dòng: chặn bấm song song để trừ lượt 1 lần
  select * into v_c from app_config where id = 1;

  select * into v_open from plays
   where player_id = v_pid and (status = 'active' or (status = 'finished' and wheel is not null and not spun))
   order by started_at desc limit 1;
  if v_open.id is not null then
    return jsonb_build_object('ok', false, 'error', case when v_open.status = 'active' then 'active' else 'pending_spin' end, 'playId', v_open.id);
  end if;

  if p_level = 'free' then
    if v_p.free_used >= v_c.free_spins then return jsonb_build_object('ok', false, 'error', 'free_used'); end if;
    update players set free_used = free_used + 1 where id = v_pid;
    insert into plays (player_id, kind, level, total, cost, status, wheel, finished_at)
      values (v_pid, 'free', 'free', 0, 0, 'finished', 'free', now()) returning id into v_play;
    return jsonb_build_object('ok', true, 'playId', v_play, 'kind', 'free', 'wheel', 'free', 'turns', v_p.turns);
  end if;

  if p_level not in ('easy', 'hard', 'impossible') then return jsonb_build_object('ok', false, 'error', 'bad_level'); end if;
  v_rule := v_c.rules -> p_level;
  if v_rule is null or not ((v_rule -> 'counts') @> to_jsonb(coalesce(p_count, 0))) then
    return jsonb_build_object('ok', false, 'error', 'bad_count');
  end if;
  if p_level = 'impossible' and v_p.imp_locked then return jsonb_build_object('ok', false, 'error', 'imp_locked'); end if;   -- GACHA: mức đã khóa
  v_cost := coalesce((v_c.costs ->> p_level)::int, 0);
  if v_p.turns < v_cost then return jsonb_build_object('ok', false, 'error', 'no_turns', 'turns', v_p.turns, 'cost', v_cost); end if;
  v_typed := coalesce((v_rule ->> 'direct')::boolean, false);

  select jsonb_agg(q.data || jsonb_build_object('id', q.id)) into v_qdata
    from (select id, data from questions where level = p_level order by random() limit p_count) q;
  if v_qdata is null or jsonb_array_length(v_qdata) < p_count then
    return jsonb_build_object('ok', false, 'error', 'pool');
  end if;
  v_shuf := (not v_typed) and coalesce((v_c.settings -> 'shuffleAnswers' ->> p_level)::boolean, true);
  select coalesce(jsonb_agg(
           case when v_typed or coalesce(t.q ->> 'type', 'mcq') = 'essay' then '[]'::jsonb
                when v_shuf then public._perm(jsonb_array_length(t.q -> 'answers'))
                else (select jsonb_agg(i order by i) from generate_series(0, jsonb_array_length(t.q -> 'answers') - 1) i) end
           order by t.n), '[]'::jsonb)
    into v_perms from jsonb_array_elements(v_qdata) with ordinality t(q, n);

  update players set turns = turns - v_cost,
                     gacha_left = case when p_level = 'impossible' then 0 else gacha_left end   -- GACHA: chọn quiz thì mất lượt Gacha
   where id = v_pid;
  insert into plays (player_id, kind, level, total, cost, q_data, perms)
    values (v_pid, 'quiz', p_level, p_count, v_cost, v_qdata, v_perms) returning id into v_play;
  return jsonb_build_object('ok', true, 'playId', v_play, 'level', p_level, 'total', p_count,
                            'cost', v_cost, 'turns', v_p.turns - v_cost, 'typed', v_typed);
end $$;

-- api_state: thêm impLocked, gachaLeft cho người chơi (KHÔNG có xác suất)
create or replace function public.api_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_p players; v_c app_config; v_a plays; v_s plays; v_b plays; v_rew numeric;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_p from players where id = v_pid;
  select * into v_c from app_config where id = 1;
  select * into v_a from plays where player_id = v_pid and status = 'active' order by started_at desc limit 1;
  select * into v_s from plays where player_id = v_pid and status = 'finished' and wheel is not null and not spun order by started_at desc limit 1;
  select * into v_b from plays where player_id = v_pid and status = 'finished' and spun and bags is not null and bag_pick is null order by started_at desc limit 1;
  select coalesce(sum(reward_k), 0) into v_rew from plays where player_id = v_pid;
  return jsonb_build_object(
    'ok', true,
    'player', jsonb_build_object('name', v_p.name, 'turns', v_p.turns, 'freeLeft', greatest(0, v_c.free_spins - v_p.free_used),
                                     'lixiPending', (v_p.lixi_turns is null),
                                     'impLocked', v_p.imp_locked, 'gachaLeft', v_p.gacha_left),
    'active', case when v_a.id is null then null else jsonb_build_object('playId', v_a.id, 'level', v_a.level, 'total', v_a.total) end,
    'pendingSpin', case when v_s.id is null then null else jsonb_build_object('playId', v_s.id, 'wheel', v_s.wheel, 'level', v_s.level) end,
    'pendingBag', case when v_b.id is null then null else jsonb_build_object('playId', v_b.id, 'count', jsonb_array_length(v_b.bags), 'level', v_b.level) end,
    'rewardK', v_rew, 'paidK', v_p.paid_k);
end $$;

-- api_config: thêm gachaCost (số lượt tốn mỗi lần quay)
create or replace function public.api_config() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'ok', true, 'gachaCost', 1,
    'settings', c.settings, 'rules', c.rules, 'costs', c.costs,
    'freeSpins', c.free_spins, 'impossiblePrize', c.impossible_prize,
    'wheels', coalesce((select jsonb_object_agg(level, items) from wheels), '{}'::jsonb),
    'bagRange', coalesce((select jsonb_object_agg(k, jsonb_build_array(mn, mx)) from (
                   select t.k, (select min(x::numeric) from jsonb_array_elements_text(t.v) x) mn, (select max(x::numeric) from jsonb_array_elements_text(t.v) x) mx
                   from jsonb_each(c.bag_values) as t(k, v) where jsonb_typeof(t.v) = 'array' and jsonb_array_length(t.v) > 0) z), '{}'::jsonb),
    'pool', coalesce((select jsonb_object_agg(level, n) from (select level, count(*) n from questions group by level) x), '{}'::jsonb)
  ) from app_config c where c.id = 1
$$;

--

-- admin_players: host thấy trạng thái khóa, lượt Gacha còn lại và xác suất riêng của từng người
create or replace function public.admin_players(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  return jsonb_build_object('ok', true, 'players', coalesce((select jsonb_agg(x order by lower(x ->> 'name')) from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'turns', p.turns, 'freeUsed', p.free_used, 'active', p.active, 'lixi', p.lixi_turns,
             'paidK', p.paid_k, 'impLocked', p.imp_locked, 'gachaLeft', p.gacha_left, 'gachaRate', p.gacha_rate,
             'rewardK', (select coalesce(sum(reward_k), 0) from plays where player_id = p.id),
             'plays', (select count(*) from plays where player_id = p.id),
             'lastAt', (select max(started_at) from plays where player_id = p.id)) x
    from players p) y), '[]'::jsonb));
end $$;

-- admin_settings: host thấy xác suất mặc định
create or replace function public.admin_settings(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb; c app_config;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  select * into c from app_config where id = 1;
  return jsonb_build_object('ok', true, 'costs', c.costs, 'startTurns', c.start_turns, 'freeSpins', c.free_spins,
                            'impossiblePrize', c.impossible_prize, 'gachaRate', c.gacha_rate);
end $$;

-- ---------- Phân quyền (giống các file trước) ----------
revoke all on function public._imp_win_lock() from public, anon, authenticated;
revoke all on function public.api_gacha_spin(text), public.admin_imp_reopen(text, uuid),
                       public.admin_gacha_rate(text, uuid, numeric), public.admin_gacha_default(text, numeric) from public, anon, authenticated;
grant execute on function public.api_gacha_spin(text) to anon;
grant execute on function public.admin_imp_reopen(text, uuid) to anon;
grant execute on function public.admin_gacha_rate(text, uuid, numeric) to anon;
grant execute on function public.admin_gacha_default(text, numeric) to anon;

notify pgrst, 'reload schema';
