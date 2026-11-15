-- 0075 geri alma: okudum onayı, etkinlikler, değişim onayı ve öneri kutusu kalkar (verileriyle birlikte).
update oda_degisim set durum = 'acik', alan = null where durum = 'onay';
create or replace function oda_degisim_al(p_id uuid) returns void language plpgsql volatile security definer set search_path = public as $$
declare d oda_degisim; ad text; ozet text;
begin
  if not oda_ogretmen('pano') then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into d from oda_degisim where id = p_id and school_id = my_school() for update;
  if d.id is null then raise exception 'Talep bulunamadı'; end if;
  if d.isteyen = auth.uid() then raise exception 'Kendi talebini üstlenemezsin'; end if;
  if d.durum <> 'acik' then raise exception 'Bu talep artık açık değil'; end if;
  if d.tarih < tr_today() then raise exception 'Talebin tarihi geçti'; end if;
  update oda_degisim set durum = 'alindi', alan = auth.uid() where id = p_id;
  select full_name into ad from profiles where id = auth.uid();
  ozet := to_char(d.tarih, 'DD.MM.YYYY') || ' ' || d.saat || coalesce(' · ' || d.sinif, '') || ' (' || case d.tur when 'ders' then 'ders' else 'nöbet' end || ')';
  insert into notifications (user_id, text, link, type)
  select u, coalesce(ad, 'Bir öğretmen') || ' değişim talebini üstlendi: ' || ozet, jsonb_build_object('page', 'ogretmenler-odasi', 'tab', 'pano'), 'oda'
  from (select d.isteyen u union select p.id from profiles p where p.school_id = d.school_id and p.status = 'approved' and has_role(p.id, 'admin')) x
  where u is not null and u <> auth.uid();
end $$;
create or replace function oda_pano_temizlik() returns void language sql security definer set search_path = public as $$
  delete from oda_pano where bitis < tr_today();
  delete from oda_anket where bitis < now() - interval '30 days';
  delete from oda_tesekkur where created_at < now() - interval '60 days';
  delete from oda_degisim where tarih < tr_today() - 30;
$$;
create or replace function oda_pano_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.yazan := auth.uid(); new.school_id := my_school(); new.created_at := now(); new.metin := btrim(new.metin);
  new.bitis := least(greatest(coalesce(new.bitis, tr_today() + 7), tr_today()), tr_today() + 30);
  return new;
end $$;
drop function if exists oda_oneri_gonder(text);
drop table if exists oda_oneri_sayac, oda_oneri;
drop function if exists oda_degisim_onayla(uuid, boolean);
alter table oda_degisim drop column if exists onaylayan;
alter table oda_degisim drop constraint oda_degisim_durum_check;
alter table oda_degisim add constraint oda_degisim_durum_check check (durum in ('acik', 'alindi', 'iptal'));
drop function if exists oda_etkinlik_katil(uuid, boolean);
drop table if exists oda_etkinlik_katilim, oda_etkinlik;
drop function if exists oda_etkinlik_damga();
drop function if exists oda_pano_onay_durum(uuid[]);
drop table if exists oda_pano_onay;
alter table oda_pano drop column if exists onay_iste;
drop function if exists oda_ogretmen_mi(uuid);
delete from school_settings where key in ('oda.degisim_onay', 'oda.oneri');
drop function setting_spec();
alter function setting_spec_before_0075() rename to setting_spec;
select ayar_varsayilan_yenile();
