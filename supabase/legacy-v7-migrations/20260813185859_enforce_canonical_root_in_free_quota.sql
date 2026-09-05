-- Production migration mirror: ücretsiz rastgele test kotası tek ve kanonik
-- kök konu kimliğinden türetilir; istemci konu ile sayaç anahtarını ayıramaz.
drop function if exists public.get_random_test_questions(text[], text);

create or replace function public.get_random_test_questions(p_root_topic_id text)
returns setof public.questions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used int;
  v_topic_ids text[];
begin
  if p_root_topic_id is null or not exists (
    select 1 from public.topics
    where id = p_root_topic_id and parent_id is null
  ) then
    raise exception 'INVALID_TOPIC' using errcode = 'P0001';
  end if;

  with recursive descendants as (
    select id from public.topics where id = p_root_topic_id
    union all
    select t.id from public.topics t join descendants d on t.parent_id = d.id
  )
  select array_agg(id) into v_topic_ids from descendants;

  if public.is_premium() then
    return query select * from public.questions where topic_id = any(v_topic_ids) order by random() limit 20;
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

  return query select * from public.questions where topic_id = any(v_topic_ids) order by random() limit 10;
end;
$$;

revoke all on function public.get_random_test_questions(text) from public;
grant execute on function public.get_random_test_questions(text) to authenticated;
