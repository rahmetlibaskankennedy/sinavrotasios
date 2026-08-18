-- Production migration mirror: ilerleme eşzamanlı güncellemelerinde kayıp
-- yazmayı önlemek için sürüm numarası ve tetikleyici.
alter table public.profiles
  add column if not exists progress_version integer not null default 0;

create or replace function public.bump_progress_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.progress is distinct from old.progress then
    new.progress_version := old.progress_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_progress_version on public.profiles;
create trigger trg_bump_progress_version
before update on public.profiles
for each row execute function public.bump_progress_version();
