-- ============================================================================
-- QuizWheel – 01-schema.sql
-- Dán TOÀN BỘ file này vào Supabase > SQL Editor > New query > Run (chạy lại nhiều lần vẫn an toàn).
-- Server giữ: đáp án đúng, số lượt, bốc câu hỏi, chấm điểm, kết quả vòng quay, lịch sử.
-- Trình duyệt chỉ được gọi các hàm api_* / admin_* ở cuối file; KHÔNG đọc trực tiếp được bảng nào.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Bảng ----------
create table if not exists public.app_config (
  id int primary key default 1 check (id = 1),
  admin_hash text,                                  -- băm mật khẩu host (đặt bằng 02-admin-key.sql)
  admin_fails int not null default 0,
  admin_locked_until timestamptz,
  settings jsonb not null default '{"timePerQuestion":20,"shuffleAnswers":{"easy":true,"hard":true},"bigPrize":{"easy":"36K","hard":"72K"}}'::jsonb,
  rules jsonb not null,                             -- bảng luật (giống Quiz.rules trong js/quiz.js)
  costs jsonb not null default '{"easy":1,"hard":1,"impossible":0}'::jsonb,   -- số lượt tốn mỗi mức
  start_turns int not null default 3,               -- số lượt mặc định khi tạo người chơi mới
  free_spins int not null default 1,                -- số lần quay Free chủ động / người
  impossible_prize text not null default '100K',
  lose_image text
);

insert into public.app_config (id, rules) values (1, '{
 "easy": {"counts":[2,4,6,8],"plan":{
   "2":[{"min":2,"wheel":"easy"},{"min":0,"wheel":"free"}],
   "4":[{"min":4,"wheel":"easy4"},{"min":1,"wheel":"easy"},{"min":0,"wheel":"free"}],
   "6":[{"min":6,"wheel":"easy6"},{"min":4,"wheel":"easy4"},{"min":1,"wheel":"easy"},{"min":0,"wheel":"free"}],
   "8":[{"min":8,"prize":true},{"min":6,"wheel":"easy6"},{"min":4,"wheel":"easy4"},{"min":1,"wheel":"easy"},{"min":0,"wheel":"free"}]}},
 "hard": {"counts":[4,6,8],"plan":{
   "4":[{"min":4,"wheel":"hard"},{"min":1,"wheel":"easy"},{"min":0,"wheel":"free"}],
   "6":[{"min":6,"wheel":"hard6"},{"min":4,"wheel":"hard"},{"min":1,"wheel":"easy"},{"min":0,"wheel":"free"}],
   "8":[{"min":8,"prize":true},{"min":6,"wheel":"hard6"},{"min":4,"wheel":"hard"},{"min":1,"wheel":"easy"},{"min":0,"wheel":"free"}]}},
 "impossible": {"counts":[1],"parts":2,"direct":true}
}'::jsonb) on conflict (id) do nothing;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text not null,
  turns int not null default 0 check (turns >= 0),
  free_used int not null default 0,
  paid_k numeric not null default 0,               -- tổng lì xì (K) host đã trả cho người này
  active boolean not null default true,
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
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

create table if not exists public.sessions (
  token_hash text primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists public.questions (
  level text not null check (level in ('easy','hard','impossible')),
  id text not null,
  pos int not null default 0,
  data jsonb not null,
  primary key (level, id)
);

create table if not exists public.wheels (
  level text primary key check (level in ('free','easy','easy4','easy6','hard','hard6')),
  items jsonb not null default '[]'::jsonb
);

create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in ('quiz','free')),
  level text not null,
  total int not null default 0,
  cost int not null default 0,
  status text not null default 'active' check (status in ('active','finished')),
  q_data jsonb,                                    -- bản chụp các câu đã bốc (có đáp án đúng, chỉ server đọc)
  perms jsonb,                                     -- thứ tự đảo đáp án của từng câu
  idx int not null default 0,
  served_at timestamptz,
  solved int not null default 0,
  wheel text,                                      -- vòng quay phải quay (null = không có)
  spun boolean not null default false,
  result jsonb,
  reward_label text,
  reward_k numeric not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists plays_player_idx on public.plays (player_id, started_at desc);

alter table public.app_config enable row level security;
alter table public.players    enable row level security;
alter table public.sessions   enable row level security;
alter table public.questions  enable row level security;
alter table public.wheels     enable row level security;
alter table public.plays      enable row level security;
-- (không tạo policy nào => anon/authenticated KHÔNG đọc/ghi được bảng; chỉ các hàm bên dưới chạy với quyền chủ sở hữu)

-- ---------- Hàm nội bộ (không cấp cho trình duyệt) ----------
create or replace function public._reward_k(p_label text) returns numeric
language sql immutable as $$
  select coalesce(replace(substring(p_label from '(\d+(?:[.,]\d+)?)\s*[kK](?![A-Za-z0-9])'), ',', '.')::numeric, 0)
$$;

create or replace function public._perm() returns jsonb
language sql volatile as $$
  select jsonb_agg(i order by random()) from generate_series(0,3) i
$$;

create or replace function public._player_id(p_token text) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select s.player_id
  from sessions s join players p on p.id = s.player_id
  where s.token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex')
    and s.expires_at > now() and p.active
$$;

create or replace function public._admin_state(p_key text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c app_config;
begin
  select * into c from app_config where id = 1 for update;
  if c.admin_hash is null then return 'nokey'; end if;
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

create or replace function public._adm_err(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s text := public._admin_state(p_key);
begin
  if s = 'ok' then return null; end if;
  return jsonb_build_object('ok', false, 'error', case s when 'locked' then 'locked' when 'nokey' then 'nokey' else 'auth' end);
end $$;

-- ---------- API cho người chơi ----------
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

create or replace function public.api_logout(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end $$;

-- Cấu hình công khai: bảng luật, vòng quay, cài đặt hiển thị, số câu trong kho (KHÔNG có đáp án)
create or replace function public.api_config() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'ok', true,
    'settings', c.settings, 'rules', c.rules, 'costs', c.costs,
    'freeSpins', c.free_spins, 'impossiblePrize', c.impossible_prize,
    'wheels', coalesce((select jsonb_object_agg(level, items) from wheels), '{}'::jsonb),
    'pool', coalesce((select jsonb_object_agg(level, n) from (select level, count(*) n from questions group by level) x), '{}'::jsonb)
  ) from app_config c where c.id = 1
$$;

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
    'player', jsonb_build_object('name', v_p.name, 'turns', v_p.turns, 'freeLeft', greatest(0, v_c.free_spins - v_p.free_used)),
    'active', case when v_a.id is null then null else jsonb_build_object('playId', v_a.id, 'level', v_a.level, 'total', v_a.total) end,
    'pendingSpin', case when v_s.id is null then null else jsonb_build_object('playId', v_s.id, 'wheel', v_s.wheel, 'level', v_s.level) end,
    'rewardK', v_rew, 'paidK', v_p.paid_k);
end $$;

-- Bắt đầu 1 ván (trừ lượt NGAY tại đây). level = free | easy | hard | impossible
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
  v_cost := coalesce((v_c.costs ->> p_level)::int, 0);
  if v_p.turns < v_cost then return jsonb_build_object('ok', false, 'error', 'no_turns', 'turns', v_p.turns, 'cost', v_cost); end if;
  v_typed := coalesce((v_rule ->> 'direct')::boolean, false);

  select jsonb_agg(q.data || jsonb_build_object('id', q.id)) into v_qdata
    from (select id, data from questions where level = p_level order by random() limit p_count) q;
  if v_qdata is null or jsonb_array_length(v_qdata) < p_count then
    return jsonb_build_object('ok', false, 'error', 'pool');
  end if;
  v_shuf := (not v_typed) and coalesce((v_c.settings -> 'shuffleAnswers' ->> p_level)::boolean, true);
  select jsonb_agg(case when v_shuf then public._perm() else '[0,1,2,3]'::jsonb end)
    into v_perms from generate_series(1, p_count);

  update players set turns = turns - v_cost where id = v_pid;
  insert into plays (player_id, kind, level, total, cost, q_data, perms)
    values (v_pid, 'quiz', p_level, p_count, v_cost, v_qdata, v_perms) returning id into v_play;
  return jsonb_build_object('ok', true, 'playId', v_play, 'level', p_level, 'total', p_count,
                            'cost', v_cost, 'turns', v_p.turns - v_cost, 'typed', v_typed);
end $$;

-- Lấy câu hiện tại (KHÔNG có đáp án đúng). Gọi lại (tải lại trang) vẫn ra đúng câu đó và thời gian còn lại.
create or replace function public.api_question(p_token text, p_play uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_pl plays; v_c app_config; v_q jsonb; v_t int; v_rem int; v_typed boolean; v_ans jsonb;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_pl from plays where id = p_play and player_id = v_pid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_play'); end if;
  if v_pl.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'not_active'); end if;
  select * into v_c from app_config where id = 1;
  v_q := v_pl.q_data -> v_pl.idx;
  v_typed := coalesce((v_c.rules -> v_pl.level ->> 'direct')::boolean, false);
  if v_pl.served_at is null then
    update plays set served_at = now() where id = v_pl.id;
    v_pl.served_at := now();
  end if;
  v_t := coalesce((v_c.settings ->> 'timePerQuestion')::int, 20);
  if v_t > 0 then
    v_rem := greatest(0, ceil(v_t - extract(epoch from (now() - v_pl.served_at)))::int);
  end if;
  if not v_typed then
    select jsonb_agg(jsonb_build_object('text', a ->> 'text', 'image', a -> 'image') order by i)
      into v_ans
      from generate_series(0, 3) i,
           lateral (select (v_q -> 'answers') -> (((v_pl.perms -> v_pl.idx) ->> i)::int) as a) z;
  end if;
  return jsonb_build_object('ok', true, 'index', v_pl.idx, 'total', v_pl.total, 'level', v_pl.level,
                            'text', v_q ->> 'text', 'typed', v_typed, 'answers', v_ans, 'remaining', v_rem, 'solved', v_pl.solved);
end $$;

-- Nộp đáp án câu hiện tại. p_choice: vị trí 0-3 người chơi thấy (null = hết giờ). p_parts: [{d,m,y},{d,m,y}] cho Impossible.
create or replace function public.api_answer(p_token text, p_play uuid, p_index int, p_choice int default null, p_parts jsonb default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid; v_pl plays; v_c app_config; v_q jsonb; v_typed boolean; v_t int; v_timeout boolean := false;
  v_ok boolean := false; v_real int; v_solved int; v_idx int; v_tier jsonb; v_wheel text; v_prize boolean;
  v_label text; v_hits int := 0; v_i int; v_part jsonb; v_in jsonb; v_d int; v_m int; v_y int; v_yok boolean;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_pl from plays where id = p_play and player_id = v_pid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_play'); end if;
  if v_pl.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'not_active'); end if;
  if p_index is distinct from v_pl.idx then return jsonb_build_object('ok', false, 'error', 'stale', 'index', v_pl.idx); end if;
  select * into v_c from app_config where id = 1;
  v_q := v_pl.q_data -> v_pl.idx;
  v_typed := coalesce((v_c.rules -> v_pl.level ->> 'direct')::boolean, false);
  v_t := coalesce((v_c.settings ->> 'timePerQuestion')::int, 20);
  if v_t > 0 and v_pl.served_at is not null and extract(epoch from (now() - v_pl.served_at)) > v_t + 3 then
    v_timeout := true;                                           -- quá giờ (cho trễ 3 giây vì mạng)
  end if;

  if v_typed then
    if not v_timeout and p_parts is not null and jsonb_typeof(p_parts) = 'array' then
      for v_i in 0..1 loop
        v_part := (v_q -> 'parts') -> v_i;
        v_in := p_parts -> v_i;
        if v_in is not null and jsonb_typeof(v_in) = 'object'
           and (v_in ->> 'd') ~ '^\d{1,2}$' and (v_in ->> 'm') ~ '^\d{1,2}$' and (v_in ->> 'y') ~ '^\d{1,4}$' then
          v_d := (v_in ->> 'd')::int; v_m := (v_in ->> 'm')::int; v_y := (v_in ->> 'y')::int;
          v_yok := v_y = (v_part ->> 'y')::int
                   or (length(v_in ->> 'y') = 2 and v_y = (v_part ->> 'y')::int % 100);
          if v_d = (v_part ->> 'd')::int and v_m = (v_part ->> 'm')::int and v_yok then v_hits := v_hits + 1; end if;
        end if;
      end loop;
    end if;
    v_ok := (v_hits = 2);
    v_label := case when v_ok then v_c.impossible_prize else null end;
    update plays set status = 'finished', idx = 1, solved = v_hits, wheel = null, spun = true,
                     reward_label = v_label, reward_k = public._reward_k(v_label), finished_at = now(), served_at = null
     where id = v_pl.id;
    return jsonb_build_object('ok', true, 'correct', v_ok, 'timedOut', v_timeout, 'finished', true,
      'result', jsonb_build_object('solved', v_hits, 'total', 2, 'passed', v_ok, 'wheel', null, 'prize', false,
                                   'prizeLabel', v_label,
                                   'loseImage', case when v_ok then null else v_c.lose_image end));
  end if;

  if not v_timeout and p_choice is not null and p_choice between 0 and 3 then
    v_real := ((v_pl.perms -> v_pl.idx) ->> p_choice)::int;       -- đổi vị trí người chơi thấy -> vị trí gốc
    v_ok := (v_real = (v_q ->> 'correct')::int);
  end if;
  v_solved := v_pl.solved + case when v_ok then 1 else 0 end;
  v_idx := v_pl.idx + 1;

  if v_idx < v_pl.total then
    update plays set idx = v_idx, solved = v_solved, served_at = null where id = v_pl.id;
    return jsonb_build_object('ok', true, 'correct', v_ok, 'timedOut', v_timeout,
      'explain', case when v_ok then nullif(v_q ->> 'explain', '') else null end,
      'solved', v_solved, 'finished', false);
  end if;

  -- Hết câu: tra bảng thưởng (bậc đầu tiên có số câu đúng >= min)
  select t into v_tier
    from jsonb_array_elements(v_c.rules -> v_pl.level -> 'plan' -> (v_pl.total::text)) with ordinality as x(t, n)
   where v_solved >= (t ->> 'min')::int
   order by n limit 1;
  v_wheel := coalesce(v_tier ->> 'wheel', 'free');
  v_prize := coalesce((v_tier ->> 'prize')::boolean, false);
  if v_prize then
    v_label := coalesce(v_c.settings -> 'bigPrize' ->> v_pl.level, '');
    update plays set idx = v_idx, solved = v_solved, served_at = null, status = 'finished', wheel = null, spun = true,
                     reward_label = v_label, reward_k = public._reward_k(v_label), finished_at = now()
     where id = v_pl.id;
  else
    update plays set idx = v_idx, solved = v_solved, served_at = null, status = 'finished', wheel = v_wheel, spun = false,
                     finished_at = now()
     where id = v_pl.id;
  end if;
  return jsonb_build_object('ok', true, 'correct', v_ok, 'timedOut', v_timeout,
    'explain', case when v_ok then nullif(v_q ->> 'explain', '') else null end,
    'solved', v_solved, 'finished', true,
    'result', jsonb_build_object('solved', v_solved, 'total', v_pl.total, 'passed', v_solved = v_pl.total,
                                 'score', round(v_solved * 100.0 / v_pl.total, 1),
                                 'wheel', case when v_prize then null else v_wheel end,
                                 'prize', v_prize, 'prizeLabel', case when v_prize then v_label else null end));
end $$;

-- Quay vòng quay của ván. KẾT QUẢ CHỐT NGAY LẦN GỌI ĐẦU; gọi lại (tải lại trang) chỉ trả lại kết quả cũ.
create or replace function public.api_spin(p_token text, p_play uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_pl plays; v_items jsonb; v_total int; v_pick int; v_acc int := 0; v_it jsonb; v_win jsonb;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_pl from plays where id = p_play and player_id = v_pid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_play'); end if;
  if v_pl.status <> 'finished' or v_pl.wheel is null then return jsonb_build_object('ok', false, 'error', 'no_wheel'); end if;
  if v_pl.spun then
    return jsonb_build_object('ok', true, 'again', true, 'wheel', v_pl.wheel, 'item', v_pl.result);
  end if;
  select items into v_items from wheels where level = v_pl.wheel;
  select coalesce(sum((e ->> 'count')::int), 0) into v_total from jsonb_array_elements(coalesce(v_items, '[]'::jsonb)) e;
  if v_total < 2 then return jsonb_build_object('ok', false, 'error', 'wheel_unavailable'); end if;
  v_pick := floor(random() * v_total)::int;                       -- mỗi ô xác suất bằng nhau
  for v_it in select e from jsonb_array_elements(v_items) e loop
    v_acc := v_acc + (v_it ->> 'count')::int;
    if v_pick < v_acc then v_win := v_it; exit; end if;
  end loop;
  update plays set spun = true,
         result = jsonb_build_object('id', v_win ->> 'id', 'label', v_win ->> 'label'),
         reward_label = v_win ->> 'label', reward_k = public._reward_k(v_win ->> 'label')
   where id = v_pl.id;
  return jsonb_build_object('ok', true, 'again', false, 'wheel', v_pl.wheel,
                            'item', jsonb_build_object('id', v_win ->> 'id', 'label', v_win ->> 'label'));
end $$;

create or replace function public.api_history(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_p players;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_p from players where id = v_pid;
  return jsonb_build_object('ok', true, 'paidK', v_p.paid_k,
    'rewardK', (select coalesce(sum(reward_k), 0) from plays where player_id = v_pid),
    'items', coalesce((select jsonb_agg(r) from (
        select jsonb_build_object('at', started_at, 'kind', kind, 'level', level, 'total', total, 'solved', solved,
                                  'wheel', wheel, 'spun', spun, 'status', status,
                                  'rewardLabel', reward_label, 'rewardK', reward_k) r
          from plays where player_id = v_pid order by started_at desc limit 100) x), '[]'::jsonb));
end $$;

-- ---------- API cho host (mọi hàm admin_* đều kiểm tra mật khẩu host) ----------
create or replace function public.admin_login(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_key(p_key text, p_new text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  if p_new is null or length(p_new) < 8 then return jsonb_build_object('ok', false, 'error', 'short_key'); end if;
  update app_config set admin_hash = crypt(p_new, gen_salt('bf')) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_players(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  return jsonb_build_object('ok', true, 'players', coalesce((select jsonb_agg(x order by lower(x ->> 'name')) from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'turns', p.turns, 'freeUsed', p.free_used, 'active', p.active,
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
      values (trim(p_name), crypt(p_pin, gen_salt('bf')), greatest(0, coalesce(p_turns, v_c.start_turns))) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.admin_player_update(p_key text, p_id uuid, p_name text default null, p_pin text default null,
    p_active boolean default null, p_turns_delta int default null, p_free_used int default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  if p_pin is not null and (length(p_pin) < 4 or length(p_pin) > 12) then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;
  if p_name is not null and (length(trim(p_name)) < 1 or length(trim(p_name)) > 30) then return jsonb_build_object('ok', false, 'error', 'bad_name'); end if;
  begin
    update players set
      name = coalesce(trim(p_name), name),
      pin_hash = case when p_pin is null then pin_hash else crypt(p_pin, gen_salt('bf')) end,
      fails = case when p_pin is null then fails else 0 end,
      locked_until = case when p_pin is null then locked_until else null end,
      active = coalesce(p_active, active),
      turns = greatest(0, turns + coalesce(p_turns_delta, 0)),
      free_used = greatest(0, coalesce(p_free_used, free_used))
    where id = p_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'exists');
  end;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if p_active is false or p_pin is not null then delete from sessions where player_id = p_id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_player_delete(p_key text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  delete from players where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_mark_paid(p_key text, p_id uuid, p_delta numeric) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  update players set paid_k = greatest(0, paid_k + coalesce(p_delta, 0)) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_history(p_key text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(r) from (
      select jsonb_build_object('at', started_at, 'kind', kind, 'level', level, 'total', total, 'solved', solved,
                                'wheel', wheel, 'spun', spun, 'status', status, 'cost', cost,
                                'rewardLabel', reward_label, 'rewardK', reward_k) r
        from plays where player_id = p_id order by started_at desc limit 200) x), '[]'::jsonb));
end $$;

create or replace function public.admin_settings(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb; c app_config;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  select * into c from app_config where id = 1;
  return jsonb_build_object('ok', true, 'costs', c.costs, 'startTurns', c.start_turns, 'freeSpins', c.free_spins,
                            'impossiblePrize', c.impossible_prize);
end $$;

create or replace function public.admin_settings_save(p_key text, p_costs jsonb, p_start_turns int, p_free_spins int, p_impossible_prize text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  update app_config set
    costs = jsonb_build_object(
      'easy', greatest(0, coalesce((p_costs ->> 'easy')::int, 1)),
      'hard', greatest(0, coalesce((p_costs ->> 'hard')::int, 1)),
      'impossible', greatest(0, coalesce((p_costs ->> 'impossible')::int, 0))),
    start_turns = greatest(0, coalesce(p_start_turns, 3)),
    free_spins = greatest(0, coalesce(p_free_spins, 1)),
    impossible_prize = coalesce(nullif(left(trim(p_impossible_prize), 20), ''), impossible_prize)
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_export(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb; c app_config; v_q jsonb; v_w jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  select * into c from app_config where id = 1;
  select jsonb_build_object(
      'easy', coalesce((select jsonb_agg(data || jsonb_build_object('id', id) order by pos) from questions where level = 'easy'), '[]'::jsonb),
      'hard', coalesce((select jsonb_agg(data || jsonb_build_object('id', id) order by pos) from questions where level = 'hard'), '[]'::jsonb),
      'impossible', coalesce((select jsonb_agg(data || jsonb_build_object('id', id) order by pos) from questions where level = 'impossible'), '[]'::jsonb))
    into v_q;
  select coalesce(jsonb_object_agg(level, items), '{}'::jsonb) into v_w from wheels;
  return jsonb_build_object('ok', true, 'app', 'quizwheel', 'version', 2,
    'empty', (not exists (select 1 from questions)) and (not exists (select 1 from wheels)),
    'settings', c.settings, 'questions', v_q, 'wheels', v_w, 'loseImage', c.lose_image);
end $$;

-- Ghi đè dữ liệu của host lên server. Mức/vòng quay nào không có trong p_data thì giữ nguyên.
create or replace function public.admin_import(p_key text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb; v_lv text; v_q jsonb; v_n int; v_cnt int := 0;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_data'); end if;
  begin
    if jsonb_typeof(p_data -> 'questions') = 'object' then
      for v_lv in select k from jsonb_object_keys(p_data -> 'questions') k loop
        continue when v_lv not in ('easy', 'hard', 'impossible');
        continue when jsonb_typeof(p_data -> 'questions' -> v_lv) is distinct from 'array';
        delete from questions where level = v_lv;
        v_n := 0;
        for v_q in select e from jsonb_array_elements(p_data -> 'questions' -> v_lv) e loop
          if v_lv = 'impossible' then
            if jsonb_typeof(v_q -> 'parts') is distinct from 'array' or jsonb_array_length(v_q -> 'parts') <> 2 then raise exception 'bad impossible question'; end if;
          else
            if jsonb_typeof(v_q -> 'answers') is distinct from 'array' or jsonb_array_length(v_q -> 'answers') <> 4
               or coalesce(v_q ->> 'correct', '') !~ '^[0-3]$' then raise exception 'bad question'; end if;
          end if;
          insert into questions (level, id, pos, data)
            values (v_lv, coalesce(nullif(v_q ->> 'id', ''), md5(random()::text || clock_timestamp()::text)), v_n, v_q - 'id');
          v_n := v_n + 1; v_cnt := v_cnt + 1;
        end loop;
      end loop;
    end if;

    if jsonb_typeof(p_data -> 'wheels') = 'object' then
      for v_lv in select k from jsonb_object_keys(p_data -> 'wheels') k loop
        continue when v_lv not in ('free', 'easy', 'easy4', 'easy6', 'hard', 'hard6');
        continue when jsonb_typeof(p_data -> 'wheels' -> v_lv) is distinct from 'array';
        insert into wheels (level, items) values (v_lv, coalesce((
            select jsonb_agg(jsonb_build_object(
                     'id', coalesce(nullif(e ->> 'id', ''), md5(random()::text || clock_timestamp()::text)),
                     'label', left(e ->> 'label', 30),
                     'count', greatest(1, (e ->> 'count')::int),
                     'color', coalesce(e ->> 'color', '#ff5a3c')) order by n)
              from jsonb_array_elements(p_data -> 'wheels' -> v_lv) with ordinality t(e, n)), '[]'::jsonb))
          on conflict (level) do update set items = excluded.items;
      end loop;
    end if;

    if jsonb_typeof(p_data -> 'settings') = 'object' then
      update app_config set settings = settings || (p_data -> 'settings') where id = 1;
    end if;
    if p_data ? 'loseImage' then
      update app_config set lose_image = nullif(p_data ->> 'loseImage', '') where id = 1;
    end if;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'bad_data', 'message', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'questions', v_cnt);
end $$;

-- ---------- Phân quyền: trình duyệt (anon) chỉ gọi được các hàm api_* và admin_* ----------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.api_login(text, text), public.api_logout(text), public.api_config(), public.api_state(text),
  public.api_start(text, text, int), public.api_question(text, uuid), public.api_answer(text, uuid, int, int, jsonb),
  public.api_spin(text, uuid), public.api_history(text),
  public.admin_login(text), public.admin_set_key(text, text), public.admin_players(text),
  public.admin_player_create(text, text, text, int),
  public.admin_player_update(text, uuid, text, text, boolean, int, int),
  public.admin_player_delete(text, uuid), public.admin_mark_paid(text, uuid, numeric), public.admin_history(text, uuid),
  public.admin_settings(text), public.admin_settings_save(text, jsonb, int, int, text),
  public.admin_export(text), public.admin_import(text, jsonb)
to anon;
