-- ============================================================================
-- QuizWheel – 09-open-all-bags.sql  (chạy SAU 08; chạy lại nhiều lần vẫn an toàn, KHÔNG xóa dữ liệu)
-- Đổi cách thưởng: quay được N bao thì người chơi MỞ HẾT N bao và nhận TỔNG giá trị của các bao.
-- Thay api_pick_bag (chọn 1 bao) bằng api_open_bags (mở tất cả). Cột plays.bag_pick giờ có nghĩa là "số bao đã mở" (null = chưa mở).
-- Giá trị các bao vẫn do server bốc sẵn lúc quay (api_spin); hàm này chỉ công bố các giá trị đó và chốt tiền thưởng MỘT LẦN.
-- ============================================================================
create or replace function public.api_open_bags(p_token text, p_play uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_pid uuid; v_pl plays; v_total numeric; v_label text; v_n int;
begin
  v_pid := public._player_id(p_token);
  if v_pid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  select * into v_pl from plays where id = p_play and player_id = v_pid for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_play'); end if;
  if v_pl.bags is null then return jsonb_build_object('ok', false, 'error', 'no_bags'); end if;
  v_n := jsonb_array_length(v_pl.bags);
  select coalesce(sum(x::numeric), 0) into v_total from jsonb_array_elements_text(v_pl.bags) x;
  if v_pl.bag_pick is null then                                    -- lần đầu: chốt tiền thưởng = tổng các bao
    v_label := 'Lì xì ' || trim_scale(v_total)::text || 'K';
    update plays set bag_pick = v_n, reward_k = v_total, reward_label = v_label,
           result = result || jsonb_build_object('label', v_label, 'value', v_total)
     where id = v_pl.id;
  else                                                             -- gọi lại (tải lại trang...): trả đúng kết quả cũ, không cộng thêm
    v_label := v_pl.reward_label;
  end if;
  return jsonb_build_object('ok', true, 'values', v_pl.bags, 'total', v_total, 'label', v_label, 'again', v_pl.bag_pick is not null);
end $$;

revoke all on function public.api_open_bags(text, uuid) from public, anon, authenticated;
grant execute on function public.api_open_bags(text, uuid) to anon;

drop function if exists public.api_pick_bag(text, uuid, int);       -- cơ chế chọn 1 bao đã bỏ
