-- Öğretmenler Odası sohbeti: mesajı yanıtlama, sabitleme ve okundu bilgisi. (Arama istemcide, mevcut okuma kuralıyla çalışır.)
-- 1) Yanıt: oda_mesaj.yanit_id aynı kanaldaki bir mesajı gösterir; asıl mesaj silinirse yanıt kalır, alıntı düşer.
-- 2) Sabitleme: yönetici ve rehber öğretmen bir kanalda en çok 3 mesajı üste sabitler. Sabit mesaj saklama süresi dolsa da
--    silinmez; sabit kaldırılınca olağan süreye döner.
-- 3) Okundu bilgisi: mesajı yazan ve yönetim, kanalı görebilen öğretmenlerden kaçının o mesajdan sonra kanalı açtığını görür;
--    okumayanların adını yalnız yönetim görür. Öğretmenler birbirinin okuma anını göremez (oda_okundu kuralı değişmedi).
-- Geri alma: supabase/geri-alma/0074_oda_sohbet_yanit_sabit_geri_al.sql

alter table oda_mesaj
  add column yanit_id uuid references oda_mesaj(id) on delete set null,
  add column sabit_at timestamptz,
  add column sabitleyen uuid references profiles(id) on delete set null;
create index oda_mesaj_sabit on oda_mesaj (school_id, kanal) where sabit_at is not null;
create index oda_mesaj_yanit on oda_mesaj (yanit_id) where yanit_id is not null;

create or replace function oda_mesaj_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.yazan := auth.uid();
  new.school_id := my_school();
  new.created_at := now();
  new.metin := btrim(new.metin);
  new.anilan := coalesce(array(select distinct x from unnest(new.anilan) x where x is not null and x <> auth.uid() limit 20), '{}');
  -- Sabitleme yalnız oda_mesaj_sabitle ile; yanıt aynı kanaldaki bir mesaja olmalı
  new.sabit_at := null;
  new.sabitleyen := null;
  if new.yanit_id is not null and not exists (
    select 1 from oda_mesaj y where y.id = new.yanit_id and y.school_id = new.school_id and y.kanal = new.kanal) then
    new.yanit_id := null;
  end if;
  return new;
end $$;

create function oda_mesaj_sabitle(p_id uuid, p_sabit boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare m oda_mesaj;
begin
  if not (is_staff() and oda_bolum_acik('sohbet')) then
    raise exception 'Mesajı yalnız yönetici ve rehber öğretmen sabitleyebilir.' using errcode = '42501';
  end if;
  select * into m from oda_mesaj where id = p_id and school_id = my_school() and kanal = any(oda_kanallari()) for update;
  if m.id is null then raise exception 'Mesaj bulunamadı.'; end if;
  if coalesce(p_sabit, false) then
    if m.sabit_at is null and (select count(*) from oda_mesaj x where x.school_id = m.school_id and x.kanal = m.kanal and x.sabit_at is not null) >= 3 then
      raise exception 'Bir kanalda en çok 3 mesaj sabitlenebilir; önce birini kaldır.';
    end if;
    update oda_mesaj set sabit_at = coalesce(sabit_at, now()), sabitleyen = auth.uid() where id = m.id;
  else
    update oda_mesaj set sabit_at = null, sabitleyen = null where id = m.id;
  end if;
end $$;
revoke all on function oda_mesaj_sabitle(uuid, boolean) from public, anon;
grant execute on function oda_mesaj_sabitle(uuid, boolean) to authenticated;

-- Kanalı görebilen öğretmenlerden (yazan hariç) kaçı bu mesajdan sonra kanalı açtı
create function oda_okundu_bilgisi(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m oda_mesaj; r jsonb;
begin
  select * into m from oda_mesaj where id = p_id and school_id = my_school() and kanal = any(oda_kanallari());
  if m.id is null then raise exception 'Mesaj bulunamadı.'; end if;
  if not (m.yazan = auth.uid() or is_staff()) then
    raise exception 'Okundu bilgisini mesajı yazan ve yönetim görebilir.' using errcode = '42501';
  end if;
  with uye as (
    select p.id, p.full_name,
           exists (select 1 from oda_okundu o where o.user_id = p.id and o.kanal = m.kanal and o.zaman >= m.created_at) as okudu
    from profiles p
    where p.school_id = m.school_id and p.status = 'approved' and p.id is distinct from m.yazan and m.kanal = any(oda_kanallari_of(p.id))
  )
  select jsonb_build_object(
    'okuyan', count(*) filter (where okudu),
    'toplam', count(*),
    'okumayanlar', case when is_staff() then coalesce(jsonb_agg(full_name order by full_name) filter (where not okudu), '[]') end)
  into r from uye;
  return r;
end $$;
revoke all on function oda_okundu_bilgisi(uuid) from public, anon;
grant execute on function oda_okundu_bilgisi(uuid) to authenticated;

-- Sabit mesaj saklama süresiyle silinmez
create or replace function oda_temizlik() returns void language sql security definer set search_path = public as $$
  delete from oda_mesaj m
  where m.created_at < now() - make_interval(days => greatest(7, least(365, coalesce((school_setting(m.school_id, 'oda.saklama_gun'))::text::int, 30))))
    and m.sabit_at is null;
$$;
