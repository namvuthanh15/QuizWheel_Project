-- ============================================================================
-- QuizWheel – 05-question-types.sql  (chạy SAU 01, 02, 03, 04; chạy lại nhiều lần vẫn an toàn)
-- 1) Câu trắc nghiệm có 3 đến 6 đáp án (A–F). Câu cũ 4 đáp án vẫn chạy y như trước.
-- 2) Câu TỰ LUẬN (bản thử nghiệm đầu tiên): người chơi gõ câu trả lời; host nhập một hoặc vài "đáp án chấp nhận".
--    So khớp không phân biệt hoa/thường, dấu tiếng Việt, dấu câu, khoảng trắng thừa.
-- Cần hàm public.norm_name của 03-login-name.sql.
-- ============================================================================

-- Chuẩn hóa câu trả lời tự luận: norm_name + bỏ dấu câu (chỉ giữ chữ, số, khoảng trắng)
create or replace function public._norm_answer(p_text text) returns text
language sql immutable parallel safe set search_path = pg_catalog as $$
  select btrim(regexp_replace(regexp_replace(public.norm_name(p_text), '[^a-z0-9 ]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- Hoán vị n vị trí (đảo đáp án)
create or replace function public._perm(p_n int) returns jsonb
language sql volatile as $$
  select jsonb_agg(i order by random()) from generate_series(0, p_n - 1) i
$$;

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
  select coalesce(jsonb_agg(
           case when v_typed or coalesce(t.q ->> 'type', 'mcq') = 'essay' then '[]'::jsonb
                when v_shuf then public._perm(jsonb_array_length(t.q -> 'answers'))
                else (select jsonb_agg(i order by i) from generate_series(0, jsonb_array_length(t.q -> 'answers') - 1) i) end
           order by t.n), '[]'::jsonb)
    into v_perms from jsonb_array_elements(v_qdata) with ordinality t(q, n);

  update players set turns = turns - v_cost where id = v_pid;
  insert into plays (player_id, kind, level, total, cost, q_data, perms)
    values (v_pid, 'quiz', p_level, p_count, v_cost, v_qdata, v_perms) returning id into v_play;
  return jsonb_build_object('ok', true, 'playId', v_play, 'level', p_level, 'total', p_count,
                            'cost', v_cost, 'turns', v_p.turns - v_cost, 'typed', v_typed);
end $$;

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
  if not v_typed and coalesce(v_q ->> 'type', 'mcq') <> 'essay' then
    select jsonb_agg(jsonb_build_object('text', a ->> 'text', 'image', a -> 'image') order by i)
      into v_ans
      from generate_series(0, jsonb_array_length(v_q -> 'answers') - 1) i,
           lateral (select (v_q -> 'answers') -> (((v_pl.perms -> v_pl.idx) ->> i)::int) as a) z;
  end if;
  return jsonb_build_object('ok', true, 'index', v_pl.idx, 'total', v_pl.total, 'level', v_pl.level,
                            'text', v_q ->> 'text', 'typed', v_typed, 'kind', case when v_typed then 'typed' else coalesce(v_q ->> 'type', 'mcq') end, 'answers', v_ans, 'remaining', v_rem, 'solved', v_pl.solved);
end $$;

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

  if coalesce(v_q ->> 'type', 'mcq') = 'essay' then
    -- Tự luận (bản thử nghiệm): người chơi gõ chữ, gửi trong p_parts = {"text": "..."}; đúng nếu khớp một "đáp án chấp nhận"
    -- sau khi bỏ dấu, bỏ hoa/thường, bỏ dấu câu và khoảng trắng thừa.
    if not v_timeout and p_parts is not null and jsonb_typeof(p_parts) = 'object'
       and length(coalesce(p_parts ->> 'text', '')) between 1 and 300 then
      v_ok := exists (select 1 from jsonb_array_elements_text(v_q -> 'accepted') a
                       where public._norm_answer(a) <> '' and public._norm_answer(a) = public._norm_answer(p_parts ->> 'text'));
    end if;
  elsif not v_timeout and p_choice is not null and p_choice between 0 and jsonb_array_length(v_q -> 'answers') - 1 then
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

revoke all on function public._norm_answer(text), public._perm(int) from public, anon, authenticated;
