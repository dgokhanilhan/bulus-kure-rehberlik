-- Aylık öğle menüsünü tek transaction ile kaydet. Diğer öğün kayıtları korunur.
create function save_monthly_lunch(p_month date, p_days jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare r jsonb; d date; menu text; sid uuid:=my_school();
begin
 if not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days)>31 then raise exception 'Ay ve günler geçersiz.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_days) x group by x->>'day' having count(*)>1) then raise exception 'Aynı gün birden fazla gönderilemez.' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(p_days) loop
  d:=(r->>'day')::date; menu:=btrim(r->>'items');
  if d is null or d<p_month or d>=(p_month+interval '1 month')::date or extract(isodow from d)>5 or menu is null or length(menu)>2000 then raise exception 'Menü günü veya içeriği geçersiz.' using errcode='22023'; end if;
  if menu='' then delete from meals where school_id=sid and day=d and meal='ogle';
  else insert into meals(school_id,day,meal,items) values(sid,d,'ogle',menu) on conflict(school_id,day,meal) do update set items=excluded.items; end if;
 end loop;
end $$;
revoke all on function save_monthly_lunch(date,jsonb) from public,anon;
grant execute on function save_monthly_lunch(date,jsonb) to authenticated;

create table teacher_duties (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references schools(id),
 teacher_id uuid not null references profiles(id) on delete cascade,
 weekday int not null check(weekday between 1 and 5),
 period text not null check(period in ('before_noon','after_noon')),
 location text not null check(location in ('kantin','arka_bahce','lise_1','orta_56','orta_78')),
 reminded_on date,
 unique(teacher_id,weekday,period)
);
alter table teacher_duties enable row level security;
create policy duties_read on teacher_duties for select to authenticated using(school_id=my_school() and teacher_id=auth.uid() and has_role(auth.uid(),'ogretmen'));
create trigger audit_teacher_duties after insert or update or delete on teacher_duties for each row execute function audit_row();

create function save_teacher_duty(p_id uuid,p_weekday int,p_period text,p_location text,p_delete boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare sid uuid:=my_school(); rid uuid:=p_id;
begin
 if sid is null or not has_role(auth.uid(),'ogretmen') then raise exception 'Onaylı öğretmen hesabı gerekir.' using errcode='42501'; end if;
 if p_id is not null and not exists(select 1 from teacher_duties where id=p_id and school_id=sid and teacher_id=auth.uid()) then raise exception 'Nöbet bulunamadı.' using errcode='42501'; end if;
 if p_delete then
  if p_id is null then raise exception 'Nöbet seçilmeli.' using errcode='22023'; end if;
  delete from teacher_duties where id=p_id and teacher_id=auth.uid() and school_id=sid;
  return p_id;
 end if;
 if p_id is null then insert into teacher_duties(school_id,teacher_id,weekday,period,location) values(sid,auth.uid(),p_weekday,p_period,p_location) returning id into rid;
 else update teacher_duties set weekday=p_weekday,period=p_period,location=p_location where id=p_id and teacher_id=auth.uid() and school_id=sid; end if;
 return rid;
end $$;
revoke all on function save_teacher_duty(uuid,int,text,text,boolean) from public,anon;
grant execute on function save_teacher_duty(uuid,int,text,text,boolean) to authenticated;

create function teacher_duty_reminders_on(today date) returns int
language plpgsql security definer set search_path=public as $$
declare r teacher_duties; n int:=0;
begin
 -- Satır kilidi ve tarih işareti aynı gün tekrar/çakışan çalıştırmalarda çift bildirimi önler.
 for r in update teacher_duties d set reminded_on=today
  where d.weekday=extract(isodow from today) and d.reminded_on is distinct from today
  and exists(select 1 from profiles p where p.id=d.teacher_id and p.school_id=d.school_id and p.status='approved' and has_role(p.id,'ogretmen')) returning d.* loop
  insert into notifications(user_id,text,link,type) values(r.teacher_id,
   'Bugün nöbetin var · ' || case r.period when 'before_noon' then 'Öğleden önce' else 'Öğleden sonra' end || ' · ' ||
   case r.location when 'kantin' then 'Kantin' when 'arka_bahce' then 'Arka bahçe' when 'lise_1' then '1. kat lise' when 'orta_56' then '2. kat 5/6' else '2. kat 7/8' end,
   jsonb_build_object('page','nobet-takip','duty',r.id),'nobet');
  n:=n+1;
 end loop;
 return n;
end $$;
revoke all on function teacher_duty_reminders_on(date) from public,anon,authenticated;
grant execute on function teacher_duty_reminders_on(date) to service_role;
create function teacher_duty_reminders() returns int language sql security definer set search_path=public as $$
 select teacher_duty_reminders_on((now() at time zone 'Europe/Istanbul')::date)
$$;
revoke all on function teacher_duty_reminders() from public,anon,authenticated;
grant execute on function teacher_duty_reminders() to service_role;
-- Türkiye saati 07.00–17.45: o gün eklenen nöbet de bir sonraki çalışmada hatırlatılır.
select cron.schedule('ogretmen-nobet-hatirlatma','*/15 4-14 * * 1-5',$$select public.teacher_duty_reminders()$$);

alter function setting_spec() rename to setting_spec_before_0040;
create function setting_spec() returns jsonb language sql immutable as $$
 select setting_spec_before_0040() || '{"bildirim.nobet":{"type":"bool","default":true}}'::jsonb
$$;
