-- Öğretmenler Odası (1/3): öğretmenlerin kendi aralarındaki canlı sohbet ve Öğrenci Takip için devamsızlık özeti.
-- Kimler: yönetici, rehberlik ve öğretmenler (is_teacher). Veli ve öğrenci hiçbir satırı okuyamaz.
-- Kanallar: "genel" (okulun bütün öğretmenleri), kademe kanalları ("ortaokul", "lise", "ilkokul": o kademede sınıfı olan
-- öğretmenler; rehberlik/yönetici hepsi) ve zümre kanalları ("zumre:Matematik": o branştaki öğretmenler; yönetici hepsi).
-- Mesajlar 30 gün saklanır: her gece 30 günü geçenler silinir (oda-temizlik). Mesaj düzeltilmez; yazan ya da rehberlik/yönetici siler.
-- Yalnız ekleme: mevcut tablo, ayar ve veriler değişmez. Geri alma: supabase/geri-alma/0068_ogretmenler_odasi_geri_al.sql

-- ---------- Erişilebilen kanallar ----------
create function oda_kanallari_of(uid uuid) returns text[]
language sql stable security definer set search_path = public as $$
  with p as (
    select pr.id, pr.school_id, pr.branch,
           has_role(pr.id, 'admin') as yonetici,
           has_role(pr.id, 'admin') or (has_role(pr.id, 'ogretmen') and pr.branch = 'Rehberlik') as tam,
           has_role(pr.id, 'admin') or has_role(pr.id, 'ogretmen') as ogretmen
    from profiles pr where pr.id = uid and pr.status = 'approved'
  )
  select case when not p.ogretmen then '{}'::text[] else array(
    select 'genel'
    union
    select distinct c.level::text from classes c
     where c.school_id = p.school_id and c.level is not null
       and (p.tam or c.id in (select teacher_classes(p.id)))
    union
    select 'zumre:' || p.branch where p.branch is not null and p.branch <> ''
    union
    select distinct 'zumre:' || o.branch from profiles o
     where p.yonetici and o.school_id = p.school_id and o.status = 'approved' and o.branch is not null and o.branch <> ''
       and has_role(o.id, 'ogretmen')
  ) end
  from p
$$;
revoke all on function oda_kanallari_of(uuid) from public, anon, authenticated;

-- Oturumdaki kişinin kanalları (kurallarda "kanal in (select unnest(oda_kanallari()))": sorgu başına bir kez hesaplanır)
create function oda_kanallari() returns text[]
language sql stable security definer set search_path = public as $$
  select case when my_school() is not null and is_teacher() then oda_kanallari_of(auth.uid()) else '{}'::text[] end
$$;
revoke all on function oda_kanallari() from public, anon;
grant execute on function oda_kanallari() to authenticated;

-- ---------- Mesajlar ----------
create table oda_mesaj (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  kanal text not null check (kanal ~ '^(genel|ilkokul|ortaokul|lise|zumre:.{1,60})$'),
  yazan uuid references profiles(id) on delete cascade,
  metin text not null check (char_length(btrim(metin)) between 1 and 2000),
  -- Anılan öğretmenler (@): bildirim gider; yalnız kanalı görebilenlere
  anilan uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index oda_mesaj_kanal on oda_mesaj (school_id, kanal, created_at desc);
create index oda_mesaj_eski on oda_mesaj (created_at);

create function oda_mesaj_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.yazan := auth.uid();
  new.school_id := my_school();
  new.created_at := now();
  new.metin := btrim(new.metin);
  new.anilan := coalesce(array(select distinct x from unnest(new.anilan) x where x is not null and x <> auth.uid() limit 20), '{}');
  return new;
end $$;
create trigger oda_mesaj_damga before insert on oda_mesaj for each row execute function oda_mesaj_damga();

create function oda_mesaj_anma() returns trigger language plpgsql security definer set search_path = public as $$
declare ad text; kanal_ad text;
begin
  if coalesce(array_length(new.anilan, 1), 0) = 0 then return null; end if;
  select full_name into ad from profiles where id = new.yazan;
  kanal_ad := case when new.kanal like 'zumre:%' then substr(new.kanal, 7) || ' zümresi'
                   when new.kanal = 'genel' then 'Genel' else initcap(new.kanal) end;
  insert into notifications (user_id, text, link, type)
  select u, coalesce(ad, 'Bir öğretmen') || ' seni Öğretmenler Odası sohbetinde andı (' || kanal_ad || '): '
            || left(new.metin, 120) || case when char_length(new.metin) > 120 then '…' else '' end,
         jsonb_build_object('page', 'ogretmenler-odasi', 'tab', 'sohbet', 'kanal', new.kanal), 'oda'
  from unnest(new.anilan) u
  join profiles p on p.id = u and p.school_id = new.school_id and p.status = 'approved'
  where new.kanal = any(oda_kanallari_of(u));
  return null;
end $$;
create trigger oda_mesaj_anma after insert on oda_mesaj for each row execute function oda_mesaj_anma();

alter table oda_mesaj enable row level security;
create policy oda_mesaj_oku on oda_mesaj for select to authenticated
  using (school_id = my_school() and kanal in (select unnest(oda_kanallari())));
create policy oda_mesaj_yaz on oda_mesaj for insert to authenticated
  with check (school_id = my_school() and yazan = auth.uid() and kanal in (select unnest(oda_kanallari())));
create policy oda_mesaj_sil on oda_mesaj for delete to authenticated
  using (school_id = my_school() and kanal in (select unnest(oda_kanallari())) and (yazan = auth.uid() or is_staff()));
revoke all on oda_mesaj from anon, authenticated;
grant select, insert, delete on oda_mesaj to authenticated;

-- ---------- Tepkiler ----------
create table oda_tepki (
  mesaj_id uuid not null references oda_mesaj(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '🙏', '👏')),
  created_at timestamptz not null default now(),
  primary key (mesaj_id, user_id, emoji)
);
alter table oda_tepki enable row level security;
create policy oda_tepki_oku on oda_tepki for select to authenticated
  using (exists (select 1 from oda_mesaj m where m.id = mesaj_id));
create policy oda_tepki_yaz on oda_tepki for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from oda_mesaj m where m.id = mesaj_id));
create policy oda_tepki_sil on oda_tepki for delete to authenticated using (user_id = auth.uid());
revoke all on oda_tepki from anon, authenticated;
grant select, insert, delete on oda_tepki to authenticated;

-- ---------- Okundu bilgisi (kanal başına son okunan an) ----------
create table oda_okundu (
  user_id uuid not null references profiles(id) on delete cascade,
  kanal text not null,
  zaman timestamptz not null default now(),
  primary key (user_id, kanal)
);
alter table oda_okundu enable row level security;
create policy oda_okundu_kendi on oda_okundu for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on oda_okundu from anon;
grant select, insert, update, delete on oda_okundu to authenticated;

-- Kanal başına okunmamış mesaj sayısı (başkalarının yazdığı, son okunandan sonra; en çok 99)
create function oda_okunmamis() returns table (kanal text, sayi int)
language sql stable security definer set search_path = public as $$
  select k, (select count(*) from (
               select 1 from oda_mesaj m
               where m.school_id = my_school() and m.kanal = k and m.yazan is distinct from auth.uid()
                 and m.created_at > coalesce((select o.zaman from oda_okundu o where o.user_id = auth.uid() and o.kanal = k), now() - interval '30 days')
               limit 99) x)::int
  from unnest(oda_kanallari()) k
$$;
revoke all on function oda_okunmamis() from public, anon;
grant execute on function oda_okunmamis() to authenticated;

-- ---------- 30 günden eski mesajları sil (her gece) ----------
create function oda_temizlik() returns void language sql security definer set search_path = public as $$
  delete from oda_mesaj where created_at < now() - interval '30 days';
$$;
revoke all on function oda_temizlik() from public, anon, authenticated;
select cron.schedule('oda-temizlik', '20 3 * * *', $$select public.oda_temizlik()$$);

-- ---------- Canlı akış (Supabase Realtime; okuma kuralları burada da geçerli) ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table oda_mesaj, oda_tepki;
  end if;
end $$;

-- ---------- Öğrenci Takip: görülebilen öğrencilerin devamsızlık özeti ----------
-- Her öğrenci için içinde bulunulan dönemin en dolu sınırı (attendance_limits_of ile aynı hesap).
create function oda_devamsizlik(p_ogrenciler uuid[]) returns table (student_id uuid, level text, used numeric, lim int, label text)
language sql stable security definer set search_path = public as $$
  select s, r->>'level', (w->>'used')::numeric, (w->>'limit')::int, w->>'label'
  from (select s, attendance_limits_of(s) r from unnest(p_ogrenciler[1:300]) s
        where is_teacher() and (is_admin() or module_enabled('yoklama')) and can_see_student(s)) x
  cross join lateral (
    select i w from jsonb_array_elements(x.r->'items') i
    where (i->>'current')::boolean
    order by case when (i->>'limit')::int > 0 then (i->>'used')::numeric / (i->>'limit')::int else -1 end desc,
             (i->>'key') = 'yillik' desc
    limit 1) m
  where x.r is not null
$$;
revoke all on function oda_devamsizlik(uuid[]) from public, anon;
grant execute on function oda_devamsizlik(uuid[]) to authenticated;

revoke all on function oda_mesaj_damga(), oda_mesaj_anma() from public, anon, authenticated;
