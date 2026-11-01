-- ============================================================================
-- QuizWheel – 06-abandon-play.sql  (chạy SAU 01 đến 05; chạy lại nhiều lần vẫn an toàn)
-- Nút "Quay lại" trong màn quiz: người chơi xác nhận thoát giữa chừng thì ván bị đóng NGAY TẠI SERVER.
-- Lượt đã trừ lúc bắt đầu KHÔNG được hoàn, không có vòng quay thưởng, tiến trình ván đó mất.
-- (Chốt ở server để tải lại trang hay đổi máy cũng không vào lại được ván cũ.)
-- ============================================================================
create or replace function public.api_abandon(p_token text, p_play uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_pl plays;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_pl from plays where id = p_play and player_id = v_pid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_play'); end if;
  if v_pl.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'not_active'); end if;
  update plays set status = 'finished', wheel = null, spun = true, served_at = null, finished_at = now(),
                   reward_label = null, reward_k = 0, result = jsonb_build_object('abandoned', true)
   where id = v_pl.id;
  return jsonb_build_object('ok', true);
end $$;

-- Lịch sử: thêm cờ "abandoned" để hiện "Đã bỏ giữa chừng"
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
                                  'rewardLabel', reward_label, 'rewardK', reward_k) r
          from plays where player_id = v_pid order by started_at desc limit 100) x), '[]'::jsonb));
end $$;

revoke all on function public.api_abandon(text, uuid) from public, anon, authenticated;
grant execute on function public.api_abandon(text, uuid) to anon;
