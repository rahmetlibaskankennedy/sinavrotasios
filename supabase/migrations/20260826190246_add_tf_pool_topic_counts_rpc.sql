-- Admin panelindeki D/Y Havuzu (tf_pool) konu ağacındaki rozet sayıları,
-- önceden client tarafında `select('topic_id')` ile TÜM satırları çekip
-- JS'te sayarak hesaplanıyordu. tf_pool 1000 satırı (PostgREST'in varsayılan
-- satır limiti) geçince bu sorgu sessizce kesiliyor, sayımlar yanlış çıkıyordu
-- (ör. Protokol Kuralları'nda 264 kayıt varken rozette "1" görünmesi).
-- Bu RPC, sayımı veritabanı tarafında GROUP BY ile yapar; satır limitinden
-- etkilenmez ve konu sayısı/toplam soru sayısı ne kadar büyürse büyüsün doğru
-- kalır.
create or replace function public.get_tf_pool_topic_counts()
returns table(topic_id text, count bigint)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select topic_id, count(*) as count
  from public.tf_pool
  where topic_id is not null
  group by topic_id;
$$;

revoke all on function public.get_tf_pool_topic_counts() from public;
grant execute on function public.get_tf_pool_topic_counts() to authenticated;
