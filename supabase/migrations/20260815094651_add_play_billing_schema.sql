begin;

-- Premium'un nereden verildiğini ayırt etmek için (admin panel vs Play Billing).
-- admin_set_premium zaten var olan bir RPC; bundan sonra 'manual' olarak işaretleyecek.
alter table public.profiles
  add column if not exists premium_source text not null default 'manual'
    check (premium_source in ('manual', 'play_billing'));

-- Play Console'da tanımlanacak "yönetilen ürün" (managed in-app product) kataloğu.
-- Tekrarlanmayan, süreli paketler: 1/2/3 ay. Fiyat burada tutulmuyor (Play Console
-- kaynak); yalnızca doğrulama sonrası kaç gün premium verileceği burada.
create table public.premium_products (
  product_id text primary key,       -- Play Console'daki managed product id ile birebir aynı olmalı
  title text not null,
  duration_days integer not null check (duration_days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.premium_products enable row level security;

create policy "premium_products_public_read" on public.premium_products
  for select to authenticated
  using (is_active);

create policy "premium_products_admin_write" on public.premium_products
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

insert into public.premium_products (product_id, title, duration_days) values
  ('premium_1ay', '1 Aylık Premium', 30),
  ('premium_2ay', '2 Aylık Premium', 60),
  ('premium_3ay', '3 Aylık Premium', 90);

-- Doğrulanan her Google Play satın alması burada iz bırakır. purchase_token
-- benzersizdir: aynı token'ın iki kez işlenmesini (replay/çift tıklama) engeller.
create table public.purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.premium_products(product_id),
  purchase_token text not null unique,
  order_id text,
  status text not null default 'verified' check (status in ('verified', 'refunded', 'revoked')),
  granted_until timestamptz not null,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchases enable row level security;

create policy "purchases_select_own_or_admin" on public.purchases
  for select to authenticated
  using (((select auth.uid()) = user_id) or (select public.is_admin()));

-- İstemciden doğrudan insert/update yok: yalnızca service-role (Edge Function) yazar.
create index purchases_user_id_idx on public.purchases(user_id);

alter function public.get_random_test_questions(text) owner to postgres; -- no-op guard, keep ownership consistent

-- Edge Function'ın (service-role ile) çağıracağı, doğrulanmış satın almayı
-- profiles'a işleyen fonksiyon. Idempotent: aynı token ikinci kez gelirse
-- (Play'in retry mekanizması) sessizce no-op döner.
create or replace function public.apply_verified_purchase(
  p_user_id uuid,
  p_product_id text,
  p_purchase_token text,
  p_order_id text,
  p_raw_response jsonb default null
)
returns table(granted_until timestamptz, already_applied boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duration integer;
  v_current_until timestamptz;
  v_new_until timestamptz;
  v_existing purchases%rowtype;
begin
  select * into v_existing from public.purchases where purchase_token = p_purchase_token;
  if found then
    return query select v_existing.granted_until, true;
    return;
  end if;

  select duration_days into v_duration
  from public.premium_products
  where product_id = p_product_id and is_active;
  if v_duration is null then
    raise exception 'Geçersiz veya pasif ürün: %', p_product_id;
  end if;

  select premium_until into v_current_until
  from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Kullanıcı profili bulunamadı (id: %)', p_user_id;
  end if;

  -- Aynı kullanıcı süresi dolmadan yeni paket alırsa, süre üstüne eklenir
  -- (kalan süre kaybolmaz); süre dolmuşsa/yoksa bugünden başlar.
  v_new_until := greatest(coalesce(v_current_until, now()), now()) + make_interval(days => v_duration);

  update public.profiles
  set is_premium = true,
      premium_until = v_new_until,
      premium_source = 'play_billing'
  where id = p_user_id;

  insert into public.purchases (user_id, product_id, purchase_token, order_id, granted_until, raw_response)
  values (p_user_id, p_product_id, p_purchase_token, p_order_id, v_new_until, p_raw_response);

  return query select v_new_until, false;
end;
$$;

revoke all on function public.apply_verified_purchase(uuid, text, text, text, jsonb) from public, anon, authenticated;
-- Yalnızca service-role (Edge Function) çağırır; authenticated'e EXECUTE verilmez.

-- admin_set_premium artık kaynağı 'manual' olarak işaretlesin.
create or replace function public.admin_set_premium(p_user_id uuid, p_is_premium boolean, p_premium_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Yetkisiz işlem'; end if;
  update public.profiles
  set is_premium = p_is_premium,
      premium_until = case when p_is_premium then p_premium_until else null end,
      premium_source = 'manual'
  where id = p_user_id;
  if not found then raise exception 'Kullanıcı profili bulunamadı (id: %)', p_user_id; end if;
end;
$$;

commit;
