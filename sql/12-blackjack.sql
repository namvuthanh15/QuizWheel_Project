-- ============================================================================
-- QuizWheel – 12-blackjack.sql  (chạy SAU 01 đến 11; chạy lại nhiều lần vẫn an toàn)
-- Blackjack cược bằng SỐ DƯ lì xì (số dư = rewardK − paidK, đơn vị K), do SERVER giữ hoàn toàn:
--  * Tiền cược bị trừ NGAY khi chia bài (ghi 1 dòng plays kind 'blackjack' với reward_k = −cược);
--    kết thúc ván thì dòng đó được cập nhật thành kết quả thật: thắng +1×, Blackjack tự nhiên +1,5×,
--    hòa 0 (hoàn cược), thua/quá 21/nhà cái Blackjack/bỏ ván = −1×. Bỏ ván giữa chừng = thua (cược đã trừ sẵn).
--  * BÀI CHIA THẬT, LUẬT CHUẨN (nhà cái rút tới 17, đứng ở soft 17, nhà cái xem bài ngay khi chia nên Blackjack tự nhiên
--    của hai bên được xử ngay). KHÔNG chốt trước kết quả: bốn lá đầu chia đều; chỉ các lá RÚT THÊM bị "thiên lệch nhẹ":
--      - lá người chơi rút: lá làm QUÁ 21 có trọng số e^g so với lá khác (1);
--      - lá nhà cái rút:    lá làm QUÁ 21 có trọng số e^−g.
--    g > 0 nghiêng về nhà cái (khó hơn), g < 0 nghiêng về người chơi. Người chơi giỏi (chiến thuật cơ bản) vẫn thắng
--    nhiều hơn người chơi ẩu, nên cần kỹ năng.
--  * Chuỗi app_config.bj_chain (mặc định 43.6, 41.6, 39.6, 37.5, 35.5) là TỈ LỆ THẮNG MỤC TIÊU (%) của một người chơi chuẩn theo bậc
--    (bậc = số ván đã thắng players.bj_wins, không tự về 0; host có thể reset). Các số mặc định được chọn theo EV mục tiêu
--    của người chơi chuẩn (chiến thuật cơ bản, không Double/Split/Insurance): bậc 1..5 ≈ −2%, −6%, −10%, −14%, −18% trên mỗi 1 đồng cược
--    (EV = lãi/lỗ trung bình; bậc 1 không còn EV dương nên không có mức nào có lợi cho người chơi). _bj_bias() đổi % thành g bằng
--    bảng hiệu chuẩn từ mô phỏng (tests/blackjack-sql-sim.py). Đây là XẤP XỈ, không phải đảm bảo; sàn khả thi khoảng 21%
--    (thấp hơn thì phải gian lận lộ liễu nên bị chặn ở g = 4).
--  * HỒI PHỤC: sau khi thắng ít nhất 1 ván, mỗi ván THUA (thua, quá 21, nhà cái Blackjack, bỏ ván) cộng 1 điểm % vào tỉ lệ
--    hiện tại (players.bj_rate) cho tới khi chạm mức của bậc ngay trước; hòa giữ nguyên; thắng thì về mức gốc của bậc kế tiếp.
--  * Bộ bài còn lại và lá úp nằm trong bảng bj_games (RLS bật, không policy) nên trình duyệt không đọc được.
--    Trình duyệt chỉ thấy "bước độ khó", không thấy % hay g.
--  * Không đụng lượt Quiz/Gacha, không đổi hàm cũ ngoài việc THÊM trường (api_config, api_history, admin_*).
-- ============================================================================

alter table public.players    add column if not exists bj_wins int not null default 0 check (bj_wins >= 0);
alter table public.players    add column if not exists bj_rate numeric check (bj_rate is null or (bj_rate >= 0 and bj_rate <= 100));  -- null = dùng mức gốc của bậc
alter table public.app_config add column if not exists bj_enabled boolean not null default true;
alter table public.app_config add column if not exists bj_chain jsonb not null default '[43.6,41.6,39.6,37.5,35.5]'::jsonb;
-- Đổi các chuỗi mặc định cũ (bản nháp và bản M8) sang chuỗi mới; chuỗi do host tự đặt thì giữ nguyên
update public.app_config set bj_chain = '[43.6,41.6,39.6,37.5,35.5]'::jsonb
 where bj_chain in ('[50,35,20,5,0]'::jsonb, '[50,40,33,27,22]'::jsonb);

-- Cho phép loại ván 'blackjack' trong bảng plays (gỡ ràng buộc kind cũ rồi tạo lại)
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.plays'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.plays drop constraint %I', c);
  end loop;
end $$;
alter table public.plays add constraint plays_kind_check check (kind in ('quiz', 'free', 'gacha', 'blackjack'));

-- Ván Blackjack (trạng thái bí mật của server)
create table if not exists public.bj_games (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  play_id uuid not null references public.plays(id) on delete cascade,
  bet numeric not null check (bet > 0),
  bias numeric not null default 0,                                  -- g của ván này (chốt lúc chia)
  hole text,                                                        -- lá úp của nhà cái (chưa lộ)
  deck text[] not null,                                             -- các lá CÒN LẠI (đã xáo), vd 'spades-A', 'hearts-10'
  player_cards text[] not null,
  dealer_cards text[] not null,                                     -- chỉ các lá ĐÃ NGỬA (lá úp nằm ở cột hole)
  status text not null default 'open' check (status in ('open', 'done')),
  outcome text,                                                     -- win | blackjack | push | lose | bust | dealer_blackjack | abandoned
  created_at timestamptz not null default now()
);
-- Nếu đã chạy bản nháp cũ của file này: bổ sung cột mới, gỡ cột "kết quả chốt trước"
alter table public.bj_games add column if not exists bias numeric not null default 0;
alter table public.bj_games add column if not exists hole text;
alter table public.bj_games drop column if exists target;
alter table public.bj_games drop column if exists is_natural;
create unique index if not exists bj_games_one_open on public.bj_games (player_id) where status = 'open';
alter table public.bj_games enable row level security;
-- (không tạo policy nào => anon/authenticated KHÔNG đọc/ghi được; chỉ các hàm bên dưới chạy với quyền chủ sở hữu)

-- ---------- Hàm nội bộ ----------
create or replace function public._bj_val(p_rank text) returns int
language sql immutable as $$
  select case p_rank when 'A' then 11 when 'J' then 10 when 'Q' then 10 when 'K' then 10 else p_rank::int end
$$;

-- Điểm tốt nhất của một tay (Ace = 11, hạ về 1 từng lá khi quá 21). Giống js/blackjack/blackjack-engine.js
create or replace function public._bj_score(p_cards text[]) returns int
language plpgsql immutable as $$
declare c text; t int := 0; aces int := 0;
begin
  if p_cards is null then return 0; end if;
  foreach c in array p_cards loop
    t := t + public._bj_val(split_part(c, '-', 2));
    if split_part(c, '-', 2) = 'A' then aces := aces + 1; end if;
  end loop;
  while t > 21 and aces > 0 loop
    t := t - 10; aces := aces - 1;
  end loop;
  return t;
end $$;

create or replace function public._bj_deck() returns text[]
language sql volatile as $$
  select array_agg(s || '-' || r order by random())
    from unnest(array['spades', 'hearts', 'diamonds', 'clubs']) s,
         unnest(array['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) r
$$;

-- Đổi "tỉ lệ thắng mục tiêu (%) của người chơi chuẩn" thành độ thiên lệch g (nội suy tuyến tính trên bảng hiệu chuẩn).
-- Bảng lấy từ mô phỏng chiến thuật cơ bản (tests/blackjack-sql-sim.py, đã làm mượt bằng đa thức bậc 5). Dưới ~21% thì dừng ở g = 4.
create or replace function public._bj_bias(p_rate numeric) returns numeric
language plpgsql immutable as $$
declare
  r numeric[] := array[50.0, 47.1, 44.7, 43.6, 41.8, 40.1, 37.9, 35.8, 33.9, 32.1, 29.0, 26.1, 24.0, 22.5, 21.0]::numeric[];
  g numeric[] := array[-0.55, -0.3, -0.1, 0, 0.15, 0.3, 0.5, 0.7, 0.9, 1.1, 1.5, 2.0, 2.5, 3.0, 4.0]::numeric[];
  i int;
begin
  if p_rate is null or p_rate >= r[1] then return g[1]; end if;
  if p_rate <= r[15] then return g[15]; end if;
  for i in 1 .. 14 loop
    if p_rate <= r[i] and p_rate >= r[i + 1] then
      return g[i] + (g[i + 1] - g[i]) * (r[i] - p_rate) / (r[i] - r[i + 1]);
    end if;
  end loop;
  return 0;
end $$;

-- Rút 1 lá từ p_deck cho tay p_hand. p_who = 'p' (người chơi) hoặc 'd' (nhà cái); p_bias = g.
-- Lá làm quá 21 có trọng số e^g (người chơi) hoặc e^−g (nhà cái); lá khác trọng số 1. Quay số theo trọng số.
create or replace function public._bj_pick(p_deck text[], p_hand text[], p_who text, p_bias numeric) returns text
language plpgsql volatile as $$
declare i int; w numeric; total numeric := 0; ws numeric[] := '{}'::numeric[]; r numeric; acc numeric := 0;
begin
  for i in 1 .. cardinality(p_deck) loop
    if public._bj_score(p_hand || p_deck[i]) > 21 then
      w := exp(case when p_who = 'p' then p_bias else -p_bias end);
    else
      w := 1;
    end if;
    ws := ws || w; total := total + w;
  end loop;
  r := random() * total;
  for i in 1 .. cardinality(p_deck) loop
    acc := acc + ws[i];
    if r < acc then return p_deck[i]; end if;
  end loop;
  return p_deck[cardinality(p_deck)];
end $$;

-- Kết thúc ván: ghi kết quả vào plays, đóng bj_games, cập nhật bj_wins / bj_rate. Trả về tiền thắng/thua (K, có dấu).
create or replace function public._bj_settle(p_game uuid, p_outcome text, p_dealer text[]) returns numeric
language plpgsql security definer set search_path = public, extensions as $$
declare g bj_games; v_delta numeric; v_p players; v_chain jsonb; v_idx int; v_base numeric; v_cap numeric;
  v_step constant numeric := 1;      -- điểm % hồi phục sau mỗi ván thua
begin
  select * into g from bj_games where id = p_game;
  select * into v_p from players where id = g.player_id;
  select bj_chain into v_chain from app_config where id = 1;
  v_idx := least(v_p.bj_wins, jsonb_array_length(v_chain) - 1);
  v_delta := case p_outcome when 'win' then g.bet when 'blackjack' then g.bet * 1.5 when 'push' then 0 else -g.bet end;
  update bj_games set status = 'done', outcome = p_outcome, dealer_cards = p_dealer where id = g.id;
  update plays set reward_k = v_delta, finished_at = now(),
                   result = jsonb_build_object('outcome', p_outcome, 'bet', g.bet, 'abandoned', (p_outcome = 'abandoned'),
                                               'player', to_jsonb(g.player_cards), 'dealer', to_jsonb(p_dealer))
   where id = g.play_id;
  if p_outcome in ('win', 'blackjack') then
    update players set bj_wins = bj_wins + 1, bj_rate = null where id = g.player_id;       -- thắng: về mức gốc của bậc kế tiếp
  elsif p_outcome <> 'push' and v_idx >= 1 then
    -- thua (kể cả quá 21 / bỏ ván): +v_step (1) điểm %, tối đa bằng mức của bậc ngay trước, và không thấp hơn mức gốc của bậc hiện tại
    v_base := (v_chain ->> v_idx)::numeric;
    v_cap := (v_chain ->> (v_idx - 1))::numeric;
    update players set bj_rate = greatest(v_base, least(coalesce(bj_rate, v_base) + v_step, v_cap)) where id = g.player_id;
  end if;
  return v_delta;
end $$;

-- Số dư hiện có (K) = tổng reward_k − đã trả. Đã gồm tiền cược của ván đang mở (vì đã trừ sẵn).
create or replace function public._bj_balance(p_pid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(reward_k) from plays where player_id = p_pid), 0)
         - coalesce((select paid_k from players where id = p_pid), 0)
$$;

-- ---------- API cho người chơi ----------
-- Trạng thái: bật/tắt, số dư, giới hạn cược, "bước độ khó" (KHÔNG có phần trăm), ván đang mở (nếu có)
create or replace function public.api_bj_state(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_p players; v_c app_config; g bj_games; v_bal numeric; v_len int; v_open jsonb := null;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_p from players where id = v_pid;
  select * into v_c from app_config where id = 1;
  v_bal := public._bj_balance(v_pid);
  v_len := jsonb_array_length(v_c.bj_chain);
  select * into g from bj_games where player_id = v_pid and status = 'open';
  if g.id is not null then
    v_open := jsonb_build_object('bet', g.bet, 'player', to_jsonb(g.player_cards), 'dealer', to_jsonb(g.dealer_cards),
                                 'playerScore', public._bj_score(g.player_cards));
  end if;
  return jsonb_build_object('ok', true, 'enabled', v_c.bj_enabled, 'balanceK', v_bal,
    'minBet', greatest(0.1, floor(v_bal * 2.5) / 10), 'maxBet', floor(v_bal * 10) / 10, 'step', 0.1,
    'difficulty', jsonb_build_object('step', least(v_p.bj_wins, v_len - 1) + 1, 'steps', v_len),
    'open', v_open);
end $$;

-- Chia bài. p_bet: bội của 0,1K, từ ¼ số dư (làm tròn xuống, tối thiểu 0,1K) đến toàn bộ số dư (làm tròn xuống 0,1K).
-- Có ván đang mở (thoát giữa chừng / tải lại trang) thì ván đó bị xử THUA trước, TRỪ khi ván đó vừa mở dưới 5 giây
-- (bấm đúp, hai tab bấm sát nhau): khi đó trả lỗi 'game_open', KHÔNG phạt ván cũ và KHÔNG mở ván mới / trừ thêm cược.
-- Bốn lá đầu chia đều: người chơi, nhà cái (ngửa), người chơi, nhà cái (úp). Nhà cái xem bài: có Blackjack tự nhiên thì ván xong ngay.
-- Trả về: {ok, bet, player:[2 lá], dealer:[lá ngửa], playerScore, done:false}
--         hoặc, khi có Blackjack tự nhiên (ván kết thúc ngay): done:true, outcome: blackjack | dealer_blackjack | push, dealer:[2 lá], delta.
create or replace function public.api_bj_start(p_token text, p_bet numeric) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pid uuid; v_p players; v_c app_config; v_old bj_games;
  v_bal numeric; v_min numeric; v_max numeric;
  v_len int; v_idx int; v_pct numeric; v_bias numeric;
  v_deck text[]; v_pc text[]; v_up text; v_hole text;
  v_play uuid; v_gid uuid; v_delta numeric; v_pn boolean; v_dn boolean; v_out text;
  v_grace constant interval := interval '5 seconds';                  -- ván mở dưới mức này thì không bị ván mới đè
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_p from players where id = v_pid for update;        -- khóa dòng: chặn bấm song song
  select * into v_c from app_config where id = 1;
  if not v_c.bj_enabled then return jsonb_build_object('ok', false, 'error', 'disabled'); end if;

  select * into v_old from bj_games where player_id = v_pid and status = 'open' for update;
  if v_old.id is not null then
    if clock_timestamp() - v_old.created_at < v_grace then                    -- ván vừa mở (tab/thiết bị khác hoặc bấm đúp): giữ nguyên, không phạt
      return jsonb_build_object('ok', false, 'error', 'game_open');
    end if;
    perform public._bj_settle(v_old.id, 'abandoned', v_old.dealer_cards);   -- bỏ ván = thua (cược đã trừ sẵn)
    select * into v_p from players where id = v_pid;                          -- đọc lại: bj_rate có thể vừa đổi
  end if;

  v_bal := public._bj_balance(v_pid);
  v_max := floor(v_bal * 10) / 10;
  if v_max < 0.1 then return jsonb_build_object('ok', false, 'error', 'no_balance', 'balanceK', v_bal); end if;
  v_min := greatest(0.1, floor(v_bal * 2.5) / 10);
  if p_bet is null or p_bet < v_min or p_bet > v_max or p_bet * 10 <> round(p_bet * 10) then
    return jsonb_build_object('ok', false, 'error', 'bad_bet', 'minBet', v_min, 'maxBet', v_max, 'balanceK', v_bal);
  end if;

  -- Độ thiên lệch theo bậc (hoặc tỉ lệ đã hồi phục) của người chơi
  v_len := jsonb_array_length(v_c.bj_chain);
  v_idx := least(v_p.bj_wins, v_len - 1);
  v_pct := coalesce(v_p.bj_rate, (v_c.bj_chain ->> v_idx)::numeric);
  v_bias := public._bj_bias(v_pct);

  v_deck := public._bj_deck();                                        -- đã xáo; bốn lá đầu chia đều
  v_pc := array[v_deck[1], v_deck[3]];
  v_up := v_deck[2];
  v_hole := v_deck[4];
  v_deck := v_deck[5:cardinality(v_deck)];
  v_pn := public._bj_score(v_pc) = 21;
  v_dn := public._bj_score(array[v_up, v_hole]) = 21;

  -- Trừ cược ngay: dòng plays tạm với reward_k = −cược (status finished, không wheel => không gây "ván dở" của Quiz)
  insert into plays (player_id, kind, level, total, cost, status, spun, reward_k, result, finished_at)
    values (v_pid, 'blackjack', 'blackjack', 0, 0, 'finished', true, -p_bet,
            jsonb_build_object('open', true, 'bet', p_bet), now())
    returning id into v_play;

  if v_pn or v_dn then
    insert into bj_games (player_id, play_id, bet, bias, hole, deck, player_cards, dealer_cards)
      values (v_pid, v_play, p_bet, v_bias, v_hole, v_deck, v_pc, array[v_up]) returning id into v_gid;
    v_out := case when v_pn and v_dn then 'push' when v_pn then 'blackjack' else 'dealer_blackjack' end;
    v_delta := public._bj_settle(v_gid, v_out, array[v_up, v_hole]);
    return jsonb_build_object('ok', true, 'bet', p_bet, 'player', to_jsonb(v_pc), 'dealer', to_jsonb(array[v_up, v_hole]),
                              'playerScore', public._bj_score(v_pc), 'done', true, 'outcome', v_out, 'delta', v_delta,
                              'balanceK', public._bj_balance(v_pid));
  end if;

  insert into bj_games (player_id, play_id, bet, bias, hole, deck, player_cards, dealer_cards)
    values (v_pid, v_play, p_bet, v_bias, v_hole, v_deck, v_pc, array[v_up]);
  return jsonb_build_object('ok', true, 'bet', p_bet, 'player', to_jsonb(v_pc), 'dealer', to_jsonb(array[v_up]),
                            'playerScore', public._bj_score(v_pc), 'done', false,
                            'balanceK', public._bj_balance(v_pid));
end $$;

-- HIT: rút 1 lá (thiên lệch nhẹ theo bậc). Không rút khi đã đủ 21.
-- Trả về {ok, card, playerScore, done}; nếu quá 21: done:true, outcome:'bust', dealer:[lá ngửa, lá úp], delta.
create or replace function public.api_bj_hit(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; g bj_games; v_card text; v_s int; v_delta numeric; v_dealer text[];
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  perform 1 from players where id = v_pid for update;
  select * into g from bj_games where player_id = v_pid and status = 'open' for update;
  if g.id is null then return jsonb_build_object('ok', false, 'error', 'no_game'); end if;
  if public._bj_score(g.player_cards) >= 21 then return jsonb_build_object('ok', false, 'error', 'cannot_hit'); end if;

  v_card := public._bj_pick(g.deck, g.player_cards, 'p', g.bias);
  g.deck := array_remove(g.deck, v_card);
  g.player_cards := g.player_cards || v_card;
  v_s := public._bj_score(g.player_cards);
  update bj_games set deck = g.deck, player_cards = g.player_cards where id = g.id;

  if v_s > 21 then
    v_dealer := g.dealer_cards || g.hole;                                     -- lật lá úp cho đẹp; nhà cái không rút
    v_delta := public._bj_settle(g.id, 'bust', v_dealer);
    return jsonb_build_object('ok', true, 'card', v_card, 'playerScore', v_s, 'done', true, 'outcome', 'bust',
                              'dealer', to_jsonb(v_dealer), 'delta', v_delta, 'balanceK', public._bj_balance(v_pid));
  end if;
  return jsonb_build_object('ok', true, 'card', v_card, 'playerScore', v_s, 'done', false);
end $$;

-- STAND: lật lá úp, nhà cái rút tới 17 (đứng ở soft 17), so điểm.
-- Trả về {ok, done:true, outcome:'win'|'push'|'lose', dealer:[tất cả lá theo thứ tự: ngửa, úp, rút...], dealerScore, playerScore, delta}
create or replace function public.api_bj_stand(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; g bj_games; v_ps int; v_ds int; v_res text; v_d text[]; v_rem text[]; v_card text; v_n int := 0; v_delta numeric;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  perform 1 from players where id = v_pid for update;
  select * into g from bj_games where player_id = v_pid and status = 'open' for update;
  if g.id is null then return jsonb_build_object('ok', false, 'error', 'no_game'); end if;

  v_ps := public._bj_score(g.player_cards);
  v_d := g.dealer_cards || g.hole;
  v_rem := g.deck;
  while public._bj_score(v_d) < 17 and v_n < 12 loop                          -- nhà cái rút khi < 17, đứng ở 17 (kể cả soft 17)
    v_card := public._bj_pick(v_rem, v_d, 'd', g.bias);
    v_rem := array_remove(v_rem, v_card);
    v_d := v_d || v_card;
    v_n := v_n + 1;
  end loop;
  v_ds := public._bj_score(v_d);
  v_res := case when v_ds > 21 or v_ds < v_ps then 'win' when v_ds = v_ps then 'push' else 'lose' end;

  v_delta := public._bj_settle(g.id, v_res, v_d);
  return jsonb_build_object('ok', true, 'done', true, 'outcome', v_res, 'dealer', to_jsonb(v_d), 'dealerScore', v_ds,
                            'playerScore', v_ps, 'delta', v_delta, 'balanceK', public._bj_balance(v_pid));
end $$;

-- Bỏ ván (thoát giữa chừng): tính thua, cược đã trừ sẵn nên không hoàn. Không có ván mở thì không làm gì.
create or replace function public.api_bj_abandon(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; g bj_games;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  perform 1 from players where id = v_pid for update;
  select * into g from bj_games where player_id = v_pid and status = 'open' for update;
  if g.id is not null then
    perform public._bj_settle(g.id, 'abandoned', g.dealer_cards);
  end if;
  return jsonb_build_object('ok', true, 'balanceK', public._bj_balance(v_pid));
end $$;

-- ---------- Host ----------
-- Bật/tắt Blackjack và đặt chuỗi % thắng mục tiêu của người chơi chuẩn (1 đến 10 số, mỗi số 0..100; dưới ~21% không khả thi). p_enabled / p_chain = null => giữ nguyên.
create or replace function public.admin_bj_config(p_key text, p_enabled boolean, p_chain jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb; e jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  if p_chain is not null then
    if jsonb_typeof(p_chain) <> 'array' or jsonb_array_length(p_chain) < 1 or jsonb_array_length(p_chain) > 10 then
      return jsonb_build_object('ok', false, 'error', 'bad_chain');
    end if;
    for e in select value from jsonb_array_elements(p_chain) loop
      if jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric < 0 or (e #>> '{}')::numeric > 100 then
        return jsonb_build_object('ok', false, 'error', 'bad_chain');
      end if;
    end loop;
  end if;
  update app_config set bj_enabled = coalesce(p_enabled, bj_enabled), bj_chain = coalesce(p_chain, bj_chain) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- Đặt lại số ván đã thắng của một người về 0 và bỏ tỉ lệ hồi phục (về lại bậc 1)
create or replace function public.admin_bj_reset_wins(p_key text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  update players set bj_wins = 0, bj_rate = null where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Các hàm sẵn có, chỉ THÊM trường Blackjack (giữ nguyên phần còn lại như bản mới nhất) ----------
-- api_config: thêm bjEnabled (trang chủ ẩn/hiện nút Blackjack)
create or replace function public.api_config() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'ok', true, 'gachaCost', 1, 'bjEnabled', c.bj_enabled,
    'settings', c.settings, 'rules', c.rules, 'costs', c.costs,
    'freeSpins', c.free_spins, 'impossiblePrize', c.impossible_prize,
    'wheels', coalesce((select jsonb_object_agg(level, items) from wheels), '{}'::jsonb),
    'bagRange', coalesce((select jsonb_object_agg(k, jsonb_build_array(mn, mx)) from (
                   select t.k, (select min(x::numeric) from jsonb_array_elements_text(t.v) x) mn, (select max(x::numeric) from jsonb_array_elements_text(t.v) x) mx
                   from jsonb_each(c.bag_values) as t(k, v) where jsonb_typeof(t.v) = 'array' and jsonb_array_length(t.v) > 0) z), '{}'::jsonb),
    'pool', coalesce((select jsonb_object_agg(level, n) from (select level, count(*) n from questions group by level) x), '{}'::jsonb)
  ) from app_config c where c.id = 1
$$;

-- api_history: thêm 'outcome' (win | blackjack | push | lose | bust | abandoned) cho ván Blackjack
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
                                  'outcome', case when kind = 'blackjack' then result ->> 'outcome' else null end,
                                  'bet', case when kind = 'blackjack' then (result ->> 'bet')::numeric else null end,
                                  'rewardLabel', reward_label, 'rewardK', reward_k) r
          from plays where player_id = v_pid order by started_at desc limit 100) x), '[]'::jsonb));
end $$;

-- admin_history: thêm 'outcome' và 'bet'
create or replace function public.admin_history(p_key text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(r) from (
      select jsonb_build_object('at', started_at, 'kind', kind, 'level', level, 'total', total, 'solved', solved,
                                'wheel', wheel, 'spun', spun, 'status', status, 'cost', cost,
                                'outcome', case when kind = 'blackjack' then result ->> 'outcome' else null end,
                                'bet', case when kind = 'blackjack' then (result ->> 'bet')::numeric else null end,
                                'rewardLabel', reward_label, 'rewardK', reward_k) r
        from plays where player_id = p_id order by started_at desc limit 200) x), '[]'::jsonb));
end $$;

-- admin_players: thêm bjWins
create or replace function public.admin_players(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  return jsonb_build_object('ok', true, 'players', coalesce((select jsonb_agg(x order by lower(x ->> 'name')) from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'turns', p.turns, 'freeUsed', p.free_used, 'active', p.active, 'lixi', p.lixi_turns,
             'paidK', p.paid_k, 'impLocked', p.imp_locked, 'gachaLeft', p.gacha_left, 'gachaRate', p.gacha_rate, 'bjWins', p.bj_wins, 'bjRate', p.bj_rate,
             'rewardK', (select coalesce(sum(reward_k), 0) from plays where player_id = p.id),
             'plays', (select count(*) from plays where player_id = p.id),
             'lastAt', (select max(started_at) from plays where player_id = p.id)) x
    from players p) y), '[]'::jsonb));
end $$;

-- admin_settings: thêm bjEnabled, bjChain
create or replace function public.admin_settings(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare err jsonb; c app_config;
begin
  err := public._adm_err(p_key); if err is not null then return err; end if;
  select * into c from app_config where id = 1;
  return jsonb_build_object('ok', true, 'costs', c.costs, 'startTurns', c.start_turns, 'freeSpins', c.free_spins,
                            'impossiblePrize', c.impossible_prize, 'gachaRate', c.gacha_rate,
                            'bjEnabled', c.bj_enabled, 'bjChain', c.bj_chain);
end $$;

-- ---------- Phân quyền (giống các file trước) ----------
revoke all on function public._bj_val(text), public._bj_score(text[]), public._bj_deck(),
                       public._bj_settle(uuid, text, text[]), public._bj_balance(uuid),
                       public._bj_bias(numeric), public._bj_pick(text[], text[], text, numeric) from public, anon, authenticated;
revoke all on function public.api_bj_state(text), public.api_bj_start(text, numeric), public.api_bj_hit(text),
                       public.api_bj_stand(text), public.api_bj_abandon(text),
                       public.admin_bj_config(text, boolean, jsonb), public.admin_bj_reset_wins(text, uuid) from public, anon, authenticated;
grant execute on function public.api_bj_state(text) to anon;
grant execute on function public.api_bj_start(text, numeric) to anon;
grant execute on function public.api_bj_hit(text) to anon;
grant execute on function public.api_bj_stand(text) to anon;
grant execute on function public.api_bj_abandon(text) to anon;
grant execute on function public.admin_bj_config(text, boolean, jsonb) to anon;
grant execute on function public.admin_bj_reset_wins(text, uuid) to anon;

notify pgrst, 'reload schema';
