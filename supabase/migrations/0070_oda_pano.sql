-- Öğretmenler Odası (3/3): Pano (yapışkan notlar), Hızlı anket, Teşekkür kartı, Ders/nöbet değişimi, doğum günü (isteğe bağlı).
-- Yalnız öğretmenler (is_teacher) okur ve yazar; veli ve öğrenci hiçbir satırı göremez. Süresi geçenler her gece silinir.
-- Yalnız ekleme. Geri alma: supabase/geri-alma/0070_oda_pano_geri_al.sql

-- ---------- Pano: yapışkan notlar (en çok 30 gün) ----------
create table oda_pano (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  yazan uuid references profiles(id) on delete cascade,
  metin text not null check (char_length(btrim(metin)) between 1 and 400),
  renk text not null default 'sari' check (renk in ('sari', 'mavi', 'yesil', 'pembe')),
  bitis date not null default (tr_today() + 7),
  created_at timestamptz not null default now()
);
create index oda_pano_okul on oda_pano (school_id, bitis);
create function oda_pano_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.yazan := auth.uid(); new.school_id := my_school(); new.created_at := now(); new.metin := btrim(new.metin);
  new.bitis := least(greatest(coalesce(new.bitis, tr_today() + 7), tr_today()), tr_today() + 30);
  return new;
end $$;
create trigger oda_pano_damga before insert on oda_pano for each row execute function oda_pano_damga();
alter table oda_pano enable row level security;
create policy oda_pano_oku on oda_pano for select to authenticated using (school_id = my_school() and is_teacher() and bitis >= tr_today());
create policy oda_pano_yaz on oda_pano for insert to authenticated with check (school_id = my_school() and is_teacher() and yazan = auth.uid());
create policy oda_pano_sil on oda_pano for delete to authenticated using (school_id = my_school() and is_teacher() and (yazan = auth.uid() or is_staff()));
revoke all on oda_pano from anon;
grant select, insert, delete on oda_pano to authenticated;

-- ---------- Hızlı anket (en çok 14 gün açık; oylar gizli, yalnız sayılar görünür) ----------
create table oda_anket (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  soran uuid references profiles(id) on delete cascade,
  soru text not null check (char_length(btrim(soru)) between 3 and 200),
  secenekler text[] not null check (array_length(secenekler, 1) between 2 and 6),
  bitis timestamptz not null default (now() + interval '3 days'),
  created_at timestamptz not null default now()
);
create index oda_anket_okul on oda_anket (school_id, created_at desc);
create function oda_anket_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.soran := auth.uid(); new.school_id := my_school(); new.created_at := now(); new.soru := btrim(new.soru);
  new.secenekler := array(select left(btrim(x), 80) from unnest(new.secenekler) x where btrim(x) <> '');
  if coalesce(array_length(new.secenekler, 1), 0) < 2 then raise exception 'En az iki seçenek yaz'; end if;
  new.bitis := least(greatest(coalesce(new.bitis, now() + interval '3 days'), now() + interval '1 hour'), now() + interval '14 days');
  return new;
end $$;
create trigger oda_anket_damga before insert on oda_anket for each row execute function oda_anket_damga();
alter table oda_anket enable row level security;
create policy oda_anket_oku on oda_anket for select to authenticated using (school_id = my_school() and is_teacher());
create policy oda_anket_yaz on oda_anket for insert to authenticated with check (school_id = my_school() and is_teacher() and soran = auth.uid());
create policy oda_anket_sil on oda_anket for delete to authenticated using (school_id = my_school() and is_teacher() and (soran = auth.uid() or is_staff()));
revoke all on oda_anket from anon;
grant select, insert, delete on oda_anket to authenticated;

create table oda_anket_oy (
  anket_id uuid not null references oda_anket(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  secim int not null check (secim between 0 and 5),
  primary key (anket_id, user_id)
);
alter table oda_anket_oy enable row level security;
-- Kişi yalnız kendi oyunu görür; sayılar oda_anket_sonuc ile
create policy oda_anket_oy_kendi on oda_anket_oy for select to authenticated using (user_id = auth.uid());
revoke all on oda_anket_oy from anon, authenticated;
grant select on oda_anket_oy to authenticated;

-- Oy ver ya da değiştir (anket açıkken); null = oyu geri al
create function oda_anket_oyla(p_anket uuid, p_secim int) returns void language plpgsql volatile security definer set search_path = public as $$
declare a oda_anket;
begin
  if not is_teacher() then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into a from oda_anket where id = p_anket and school_id = my_school();
  if a.id is null then raise exception 'Anket bulunamadı'; end if;
  if a.bitis < now() then raise exception 'Anket kapandı'; end if;
  if p_secim is null then delete from oda_anket_oy where anket_id = p_anket and user_id = auth.uid(); return; end if;
  if p_secim < 0 or p_secim >= array_length(a.secenekler, 1) then raise exception 'Geçersiz seçenek'; end if;
  insert into oda_anket_oy (anket_id, user_id, secim) values (p_anket, auth.uid(), p_secim)
    on conflict (anket_id, user_id) do update set secim = excluded.secim;
end $$;

create function oda_anket_sonuc(p_anketler uuid[]) returns table (anket_id uuid, secim int, sayi int)
language sql stable security definer set search_path = public as $$
  select o.anket_id, o.secim, count(*)::int from oda_anket_oy o join oda_anket a on a.id = o.anket_id
  where is_teacher() and a.school_id = my_school() and o.anket_id = any(p_anketler[1:100])
  group by 1, 2
$$;

-- ---------- Teşekkür kartı ----------
create table oda_tesekkur (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  gonderen uuid references profiles(id) on delete cascade,
  alan uuid not null references profiles(id) on delete cascade,
  metin text not null check (char_length(btrim(metin)) between 3 and 300),
  created_at timestamptz not null default now()
);
create index oda_tesekkur_okul on oda_tesekkur (school_id, created_at desc);
create function oda_tesekkur_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.gonderen := auth.uid(); new.school_id := my_school(); new.created_at := now(); new.metin := btrim(new.metin);
  if new.alan = auth.uid() then raise exception 'Kendine teşekkür kartı gönderemezsin'; end if;
  if not exists (select 1 from profiles p where p.id = new.alan and p.school_id = new.school_id and p.status = 'approved'
                 and (has_role(p.id, 'ogretmen') or has_role(p.id, 'admin'))) then
    raise exception 'Öğretmen bulunamadı';
  end if;
  return new;
end $$;
create trigger oda_tesekkur_damga before insert on oda_tesekkur for each row execute function oda_tesekkur_damga();
create function oda_tesekkur_bildir() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, text, link, type)
  select new.alan, coalesce(p.full_name, 'Bir öğretmen') || ' sana teşekkür kartı gönderdi: ' || left(new.metin, 120),
         jsonb_build_object('page', 'ogretmenler-odasi', 'tab', 'pano'), 'oda'
  from profiles p where p.id = new.gonderen;
  return null;
end $$;
create trigger oda_tesekkur_bildir after insert on oda_tesekkur for each row execute function oda_tesekkur_bildir();
alter table oda_tesekkur enable row level security;
create policy oda_tesekkur_oku on oda_tesekkur for select to authenticated using (school_id = my_school() and is_teacher());
create policy oda_tesekkur_yaz on oda_tesekkur for insert to authenticated with check (school_id = my_school() and is_teacher() and gonderen = auth.uid());
create policy oda_tesekkur_sil on oda_tesekkur for delete to authenticated using (school_id = my_school() and is_teacher() and (gonderen = auth.uid() or is_staff()));
revoke all on oda_tesekkur from anon;
grant select, insert, delete on oda_tesekkur to authenticated;

-- Alkış (kart başına kişi başı bir); "Haftanın teşekkürü" en çok alkış alan
create table oda_tesekkur_alkis (
  tesekkur_id uuid not null references oda_tesekkur(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (tesekkur_id, user_id)
);
alter table oda_tesekkur_alkis enable row level security;
create policy oda_alkis_oku on oda_tesekkur_alkis for select to authenticated using (exists (select 1 from oda_tesekkur t where t.id = tesekkur_id));
create policy oda_alkis_yaz on oda_tesekkur_alkis for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from oda_tesekkur t where t.id = tesekkur_id));
create policy oda_alkis_sil on oda_tesekkur_alkis for delete to authenticated using (user_id = auth.uid());
revoke all on oda_tesekkur_alkis from anon;
grant select, insert, delete on oda_tesekkur_alkis to authenticated;

-- ---------- Ders / nöbet değişimi ----------
create table oda_degisim (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  isteyen uuid references profiles(id) on delete cascade,
  tur text not null check (tur in ('ders', 'nobet')),
  tarih date not null,
  saat text not null check (char_length(btrim(saat)) between 1 and 40),
  sinif text check (sinif is null or char_length(sinif) <= 40),
  aciklama text check (aciklama is null or char_length(aciklama) <= 300),
  durum text not null default 'acik' check (durum in ('acik', 'alindi', 'iptal')),
  alan uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index oda_degisim_okul on oda_degisim (school_id, tarih);
create function oda_degisim_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.isteyen := auth.uid(); new.school_id := my_school(); new.created_at := now();
  new.durum := 'acik'; new.alan := null; new.saat := btrim(new.saat);
  if new.tarih < tr_today() or new.tarih > tr_today() + 60 then raise exception 'Tarih bugünden itibaren 60 gün içinde olmalı'; end if;
  return new;
end $$;
create trigger oda_degisim_damga before insert on oda_degisim for each row execute function oda_degisim_damga();
alter table oda_degisim enable row level security;
create policy oda_degisim_oku on oda_degisim for select to authenticated using (school_id = my_school() and is_teacher());
create policy oda_degisim_yaz on oda_degisim for insert to authenticated with check (school_id = my_school() and is_teacher() and isteyen = auth.uid());
revoke all on oda_degisim from anon;
grant select, insert on oda_degisim to authenticated;

-- "Ben girerim": açık talebi üstlen; isteyene ve yöneticilere bildirim
create function oda_degisim_al(p_id uuid) returns void language plpgsql volatile security definer set search_path = public as $$
declare d oda_degisim; ad text; ozet text;
begin
  if not is_teacher() then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
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

create function oda_degisim_iptal(p_id uuid) returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_teacher() then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  update oda_degisim set durum = 'iptal' where id = p_id and school_id = my_school() and (isteyen = auth.uid() or is_staff()) and durum <> 'iptal';
  if not found then raise exception 'Talep iptal edilemedi'; end if;
end $$;

-- ---------- Doğum günü (isteğe bağlı; yalnız ay ve gün) ----------
create table oda_dogum_gunu (
  user_id uuid primary key references profiles(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  ay int not null check (ay between 1 and 12),
  gun int not null check (gun between 1 and 31),
  goster boolean not null default true
);
create function oda_dogum_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin new.user_id := auth.uid(); new.school_id := my_school(); return new; end $$;
create trigger oda_dogum_damga before insert or update on oda_dogum_gunu for each row execute function oda_dogum_damga();
alter table oda_dogum_gunu enable row level security;
create policy oda_dogum_oku on oda_dogum_gunu for select to authenticated using (school_id = my_school() and is_teacher() and (goster or user_id = auth.uid()));
create policy oda_dogum_yaz on oda_dogum_gunu for insert to authenticated with check (user_id = auth.uid() and is_teacher());
create policy oda_dogum_guncelle on oda_dogum_gunu for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy oda_dogum_sil on oda_dogum_gunu for delete to authenticated using (user_id = auth.uid());
revoke all on oda_dogum_gunu from anon;
grant select, insert, update, delete on oda_dogum_gunu to authenticated;

-- ---------- Gece temizliği: süresi geçen pano notları, 30 günü geçen anket/teşekkür/değişim ----------
create function oda_pano_temizlik() returns void language sql security definer set search_path = public as $$
  delete from oda_pano where bitis < tr_today();
  delete from oda_anket where bitis < now() - interval '30 days';
  delete from oda_tesekkur where created_at < now() - interval '60 days';
  delete from oda_degisim where tarih < tr_today() - 30;
$$;
revoke all on function oda_pano_temizlik() from public, anon, authenticated;
select cron.schedule('oda-pano-temizlik', '25 3 * * *', $$select public.oda_pano_temizlik()$$);

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table oda_pano, oda_anket, oda_tesekkur, oda_degisim;
  end if;
end $$;

revoke all on function oda_pano_damga(), oda_anket_damga(), oda_tesekkur_damga(), oda_tesekkur_bildir(), oda_degisim_damga(), oda_dogum_damga() from public, anon, authenticated;
revoke all on function oda_anket_oyla(uuid, int), oda_anket_sonuc(uuid[]), oda_degisim_al(uuid), oda_degisim_iptal(uuid) from public, anon;
grant execute on function oda_anket_oyla(uuid, int), oda_anket_sonuc(uuid[]), oda_degisim_al(uuid), oda_degisim_iptal(uuid) to authenticated;
