-- Hedefler veli ve öğrenci ekranında (LGS / YKS Özeti): öğretmenin öğrenci için seçtiği hedef okullar / bölümler, salt okunur.
-- Tablolar (ogrenci_hedefleri, hedef_programlar) öğretmene açık kalır; aile yalnız bu fonksiyonla kendi öğrencisinin
-- hedeflerini okur: onaylı öğrenci hesabı (kendisi) ya da öğrenciye bağlı onaylı veli. Okulun öneri listesi aileye açılmaz.
-- Geri alma: supabase/geri-alma/0060_aile_hedefleri_geri_al.sql
create function aile_hedefleri(p_student uuid)
returns table (sinav text, yil int, kurum text, il text, ilce text, birim text, program text, puan_turu text, taban_puan numeric, yuzdelik numeric, kontenjan int)
language sql stable security definer set search_path = public as $$
  select p.sinav, p.yil::int, p.kurum, p.il, p.ilce, p.birim, p.program, p.puan_turu, p.taban_puan::numeric, p.yuzdelik::numeric, p.kontenjan
  from ogrenci_hedefleri h
  join hedef_programlar p on p.id = h.program_id
  join students s on s.id = h.student_id and s.school_id = h.school_id
  join profiles me on me.id = auth.uid() and me.status = 'approved' and me.school_id = s.school_id
  where h.student_id = p_student
    and ((me.role = 'ogrenci' and me.student_id = p_student)
         or exists (select 1 from parent_links pl where pl.parent_id = me.id and pl.student_id = p_student))
  order by h.created_at
$$;
revoke all on function aile_hedefleri(uuid) from public, anon;
grant execute on function aile_hedefleri(uuid) to authenticated;
