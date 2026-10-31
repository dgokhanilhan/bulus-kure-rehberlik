-- Etüt yoklaması: öğretmen yalnız etüt günü girer ve değiştirir. Geçmiş etüt öğretmen için salt okunur.
-- Rehber öğretmen ve yönetici, hatalı kaydı program ekranından düzeltebilir.
create or replace function etut_yoklama(p_hucre uuid, p_ogrenci uuid, p_durum text) returns void
language plpgsql security definer set search_path = public as $$
declare h etut_hucreler; g etut_gunler;
begin
  perform etut_modul_acik();
  select * into h from etut_hucreler where id = p_hucre and school_id = my_school();
  if h.id is null then raise exception 'Etüt bulunamadı.' using errcode = '23503'; end if;
  if not (is_staff() or (h.teacher_id = auth.uid() and is_teacher() and ayar_bool('etut.yoklama_ogretmen'))) then
    raise exception 'Yoklamayı etüdün öğretmeni ya da rehber öğretmen girer.' using errcode = '42501';
  end if;
  select * into g from etut_gunler where id = h.gun_id;
  if g.durum <> 'yayinda' then raise exception 'Program yayınlanmadan yoklama alınmaz.' using errcode = '22023'; end if;
  if g.tarih > tr_today() then raise exception 'Yoklama etüt günü ya da sonrasında alınır.' using errcode = '22023'; end if;
  if g.tarih < tr_today() and not is_staff() then raise exception 'Geçmiş etütün yoklaması değiştirilemez.' using errcode = '22023'; end if;
  if p_durum is not null and p_durum not in ('geldi', 'gelmedi') then raise exception 'Yoklama geldi ya da gelmedi olmalı.' using errcode = '22023'; end if;
  update etut_ogrenciler set yoklama = p_durum, yoklama_by = case when p_durum is null then null else auth.uid() end,
         yoklama_at = case when p_durum is null then null else now() end
   where hucre_id = h.id and student_id = p_ogrenci;
  if not found then raise exception 'Öğrenci bu etütte değil.' using errcode = '23503'; end if;
end $$;
