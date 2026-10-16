-- Duyurularda yönetici yazarın etiketi "Okul yönetimi" yerine "Yönetici" olur (yalnız ana rolü yönetici olanlar).
-- Öğretmen ve rehberlik etiketleri değişmez. Var olan duyuruların etiketi de güncellenir; başka alan değişmez.
create or replace function announcements_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select case when p.role = 'admin' then p.full_name || ' · Yönetici' when p.branch = 'Rehberlik' then p.full_name || ' · Rehberlik servisi'
              else p.full_name || ' · ' || p.branch || ' öğretmeni' end
    into new.author_name from profiles p where p.id = new.created_by;
  return new;
end $$;

update announcements set author_name = left(author_name, length(author_name) - length(' · Okul yönetimi')) || ' · Yönetici'
where author_name like '% · Okul yönetimi';
