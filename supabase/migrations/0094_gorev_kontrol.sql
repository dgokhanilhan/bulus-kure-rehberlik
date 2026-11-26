-- 0094 Görev takip formu: her göreve en çok 3 kontrol (tarih + o güne kadar çözülen soru).
-- Kâğıt formdaki "1. / 2. / 3. kontrol" kutularının sistemdeki karşılığı. Yalnız personel görür ve yazar; veli ve öğrenci görmez.
-- Son kontrol, görevin çözülen sayısını (tasks.solved) günceller; tamamlanma, bildirim ve haftalık kopya
-- mevcut tasks tetikleyicileriyle aynen çalışır.

create table gorev_kontrol (
  task_id uuid not null references tasks(id) on delete cascade,
  sira smallint not null check (sira between 1 and 3),
  tarih date not null default tr_today(),
  cozulen integer not null check (cozulen between 0 and 500),
  school_id uuid not null default my_school() references schools(id) on delete cascade,
  created_by uuid default auth.uid() references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (task_id, sira)
);
alter table gorev_kontrol enable row level security;

-- Görevi görebilen personel (tasks RLS alt sorguda uygulanır)
create policy gorev_kontrol_personel on gorev_kontrol for all
  using (is_staff() and exists (select 1 from tasks t where t.id = task_id))
  with check (is_staff() and exists (select 1 from tasks t where t.id = task_id));
create policy gorev_kontrol_okul on gorev_kontrol as restrictive for all
  using (school_id = my_school()) with check (school_id = my_school());
create trigger audit_gorev_kontrol after insert or update or delete on gorev_kontrol for each row execute function audit_row();

-- Kontrolü kaydet (p_cozulen null → kontrolü sil). Çağıranın yetkisiyle çalışır (RLS geçerli).
-- Sonra görevin çözülen sayısı en son kontrolün sayısı olur; hiç kontrol kalmadıysa görev olduğu gibi kalır.
create or replace function gorev_kontrol_kaydet(p_task uuid, p_sira int, p_cozulen int, p_tarih date default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  t tasks;
  son int;
begin
  select * into t from tasks where id = p_task;
  if not found or not is_staff() then
    raise exception 'Görev bulunamadı.' using errcode = '42501';
  end if;
  if p_sira not between 1 and 3 then
    raise exception 'Kontrol 1, 2 ya da 3 olabilir.' using errcode = '22023';
  end if;
  if p_cozulen is null then
    delete from gorev_kontrol where task_id = p_task and sira = p_sira;
  else
    if p_cozulen < 0 or p_cozulen > t.question_count then
      raise exception 'Çözülen soru 0 ile % arasında olmalı.', t.question_count using errcode = '22023';
    end if;
    if p_tarih is not null and (p_tarih > tr_today() or p_tarih < (t.created_at at time zone 'Europe/Istanbul')::date) then
      raise exception 'Kontrol tarihi görevin verildiği gün ile bugün arasında olmalı.' using errcode = '22023';
    end if;
    insert into gorev_kontrol (task_id, sira, tarih, cozulen, school_id)
    values (p_task, p_sira, coalesce(p_tarih, tr_today()), p_cozulen, my_school())
    on conflict (task_id, sira) do update
      set cozulen = excluded.cozulen,
          tarih = coalesce(p_tarih, case when gorev_kontrol.cozulen = excluded.cozulen then gorev_kontrol.tarih else tr_today() end),
          created_by = auth.uid(),
          updated_at = now();
  end if;

  select k.cozulen into son from gorev_kontrol k where k.task_id = p_task order by k.sira desc limit 1;
  if son is not null and son is distinct from t.solved then
    update tasks set solved = son where id = p_task;
  end if;
end $$;

revoke all on function gorev_kontrol_kaydet(uuid, int, int, date) from public, anon;
grant execute on function gorev_kontrol_kaydet(uuid, int, int, date) to authenticated;
