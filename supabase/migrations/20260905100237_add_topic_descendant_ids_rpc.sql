-- Bu migration CANLIYA ZATEN UYGULANDI (Supabase MCP ile, 2026-09-05).
-- Bu dosya sadece repo geçmişini production ile senkron tutmak için eklendi.
--
-- Kadro Bazli Gercek Sinav (buildKadroExamPool/loadExamTopicBank) icerik
-- eksikligi duzeltmesi: bazi konularin (T.C. Anayasasi, 657 sayili Kanun,
-- 5442, 4734, 4735, Ataturk Ilkeleri ve Inkilap Tarihi) TUM sorulari alt
-- bolumlere etiketli - ana konunun kendisinde neredeyse hic soru yok.
-- loadExamTopicBank bilerek alt konulara inmiyordu (2026-08-15: ayni sorunun
-- iki kez secilmesini onlemek icin - alt konu AYRI bir blueprint satiri
-- olarak da varsa). Dogruladim: bu 6 konunun hicbir alt bolumu, hicbir
-- kadronun blueprint'inde ayri bir satir olarak GECMIYOR - yani bunlar icin
-- alt bolumlere inmek tamamen guvenli. Bu RPC, istemcinin (buildKadroExamPool)
-- "alt bolumlere in ama blueprint'te ayrica gecen konulari haric tut" mantigini
-- kurabilmesi icin sadece descendant id listesini doner; disleme/secim mantigi
-- istemcide kalir (app.js zaten flatEntries'i biliyor).
create or replace function public.get_topic_descendant_ids(p_root_topic_id text)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive descendants as (
    select t.id from public.topics t where t.id = p_root_topic_id
    union all
    select t2.id from public.topics t2 join descendants d on t2.parent_id = d.id
  )
  select array_agg(d.id) from descendants d;
$$;

revoke all on function public.get_topic_descendant_ids(text) from public;
grant execute on function public.get_topic_descendant_ids(text) to authenticated;
