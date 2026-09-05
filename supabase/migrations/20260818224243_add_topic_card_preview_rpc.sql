-- Kartlar ekranında, soru bankasından türetilen kartlar için de Genel
-- Mevzuat'taki flashcard destelerindeki "ilk 5 kart ücretsiz" davranışını
-- standart hale getirir. questions tablosunun RLS'ini (questions_premium_read)
-- gevşetmek yerine — o tabloyu gevşetmek section/random quiz gibi başka
-- yerlerde de cevap sızıntısına yol açabilir — bu güvenli, kapsüllü RPC
-- üzerinden en fazla 5 satır döndürülüyor. get_flashcard_count ile aynı
-- SECURITY DEFINER deseni: gerçek toplam sayı premium durumundan bağımsız
-- hesaplanır (upsell mesajı doğru göstersin diye), ama satırların kendisi
-- ücretsiz kullanıcı için 5 ile sınırlı.
create or replace function public.get_topic_card_preview(p_topic_ids text[])
returns table(prompt text, options jsonb, answer_index int, total_count int)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      q.prompt,
      q.options,
      q.answer_index,
      q.sort_order,
      count(*) over () as total_count
    from questions q
    where q.topic_id = any(p_topic_ids)
  )
  select prompt, options, answer_index, total_count
  from base
  where is_admin() or is_premium() or sort_order <= 5
  order by sort_order;
$$;

grant execute on function public.get_topic_card_preview(text[]) to authenticated;
