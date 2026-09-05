-- Bu migration CANLIYA ZATEN UYGULANDI (Supabase MCP ile, 2026-09-05).
-- Bu dosya sadece repo geçmişini production ile senkron tutmak için eklendi.
--
-- start_random_test'in RETURNS TABLE(..., id text, topic_id text, ...) imzasi,
-- 'id' ve 'topic_id'i fonksiyon govdesinde PL/pgSQL degiskeni olarak
-- gorunur kiliyor. Govde icindeki tum niteliksiz 'id'/'topic_id' referanslari
-- (topics, topic_free_attempts, descendants CTE) bu OUT parametreleriyle
-- catisip "column reference is ambiguous" hatasi veriyordu - canlida her
-- "Rastgele Test" denemesinde. Duzeltme: her tablo/CTE takma adla nitelendi.
create or replace function public.start_random_test(p_root_topic_id text)
returns table(session_id uuid, id text, topic_id text, prompt text, options jsonb, sort_order int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used int;
  v_topic_ids text[];
  v_ids text[];
  v_limit int;
  v_session_id uuid;
begin
  if p_root_topic_id is null or not exists (
    select 1 from public.topics t
    where t.id = p_root_topic_id and t.parent_id is null
  ) then
    raise exception 'INVALID_TOPIC' using errcode = 'P0001';
  end if;

  with recursive descendants as (
    select t.id from public.topics t where t.id = p_root_topic_id
    union all
    select t2.id from public.topics t2 join descendants d on t2.parent_id = d.id
  )
  select array_agg(d2.id) into v_topic_ids from descendants d2;

  if public.is_premium() then
    v_limit := 20;
  else
    select tfa.attempts_used into v_used
    from public.topic_free_attempts tfa
    where tfa.user_id = auth.uid() and tfa.topic_id = p_root_topic_id
    for update;

    if v_used is null then
      insert into public.topic_free_attempts (user_id, topic_id, attempts_used)
      values (auth.uid(), p_root_topic_id, 1);
    elsif v_used >= 2 then
      raise exception 'FREE_LIMIT_REACHED' using errcode = 'P0001';
    else
      update public.topic_free_attempts tfa2
      set attempts_used = tfa2.attempts_used + 1, updated_at = now()
      where tfa2.user_id = auth.uid() and tfa2.topic_id = p_root_topic_id;
    end if;

    v_limit := 10;
  end if;

  select array_agg(q.id) into v_ids
  from (
    select qq.id from public.questions qq
    where qq.topic_id = any(v_topic_ids)
    order by random()
    limit v_limit
  ) q;

  if v_ids is null or array_length(v_ids, 1) is null then
    return;
  end if;

  insert into public.quiz_sessions (user_id, root_topic_id, question_ids)
  values (auth.uid(), p_root_topic_id, v_ids)
  returning quiz_sessions.id into v_session_id;

  return query
    select v_session_id, q.id, q.topic_id, q.prompt, q.options, q.sort_order
    from public.questions q
    where q.id = any(v_ids);
end;
$$;

revoke all on function public.start_random_test(text) from public;
grant execute on function public.start_random_test(text) to authenticated;
