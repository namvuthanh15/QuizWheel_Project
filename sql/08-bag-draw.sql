-- ============================================================================
-- QuizWheel – 08-bag-draw.sql  (chạy SAU 01 đến 07; chạy lại nhiều lần vẫn an toàn, KHÔNG xóa dữ liệu)
-- Đổi cơ chế thưởng của Easy/Hard:  Vòng quay  ->  Bao lì xì  ->  Phần thưởng
--  * Vòng quay các vòng easy/easy4/easy6/hard/hard6 quay ra SỐ BAO (0..9) người chơi được rút. Vòng free giữ nguyên.
--  * Host nhập cho mỗi vòng một danh sách giá trị lì xì (K). Giá trị càng lớn càng hiếm (trọng số 1/giá trị²).
--  * Các bao trong một ván không trùng giá trị khi còn giá trị chưa dùng (nhiều bao hơn số giá trị thì mới trùng).
--  * Người chơi chọn 1 bao; chỉ bao đó được lật. Giải lớn 8/8 và Impossible giữ nguyên.
-- Dọn dữ liệu demo cũ nằm ở file riêng 08a-reset-demo-data.sql (chỉ chạy MỘT lần, không hoàn lại được).
-- ============================================================================
alter table public.plays      add column if not exists bags jsonb;      -- giá trị (K) của các bao đã bốc, đã xáo; null = ván không có bao
alter table public.plays      add column if not exists bag_pick int;    -- bao người chơi đã chọn; null = chưa chọn
alter table public.app_config add column if not exists bag_values jsonb not null default '{}'::jsonb;   -- { "easy": [10, 20, 50], ... }

-- Bốc n giá trị cho n bao. Trọng số của giá trị v là 1/v² (giá trị càng lớn càng hiếm).
-- Không trùng khi còn giá trị chưa dùng; hết giá trị mà vẫn còn bao thì nạp lại đủ bộ giá trị rồi bốc tiếp. Kết quả đã xáo vị trí.
create or replace function public._draw_bags(p_vals numeric[], p_n int) returns numeric[]
language plpgsql volatile as $$
declare pool numeric[] := '{}'; res numeric[] := '{}'; k int; i int; len int; tot numeric; r numeric; acc numeric; v numeric;
begin
  if p_vals is null or coalesce(array_length(p_vals, 1), 0) = 0 or p_n < 1 then return '{}'; end if;
  for k in 1..p_n loop
    if coalesce(array_length(pool, 1), 0) = 0 then pool := p_vals; end if;
    len := array_length(pool, 1);
    tot := 0;
    foreach v in array pool loop tot := tot + 1 / (v * v); end loop;
    r := random() * tot; acc := 0;
    for i in 1..len loop
      acc := acc + 1 / (pool[i] * pool[i]);
      if r < acc or i = len then
        res := res || pool[i];
        pool := pool[1:i - 1] || pool[i + 1:len];
        exit;
      end if;
    end loop;
  end loop;
  return (select array_agg(x order by random()) from unnest(res) x);
end $$;

create or replace function public.api_config() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'ok', true,
    'settings', c.settings, 'rules', c.rules, 'costs', c.costs,
    'freeSpins', c.free_spins, 'impossiblePrize', c.impossible_prize,
    'wheels', coalesce((select jsonb_object_agg(level, items) from wheels), '{}'::jsonb),
    'bagRange', coalesce((select jsonb_object_agg(k, jsonb_build_array(mn, mx)) from (
                   select t.k, (select min(x::numeric) from jsonb_array_elements_text(t.v) x) mn, (select max(x::numeric) from jsonb_array_elements_text(t.v) x) mx
                   from jsonb_each(c.bag_values) as t(k, v) where jsonb_typeof(t.v) = 'array' and jsonb_array_length(t.v) > 0) z), '{}'::jsonb),
    'pool', coalesce((select jsonb_object_agg(level, n) from (select level, count(*) n from questions group by level) x), '{}'::jsonb)
  ) from app_config c where c.id = 1
$$;

-- Quay vòng: vòng free như cũ (ra tiền ngay). Các vòng easy/easy4/easy6/hard/hard6 quay ra SỐ BAO LÌ XÌ (0..9);
-- server bốc sẵn giá trị cho từng bao (không trùng khi còn giá trị chưa dùng) rồi chờ người chơi chọn 1 bao (api_pick_bag).
create or replace function public.api_spin(p_token text, p_play uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_pl plays; v_items jsonb; v_total int; v_pick int; v_acc int := 0; v_it jsonb; v_win jsonb;
        v_n int; v_vals numeric[]; v_bags numeric[];
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_pl from plays where id = p_play and player_id = v_pid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_play'); end if;
  if v_pl.status <> 'finished' or v_pl.wheel is null then return jsonb_build_object('ok', false, 'error', 'no_wheel'); end if;
  if v_pl.spun then
    return jsonb_build_object('ok', true, 'again', true, 'wheel', v_pl.wheel, 'item', v_pl.result)
           || case when v_pl.wheel <> 'free' then jsonb_build_object('bags', coalesce((v_pl.result ->> 'bags')::int, 0), 'picked', v_pl.bag_pick is not null)
                   else '{}'::jsonb end;
  end if;
  select items into v_items from wheels where level = v_pl.wheel;
  select coalesce(sum((e ->> 'count')::int), 0) into v_total from jsonb_array_elements(coalesce(v_items, '[]'::jsonb)) e;
  if v_total < 2 then return jsonb_build_object('ok', false, 'error', 'wheel_unavailable'); end if;
  v_pick := floor(random() * v_total)::int;                       -- mỗi ô xác suất bằng nhau
  for v_it in select e from jsonb_array_elements(v_items) e loop
    v_acc := v_acc + (v_it ->> 'count')::int;
    if v_pick < v_acc then v_win := v_it; exit; end if;
  end loop;

  if v_pl.wheel = 'free' then
    update plays set spun = true,
           result = jsonb_build_object('id', v_win ->> 'id', 'label', v_win ->> 'label'),
           reward_label = v_win ->> 'label', reward_k = public._reward_k(v_win ->> 'label')
     where id = v_pl.id;
    return jsonb_build_object('ok', true, 'again', false, 'wheel', v_pl.wheel,
                              'item', jsonb_build_object('id', v_win ->> 'id', 'label', v_win ->> 'label'));
  end if;

  -- Vòng lì xì: ô trúng phải có số bao
  if jsonb_typeof(v_win -> 'bags') is distinct from 'number' then return jsonb_build_object('ok', false, 'error', 'wheel_unavailable'); end if;
  v_n := (v_win ->> 'bags')::int;
  if v_n < 0 or v_n > 9 then return jsonb_build_object('ok', false, 'error', 'wheel_unavailable'); end if;

  if v_n = 0 then                                                  -- ô "0 bao": không được rút
    update plays set spun = true, reward_label = '0 bao', reward_k = 0,
           result = jsonb_build_object('id', v_win ->> 'id', 'label', v_win ->> 'label', 'bags', 0)
     where id = v_pl.id;
    return jsonb_build_object('ok', true, 'again', false, 'wheel', v_pl.wheel,
                              'item', jsonb_build_object('id', v_win ->> 'id', 'label', v_win ->> 'label'), 'bags', 0);
  end if;

  select array_agg(v order by v) into v_vals from (
    select distinct (e)::numeric v
      from jsonb_array_elements_text(coalesce((select bag_values -> v_pl.wheel from app_config where id = 1), '[]'::jsonb)) e) s
   where v > 0;
  if v_vals is null then return jsonb_build_object('ok', false, 'error', 'wheel_unavailable'); end if;   -- host chưa nhập giá trị lì xì
  v_bags := public._draw_bags(v_vals, v_n);
  update plays set spun = true, bags = to_jsonb(v_bags), bag_pick = null, reward_label = null, reward_k = 0,
         result = jsonb_build_object('id', v_win ->> 'id', 'label', v_win ->> 'label', 'bags', v_n)
   where id = v_pl.id;
  return jsonb_build_object('ok', true, 'again', false, 'wheel', v_pl.wheel,
                            'item', jsonb_build_object('id', v_win ->> 'id', 'label', v_win ->> 'label'), 'bags', v_n);
end $$;

-- Chọn 1 bao trong số bao đã quay được. Giá trị đã bốc sẵn ở api_spin (và đã xáo vị trí); chọn bao nào cũng như nhau.
create or replace function public.api_pick_bag(p_token text, p_play uuid, p_slot int) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_pl plays; v_val numeric; v_label text;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_pl from plays where id = p_play and player_id = v_pid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_play'); end if;
  if v_pl.bags is null then return jsonb_build_object('ok', false, 'error', 'no_bags'); end if;
  if v_pl.bag_pick is not null then                                -- đã chọn rồi: trả lại đúng kết quả cũ
    v_val := (v_pl.bags ->> v_pl.bag_pick)::numeric;
    return jsonb_build_object('ok', true, 'again', true, 'slot', v_pl.bag_pick, 'amount', v_val, 'label', v_pl.reward_label);
  end if;
  if p_slot is null or p_slot < 0 or p_slot >= jsonb_array_length(v_pl.bags) then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  v_val := (v_pl.bags ->> p_slot)::numeric;
  v_label := 'Lì xì ' || trim_scale(v_val)::text || 'K';
  update plays set bag_pick = p_slot, reward_label = v_label, reward_k = v_val,
         result = result || jsonb_build_object('label', v_label, 'value', v_val)
   where id = v_pl.id;
  return jsonb_build_object('ok', true, 'again', false, 'slot', p_slot, 'amount', v_val, 'label', v_label);
end $$;

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
                                     'lixiPending', (v_p.lixi_turns is null)),
    'active', case when v_a.id is null then null else jsonb_build_object('playId', v_a.id, 'level', v_a.level, 'total', v_a.total) end,
    'pendingSpin', case when v_s.id is null then null else jsonb_build_object('playId', v_s.id, 'wheel', v_s.wheel, 'level', v_s.level) end,
    'pendingBag', case when v_b.id is null then null else jsonb_build_object('playId', v_b.id, 'count', jsonb_array_length(v_b.bags), 'level', v_b.level) end,
    'rewardK', v_rew, 'paidK', v_p.paid_k);
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
                                  'abandoned', coalesce((result ->> 'abandoned')::boolean, false),
                                  'bagPending', (spun and bags is not null and bag_pick is null),
                                  'rewardLabel', reward_label, 'rewardK', reward_k) r
          from plays where player_id = v_pid order by started_at desc limit 100) x), '[]'::jsonb));
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
    'settings', c.settings, 'questions', v_q, 'wheels', v_w, 'bagValues', c.bag_values, 'loseImage', c.lose_image);
end $$;

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
            if coalesce(v_q ->> 'type', 'mcq') = 'essay' then
              if jsonb_typeof(v_q -> 'accepted') is distinct from 'array' or jsonb_array_length(v_q -> 'accepted') not between 1 and 10
                 or exists (select 1 from jsonb_array_elements(v_q -> 'accepted') a
                             where jsonb_typeof(a) <> 'string' or public._norm_answer(a #>> '{}') = '' or length(a #>> '{}') > 100)
                 then raise exception 'bad essay question'; end if;
            elsif coalesce(v_q ->> 'type', 'mcq') <> 'mcq' then raise exception 'bad question type';
            else
              if jsonb_typeof(v_q -> 'answers') is distinct from 'array' or jsonb_array_length(v_q -> 'answers') not between 3 and 6
                 or coalesce(v_q ->> 'correct', '') !~ '^[0-5]$'
                 or (v_q ->> 'correct')::int >= jsonb_array_length(v_q -> 'answers') then raise exception 'bad question'; end if;
            end if;
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
                     'color', coalesce(e ->> 'color', '#ff5a3c'))
                     || case when jsonb_typeof(e -> 'bags') = 'number' then jsonb_build_object('bags', least(9, greatest(0, (e ->> 'bags')::int))) else '{}'::jsonb end
                     order by n)
              from jsonb_array_elements(p_data -> 'wheels' -> v_lv) with ordinality t(e, n)), '[]'::jsonb))
          on conflict (level) do update set items = excluded.items;
      end loop;
    end if;

    if jsonb_typeof(p_data -> 'bagValues') = 'object' then          -- giá trị lì xì (K) trong bao của từng vòng
      for v_lv in select k from jsonb_object_keys(p_data -> 'bagValues') k loop
        continue when v_lv not in ('easy', 'easy4', 'easy6', 'hard', 'hard6');
        continue when jsonb_typeof(p_data -> 'bagValues' -> v_lv) is distinct from 'array';
        if jsonb_array_length(p_data -> 'bagValues' -> v_lv) > 20
           or exists (select 1 from jsonb_array_elements(p_data -> 'bagValues' -> v_lv) e
                       where jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric <= 0 or (e #>> '{}')::numeric > 100000)
          then raise exception 'bad bag value'; end if;
        update app_config set bag_values = jsonb_set(bag_values, array[v_lv], coalesce((
            select jsonb_agg(v order by v) from (select distinct (e #>> '{}')::numeric v from jsonb_array_elements(p_data -> 'bagValues' -> v_lv) e) s), '[]'::jsonb))
         where id = 1;
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

revoke all on function public._draw_bags(numeric[], int) from public, anon, authenticated;
revoke all on function public.api_pick_bag(text, uuid, int) from public, anon, authenticated;
grant execute on function public.api_pick_bag(text, uuid, int) to anon;
