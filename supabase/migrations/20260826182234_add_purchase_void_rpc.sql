-- Google Play RTDN (Real-time Developer Notifications) üzerinden gelen
-- iade/iptal (voided purchase) bildirimlerini işlemek için RPC.
--
-- purchase_token ile ilgili satın almayı bulur, status'unu 'refunded' veya
-- 'revoked' yapar, ardından kullanıcının premium_until değerini o kullanıcının
-- KALAN geçerli ('verified') satın almalarına göre yeniden hesaplar (sadece
-- 0'a çekmek yerine, iptal edilen satın alma dışındaki geçerli süreyi korur).
create or replace function public.apply_purchase_void(
  p_purchase_token text,
  p_new_status text -- 'refunded' | 'revoked'
)
returns table(user_id uuid, new_premium_until timestamptz, found boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_purchase purchases%rowtype;
  v_new_until timestamptz;
begin
  if p_new_status not in ('refunded', 'revoked') then
    raise exception 'Geçersiz status: % (refunded veya revoked olmalı)', p_new_status;
  end if;

  select * into v_purchase from public.purchases where purchase_token = p_purchase_token for update;
  if not found then
    return query select null::uuid, null::timestamptz, false;
    return;
  end if;

  -- Zaten işlenmişse (idempotency) tekrar işleme
  if v_purchase.status != 'verified' then
    return query select v_purchase.user_id, null::timestamptz, true;
    return;
  end if;

  update public.purchases
  set status = p_new_status, updated_at = now()
  where purchase_token = p_purchase_token;

  -- Kalan geçerli satın almalara göre premium bitiş tarihini yeniden hesapla
  select max(granted_until) into v_new_until
  from public.purchases
  where user_id = v_purchase.user_id and status = 'verified';

  update public.profiles
  set is_premium = (v_new_until is not null and v_new_until > now()),
      premium_until = v_new_until
  where id = v_purchase.user_id;

  return query select v_purchase.user_id, v_new_until, true;
end;
$$;

revoke all on function public.apply_purchase_void(text, text) from public, anon, authenticated;
