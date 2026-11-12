-- Branş veli toplantısı gözlem formu: öğretmenin kendi dersi için öğrenci hakkında işaretlediği gözlemler ve yazdığı öneriler.
-- Toplantı sonunda veliye kâğıt olarak teslim edilir; sistemde saklanır ki bir sonraki toplantıda öncekiyle karşılaştırılabilsin.
-- Öğrencinin ödev, deneme, etüt ve devamsızlık özeti mevcut tablolardan okunur (bu tablo yalnız formu tutar).
-- Kim: öğretmen yalnız kendi yazdığı formu ve yalnız erişebildiği (atandığı sınıfların) öğrencileri için; rehberlik ve yönetici
-- okuldaki bütün formları okur. Veli ve öğrenci erişemez (kâğıt çıktı öğretmence verilir). Onaylanmamış kullanıcı satır görmez.
-- Yalnız ekleme: mevcut tablo ve veriler değişmez. Geri alma: supabase/geri-alma/0066_brans_toplanti_geri_al.sql

create table brans_toplanti_formlari (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  ders text not null check (char_length(btrim(ders)) between 2 and 60),
  toplanti_tarihi date not null,
  -- soru anahtarı → cevap (işaretli sorularda seçenek anahtarı, yazı alanlarında metin); anahtarlar ön yüzde tanımlı
  cevaplar jsonb not null default '{}'::jsonb check (jsonb_typeof(cevaplar) = 'object'),
  -- Öğretmenin kendine notu: veliye verilen çıktıya girmez
  ic_not text check (ic_not is null or char_length(ic_not) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, teacher_id, ders, toplanti_tarihi)
);
create index brans_toplanti_formlari_okul on brans_toplanti_formlari (school_id, toplanti_tarihi);
create index brans_toplanti_formlari_ogretmen on brans_toplanti_formlari (teacher_id, toplanti_tarihi);

create function brans_toplanti_cevap_gecerli(c jsonb) returns boolean language sql immutable as $$
  select not exists (select 1 from jsonb_each(c) e where jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 600 or e.key !~ '^[a-z][a-z0-9_]{0,39}$')
     and (select count(*) from jsonb_object_keys(c)) <= 60
$$;
alter table brans_toplanti_formlari add constraint brans_toplanti_cevap_degerleri check (brans_toplanti_cevap_gecerli(cevaplar));

-- Yazan, okul ve zaman damgası sunucuda konur (istemciden gelen değer yok sayılır); form başka öğretmene / öğrenciye taşınamaz
create function brans_toplanti_damga() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.teacher_id := auth.uid();
    new.school_id := my_school();
    new.created_at := now();
  else
    new.teacher_id := old.teacher_id;
    new.school_id := old.school_id;
    new.student_id := old.student_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger brans_toplanti_damga before insert or update on brans_toplanti_formlari for each row execute function brans_toplanti_damga();

alter table brans_toplanti_formlari enable row level security;
-- Okuma: kendi formu; rehberlik ve yönetici okuldaki hepsi
create policy brans_toplanti_oku on brans_toplanti_formlari for select to authenticated
  using (school_id = my_school() and is_teacher() and can_see_student(student_id) and (teacher_id = auth.uid() or is_staff()));
-- Yazma: yalnız kendi formu
create policy brans_toplanti_ekle on brans_toplanti_formlari for insert to authenticated
  with check (school_id = my_school() and is_teacher() and can_see_student(student_id) and teacher_id = auth.uid());
create policy brans_toplanti_guncelle on brans_toplanti_formlari for update to authenticated
  using (school_id = my_school() and is_teacher() and can_see_student(student_id) and teacher_id = auth.uid())
  with check (school_id = my_school() and is_teacher() and can_see_student(student_id) and teacher_id = auth.uid());
create policy brans_toplanti_sil on brans_toplanti_formlari for delete to authenticated
  using (school_id = my_school() and is_teacher() and can_see_student(student_id) and teacher_id = auth.uid());
-- Okul sınırı (0037 deseni): izin verici bir politika eklense bile başka okulun ya da görülemeyen öğrencinin satırı açılmaz
create policy security_school on brans_toplanti_formlari as restrictive for all to authenticated
  using (school_id = my_school() and can_see_student(student_id))
  with check (school_id = my_school() and can_see_student(student_id));
revoke all on brans_toplanti_formlari from anon;
grant select, insert, update, delete on brans_toplanti_formlari to authenticated;
