-- ---------- Fix: get_random_test_questions() ücretsiz hak aşımı ------------
-- Eski tasarımda iki ayrı parametre vardı: p_topic_ids (hangi sorular
-- dönecek) ve p_topic_key (hak sayacının hangi anahtarla tutulacağı).
-- İkisi birbirine bağlı değildi -- istemci p_topic_ids'i sabit tutup her
-- çağrıda farklı/rastgele bir p_topic_key göndererek 2 deneme limitini hiç
-- doldurmadan konunun tamamını (cevaplarıyla) art arda çekebiliyordu.
--
-- Yeni tasarımda tek parametre var: p_root_topic_id. Hem soru sorgusunda
-- kullanılacak alt-konu id listesi hem de hak sayacının anahtarı bu TEK
-- id'den, sunucu tarafında (recursive CTE ile) türetiliyor. İstemcinin
-- "hangi konu sayılsın" ile "hangi sorular dönsün" seçimlerini birbirinden
-- ayırabileceği bir alan artık yok.

drop function if exists public.get_random_test_questions(text[], text);

create or replace function public.get_random_test_questions(p_root_topic_id text)
returns setof public.questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
  v_topic_ids text[];
begin
  -- N-01 fix: yalnızca kök konular (parent_id is null) parametre olarak
  -- kabul edilir. Alt-konu id'si gönderilirse, o id'nin farklı bir parent
  -- zincirindeki kota sayacını tüketmek için kullanılması engellenir.
  if p_root_topic_id is null or not exists (
    select 1 from public.topics
    where id = p_root_topic_id
      and parent_id is null   -- yalnızca kök konu kabul et
  ) then
    raise exception 'INVALID_TOPIC' using errcode = 'P0001';
  end if;

  -- Alt konu id'leri artık istemciden gelmiyor; kökten sunucuda hesaplanıyor.
  with recursive descendants as (
    select id from public.topics where id = p_root_topic_id
    union all
    select t.id from public.topics t
    join descendants d on t.parent_id = d.id
  )
  select array_agg(id) into v_topic_ids from descendants;

  if public.is_premium() then
    return query
      select * from public.questions
      where topic_id = any(v_topic_ids)
      order by random()
      limit 20;
    return;
  end if;

  select attempts_used into v_used
  from public.topic_free_attempts
  where user_id = auth.uid() and topic_id = p_root_topic_id
  for update;

  if v_used is null then
    insert into public.topic_free_attempts (user_id, topic_id, attempts_used)
    values (auth.uid(), p_root_topic_id, 1);
  elsif v_used >= 2 then
    raise exception 'FREE_LIMIT_REACHED' using errcode = 'P0001';
  else
    update public.topic_free_attempts
    set attempts_used = attempts_used + 1, updated_at = now()
    where user_id = auth.uid() and topic_id = p_root_topic_id;
  end if;

  return query
    select * from public.questions
    where topic_id = any(v_topic_ids)
    order by random()
    limit 10;
end;
$$;

comment on function public.get_random_test_questions(text) is
  'Rastgele test: alt konu id''leri VE ücretsiz hak sayacı anahtarı, tek parametre olan p_root_topic_id''den sunucuda türetiliyor -- istemci ikisini artık birbirinden ayıramaz. p_root_topic_id yalnızca kök konu (parent_id IS NULL) olabilir (N-01 fix).';

revoke all on function public.get_random_test_questions(text) from public;
grant execute on function public.get_random_test_questions(text) to authenticated;
