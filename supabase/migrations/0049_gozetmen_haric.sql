-- Gözetmen Bul (bağımsız modül, 0048'in devamı): sınav görevi verilmeyecek öğretmenlerin kalıcı listesi
-- (ör. okul kurucuları). Mevcut tablolar değişmez; öğretmen silinirse satır da silinir.
-- Geri alma: supabase/geri-alma/0049_gozetmen_haric_geri_al.sql (0048 geri alınırken bu da kaldırılır).
create table gozetmen_haric (
  school_id uuid not null default my_school() references schools(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (school_id, teacher_id)
);
alter table gozetmen_haric enable row level security;
create policy gozetmen_haric_admin on gozetmen_haric for all to authenticated
  using (is_admin() and school_id = my_school()) with check (is_admin() and school_id = my_school());
