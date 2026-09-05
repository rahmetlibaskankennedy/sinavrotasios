-- Rastgele Test cevap sızıntısı düzeltmesi: get_random_test_questions artık
-- tam questions satırını (answer_index, explanation dahil) istemciye
-- döndürüyordu; ağ sekmesinden quiz'e hiç girmeden doğru cevaplar
-- görülebiliyordu. Bu migration bunu iki adıma bölüyor:
--   1) start_random_test: soruları answer_index/explanation OLMADAN döner,
--      seçilen soru kimliklerini quiz_sessions'a kaydeder.
--   2) reveal_quiz_session: sadece o oturumun sahibi, sadece o oturumdaki
--      soruların answer_index/explanation'ını, quiz bitince tek seferde
--      açar.
-- get_random_test_questions kaldırıldı — istemci artık bu ikisini kullanıyor.

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  root_topic_id text not null,
  question_ids text[] not null,
  revealed boolean not null default false,
  revealed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.quiz_sessions enable row level security;

drop policy if exists quiz_sessions_owner_select on public.quiz_sessions;
create policy quiz_sessions_owner_select on public.quiz_sessions
  for select using (user_id = auth.uid());

revoke all on public.quiz_sessions from public, anon, authenticated;
grant select on public.quiz_sessions to authenticated;

drop function if exists public.get_random_test_questions(text);

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
    v_limit := 20;
  else
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

create or replace function public.reveal_quiz_session(p_session_id uuid)
returns table(id text, answer_index int, explanation text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids text[];
begin
  select question_ids into v_ids
  from public.quiz_sessions
  where quiz_sessions.id = p_session_id and user_id = auth.uid()
  for update;

  if v_ids is null then
    raise exception 'SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.quiz_sessions
  set revealed = true, revealed_at = now()
  where quiz_sessions.id = p_session_id;

  return query
    select q.id, q.answer_index, q.explanation
    from public.questions q
    where q.id = any(v_ids);
end;
$$;

revoke all on function public.reveal_quiz_session(uuid) from public;
grant execute on function public.reveal_quiz_session(uuid) to authenticated;
