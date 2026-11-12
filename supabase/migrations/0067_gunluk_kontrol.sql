-- Günlük kontrol: öğretmenin gerektiğinde işaretlediği kılık kıyafet / materyal eksikleri (yoklamadan bağımsız).
-- Yalnız eksik olan kaydedilir (bir öğrenci, bir gün, bir madde = bir satır); öğretmen isterse detay yazar (veliye görünür).
-- Aynı maddenin aynı ay içindeki 3., 6., 9.… eksikliğinde öğrencinin velilerine uygulama içi uyarı bildirimi gider.
-- Kim: öğretmen yalnız erişebildiği (atandığı sınıfların) öğrencileri için ekler; kendi kaydının detayını düzeltir ya da
-- kaydını kaldırır. Rehberlik ve yönetici bütün kayıtları görür ve gerekirse kaldırır. Veli ve öğrenci yalnız kendi kaydını okur.
-- Kayıt düzeltilir ya da kaldırılırsa eski hâli gunluk_kontrol_gecmis'te saklanır (yalnız rehberlik/yönetici okur).
-- Yalnız ekleme: mevcut tablo, ayar ve veriler değişmez. Geri alma: supabase/geri-alma/0067_gunluk_kontrol_geri_al.sql

create table gunluk_kontrol (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete set null,
  tarih date not null,
  madde text not null check (madde in ('kiyafet', 'kitap_defter', 'ajanda', 'beden_kiyafeti', 'telefon')),
  detay text check (detay is null or char_length(detay) <= 300),
  -- Aynı maddenin o ay içindeki kaçıncı eksikliği (eklenirken sunucuda hesaplanır)
  sira int not null default 1,
  veli_uyarildi boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, tarih, madde)
);
create index gunluk_kontrol_okul on gunluk_kontrol (school_id, tarih desc);
create index gunluk_kontrol_ogrenci_ay on gunluk_kontrol (student_id, madde, tarih);

create table gunluk_kontrol_gecmis (
  id bigint generated always as identity primary key,
  school_id uuid not null references schools(id) on delete cascade,
  kayit_id uuid not null,
  islem text not null check (islem in ('duzeltme', 'kaldirma')),
  eski jsonb not null,
  yapan uuid references profiles(id) on delete set null,
  zaman timestamptz not null default now()
);
create index gunluk_kontrol_gecmis_kayit on gunluk_kontrol_gecmis (kayit_id);

-- Yazan, okul, sıra ve zaman damgası sunucuda konur; kayıt başka öğrenciye / güne / maddeye taşınamaz (yalnız detay değişir)
create function gunluk_kontrol_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.teacher_id := auth.uid();
    new.school_id := my_school();
    new.created_at := now();
    new.sira := 1 + (select count(*) from gunluk_kontrol g
                     where g.student_id = new.student_id and g.madde = new.madde
                       and date_trunc('month', g.tarih) = date_trunc('month', new.tarih));
    -- Uyarı bildirimi bu kayıtla gider (gunluk_kontrol_uyar); onaylı velisi yoksa bildirim de yok
    new.veli_uyarildi := new.sira % 3 = 0 and exists (select 1 from parent_accounts(new.student_id));
  else
    new.id := old.id;
    new.teacher_id := old.teacher_id;
    new.school_id := old.school_id;
    new.student_id := old.student_id;
    new.tarih := old.tarih;
    new.madde := old.madde;
    new.sira := old.sira;
    new.veli_uyarildi := old.veli_uyarildi;
    new.created_at := old.created_at;
  end if;
  new.detay := nullif(btrim(new.detay), '');
  new.updated_at := now();
  return new;
end $$;
create trigger gunluk_kontrol_damga before insert or update on gunluk_kontrol for each row execute function gunluk_kontrol_damga();

-- Veliye uyarı: aynı maddenin ay içindeki her 3. eksikliğinde (3, 6, 9…)
create function gunluk_kontrol_uyar() returns trigger language plpgsql security definer set search_path = public as $$
declare ad text; ifade text; metin text;
begin
  if not new.veli_uyarildi then return null; end if;
  select s.full_name into ad from students s where s.id = new.student_id;
  ifade := case new.madde
    when 'kiyafet' then 'okul kıyafetinde eksik görüldü'
    when 'kitap_defter' then 'ders kitabı / defteri yanında değildi'
    when 'ajanda' then 'ajanda imzası eksikti'
    when 'beden_kiyafeti' then 'beden eğitimi kıyafeti yanında değildi'
    else 'telefonunu teslim etmedi' end;
  metin := 'Günlük kontrol: ' || coalesce(ad, 'Öğrenci') || ' bu ay ' || new.sira || '. kez ' || ifade
           || ' (' || to_char(new.tarih, 'DD.MM.YYYY') || '). Ayrıntılar Okul sayfasında.';
  insert into notifications (user_id, text, link, type)
  select distinct u, metin, '{"page":"okul"}'::jsonb, 'gunluk_kontrol' from parent_accounts(new.student_id) u where u is not null;
  return null;
end $$;
create trigger gunluk_kontrol_uyar after insert on gunluk_kontrol for each row execute function gunluk_kontrol_uyar();

-- Düzeltme / kaldırma geçmişi
create function gunluk_kontrol_gecmise_yaz() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.detay is not distinct from old.detay then return null; end if;
  insert into gunluk_kontrol_gecmis (school_id, kayit_id, islem, eski, yapan)
  values (old.school_id, old.id, case tg_op when 'UPDATE' then 'duzeltme' else 'kaldirma' end, to_jsonb(old), auth.uid());
  return null;
end $$;
create trigger gunluk_kontrol_gecmis_t after update or delete on gunluk_kontrol for each row execute function gunluk_kontrol_gecmise_yaz();

alter table gunluk_kontrol enable row level security;
-- Okuma: öğrenciyi görebilen herkes (öğretmen kendi sınıfları, rehberlik/yönetici tümü, veli kendi çocuğu, öğrenci kendisi)
create policy gunluk_kontrol_oku on gunluk_kontrol for select to authenticated
  using (school_id = my_school() and can_see_student(student_id));
create policy gunluk_kontrol_ekle on gunluk_kontrol for insert to authenticated
  with check (school_id = my_school() and is_teacher() and can_see_student(student_id) and teacher_id = auth.uid());
create policy gunluk_kontrol_guncelle on gunluk_kontrol for update to authenticated
  using (school_id = my_school() and is_teacher() and can_see_student(student_id) and teacher_id = auth.uid())
  with check (school_id = my_school() and is_teacher() and can_see_student(student_id) and teacher_id = auth.uid());
create policy gunluk_kontrol_sil on gunluk_kontrol for delete to authenticated
  using (school_id = my_school() and is_teacher() and can_see_student(student_id) and (teacher_id = auth.uid() or is_staff()));
-- Okul sınırı (0037 deseni)
create policy security_school on gunluk_kontrol as restrictive for all to authenticated
  using (school_id = my_school() and can_see_student(student_id))
  with check (school_id = my_school() and can_see_student(student_id));
revoke all on gunluk_kontrol from anon;
grant select, insert, update, delete on gunluk_kontrol to authenticated;

alter table gunluk_kontrol_gecmis enable row level security;
create policy gunluk_kontrol_gecmis_oku on gunluk_kontrol_gecmis for select to authenticated
  using (school_id = my_school() and is_staff());
revoke all on gunluk_kontrol_gecmis from anon, authenticated;
grant select on gunluk_kontrol_gecmis to authenticated;

revoke all on function gunluk_kontrol_damga(), gunluk_kontrol_uyar(), gunluk_kontrol_gecmise_yaz() from public, anon, authenticated;
