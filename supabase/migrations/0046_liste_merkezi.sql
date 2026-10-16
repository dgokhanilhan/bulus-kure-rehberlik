-- Eklemeli değişiklik: mevcut hesaplar, veli bağlantıları ve dönem verileri değiştirilmez.
create table parent_contact_details (
 profile_id uuid primary key references profiles(id) on delete cascade,
 school_id uuid not null references schools(id),
 phone text, contact_email text,
 updated_at timestamptz not null default now(), updated_by uuid references profiles(id)
);
create table school_list_documents (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references schools(id),
 name text not null check(length(btrim(name)) between 1 and 120),
 kind text not null check(kind in ('students','parents')),
 mode text not null check(mode in ('dynamic','snapshot')),
 config jsonb not null, snapshot jsonb,
 revision integer not null default 1,
 created_by uuid not null references profiles(id), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), archived_at timestamptz
);
create index school_list_documents_school on school_list_documents(school_id,updated_at desc);
alter table parent_contact_details enable row level security;
alter table school_list_documents enable row level security;
revoke all on parent_contact_details,school_list_documents from anon,authenticated;
grant select on parent_contact_details,school_list_documents to authenticated;
create policy contacts_admin_read on parent_contact_details for select to authenticated using(is_admin() and school_id=my_school());
create policy lists_admin_read on school_list_documents for select to authenticated using(is_admin() and school_id=my_school());

create function school_list_sources() returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sid uuid:=my_school();
begin
 if sid is null or not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 return jsonb_build_object(
 'school',coalesce((select nullif(value#>>'{}','') from school_settings where school_id=sid and key='genel.okul_adi'),(select name from schools where id=sid)),
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'grade',grade,'active',active) order by grade,name) from classes where school_id=sid),'[]'::jsonb),
 'students',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'classId',class_id,'className',class_name,'schoolNo',school_no) order by class_name,full_name) from students where school_id=sid and archived_at is null),'[]'::jsonb),
 'parents',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'phone',case when c.profile_id is null then p.phone else c.phone end,'email',coalesce(c.contact_email,p.email),'contactEmail',c.contact_email,'loginEmail',p.email,'updatedAt',c.updated_at) order by p.full_name) from profiles p left join parent_contact_details c on c.profile_id=p.id and c.school_id=sid where p.school_id=sid and p.status='approved' and has_role(p.id,'veli')),'[]'::jsonb),
 'links',coalesce((select jsonb_agg(jsonb_build_object('parentId',l.parent_id,'studentId',l.student_id,'relation',l.relation)) from parent_links l join students s on s.id=l.student_id join profiles p on p.id=l.parent_id where s.school_id=sid and p.school_id=sid and s.archived_at is null and p.status='approved' and has_role(p.id,'veli')),'[]'::jsonb)
 );
end $$;

create function update_parent_contact(p_parent uuid,p_phone text,p_email text,p_expected timestamptz default null) returns void language plpgsql security definer set search_path=public as $$
declare sid uuid:=my_school(); digits text; phone_value text; email_value text:=nullif(btrim(p_email),''); old_updated timestamptz;
begin
 if sid is null or not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 perform 1 from profiles where id=p_parent and school_id=sid and status='approved' and has_role(id,'veli') for update;
 if not found then raise exception 'Veli bulunamadı.' using errcode='42501'; end if;
 select updated_at into old_updated from parent_contact_details where profile_id=p_parent;
 if old_updated is distinct from p_expected then raise exception 'İletişim bilgisi başka bir yönetici tarafından değiştirildi. Yenileyip tekrar dene.' using errcode='PT409'; end if;
 if nullif(btrim(p_phone),'') is not null then
  if p_phone !~ '^[+0-9 ()-]+$' then raise exception 'Telefon biçimi geçersiz.' using errcode='22023'; end if;
  digits:=regexp_replace(p_phone,'[^0-9]','','g');
  if digits ~ '^0[1-9][0-9]{9}$' then digits:='90'||substr(digits,2);
  elsif digits ~ '^[1-9][0-9]{9}$' then digits:='90'||digits;
  elsif left(btrim(p_phone),1)<>'+' then raise exception 'Telefonu 05xx veya +ülke kodu ile gir.' using errcode='22023'; end if;
  if digits !~ '^[1-9][0-9]{7,14}$' then raise exception 'Telefon 8–15 rakam olmalı.' using errcode='22023'; end if;
  phone_value:='+'||digits;
 end if;
 if email_value is not null and (length(email_value)>254 or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'İletişim e-postası geçersiz.' using errcode='22023'; end if;
 insert into parent_contact_details(profile_id,school_id,phone,contact_email,updated_by) values(p_parent,sid,phone_value,email_value,auth.uid())
 on conflict(profile_id) do update set phone=excluded.phone,contact_email=excluded.contact_email,updated_at=clock_timestamp(),updated_by=auth.uid();
 insert into audit_log(user_id,action,entity,entity_id,meta) values(auth.uid(),'contact_update','profiles',p_parent,jsonb_build_object('phone_changed',true,'contact_email_changed',true));
end $$;

create function save_school_list(p_id uuid,p_name text,p_kind text,p_mode text,p_config jsonb,p_snapshot jsonb default null,p_revision integer default null) returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid:=my_school(); rid uuid:=p_id; c jsonb; k text;
begin
 if sid is null or not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_kind not in ('students','parents') or p_kind is null or p_mode not in ('dynamic','snapshot') or p_mode is null or jsonb_typeof(p_config) is distinct from 'object' or octet_length(p_config::text)>2000000 then raise exception 'Liste bilgileri geçersiz.' using errcode='22023'; end if;
 if jsonb_typeof(p_config->'columns') is distinct from 'array' then raise exception 'Sütunlar gerekli.' using errcode='22023'; end if;
 if jsonb_array_length(p_config->'columns') not between 1 and 16 then raise exception '1–16 sütun seç.' using errcode='22023'; end if;
 foreach k in array array['title','description','date','footer','signatures','search'] loop
  if jsonb_typeof(p_config->k) is distinct from 'string' or length(p_config->>k)>500 then raise exception 'Liste metni geçersiz.' using errcode='22023'; end if;
 end loop;
 foreach k in array array['classIds','studentIds','excluded'] loop
  if jsonb_typeof(p_config->k) is distinct from 'array' then raise exception 'Liste seçimi geçersiz.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_config->k) a where jsonb_typeof(a) is distinct from 'string') then raise exception 'Liste seçimi geçersiz.' using errcode='22023'; end if;
 end loop;
 if coalesce(p_config->>'orientation','') not in ('portrait','landscape') or coalesce(p_config->>'grouping','') not in ('parent','child') or coalesce(p_config->>'sort','') not in ('name','class','number') or jsonb_typeof(p_config->'missingPhone') is distinct from 'boolean' or jsonb_typeof(p_config->'entries') is distinct from 'object' or jsonb_typeof(p_config->'rowHeight') is distinct from 'number' then raise exception 'Liste düzeni geçersiz.' using errcode='22023'; end if;
 if (p_config->>'rowHeight')::numeric not between 24 and 90 then raise exception 'Satır yüksekliği geçersiz.' using errcode='22023'; end if;
 for c in select value from jsonb_each(p_config->'entries') loop
  if jsonb_typeof(c) is distinct from 'object' then raise exception 'Hücreler geçersiz.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(c) e where jsonb_typeof(e.value) is distinct from 'string' or length(e.value#>>'{}')>300) then raise exception 'Hücre metni geçersiz.' using errcode='22023'; end if;
 end loop;
 for c in select value from jsonb_array_elements(p_config->'columns') loop
  if c->>'source' is null or c->>'source' not in ('number','studentName','className','schoolNo','parentName','relation','phone','email','blank') or length(btrim(coalesce(c->>'title',''))) not between 1 and 80 or jsonb_typeof(c->'id') is distinct from 'string' or jsonb_typeof(c->'width') is distinct from 'number' then raise exception 'Sütun geçersiz.' using errcode='22023'; end if;
  if (c->>'width')::numeric not between 3 and 100 then raise exception 'Sütun genişliği geçersiz.' using errcode='22023'; end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_config->'columns'))<>jsonb_array_length(p_config->'columns') then raise exception 'Sütun kimlikleri benzersiz olmalı.' using errcode='22023'; end if;
 if p_mode='snapshot' then
  if jsonb_typeof(p_snapshot) is distinct from 'array' then raise exception 'Sabit liste satırları gerekli.' using errcode='22023'; end if;
  if jsonb_array_length(p_snapshot)>5000 or octet_length(p_snapshot::text)>5000000 then raise exception 'Sabit liste çok büyük.' using errcode='22023'; end if;
  for c in select value from jsonb_array_elements(p_snapshot) loop
   if jsonb_typeof(c) is distinct from 'array' then raise exception 'Sabit satır geçersiz.' using errcode='22023'; end if;
   if jsonb_array_length(c)<>jsonb_array_length(p_config->'columns') then raise exception 'Sabit sütun sayısı geçersiz.' using errcode='22023'; end if;
   if exists(select 1 from jsonb_array_elements(c) a where jsonb_typeof(a) is distinct from 'string' or length(a#>>'{}')>10000) then raise exception 'Sabit hücre geçersiz.' using errcode='22023'; end if;
  end loop;
 else p_snapshot:=null; end if;
 if rid is null then
  insert into school_list_documents(school_id,name,kind,mode,config,snapshot,created_by) values(sid,btrim(p_name),p_kind,p_mode,p_config,p_snapshot,auth.uid()) returning id into rid;
 else
  update school_list_documents set name=btrim(p_name),kind=p_kind,mode=p_mode,config=p_config,snapshot=p_snapshot,revision=revision+1,updated_at=clock_timestamp() where id=rid and school_id=sid and revision=p_revision and archived_at is null;
  if not found then raise exception 'Liste değişmiş veya erişilemiyor. Yenileyip tekrar aç.' using errcode='PT409'; end if;
 end if;
 insert into audit_log(user_id,action,entity,entity_id,meta) values(auth.uid(),'list_save','school_list_documents',rid,jsonb_build_object('mode',p_mode,'kind',p_kind));
 return rid;
end $$;
create function archive_school_list(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if my_school() is null or not is_admin() then raise exception 'Yönetici gerekir.' using errcode='42501'; end if;
 update school_list_documents set archived_at=now(),revision=revision+1 where id=p_id and school_id=my_school() and archived_at is null;
 if not found then raise exception 'Liste bulunamadı.' using errcode='42501'; end if;
 insert into audit_log(user_id,action,entity,entity_id) values(auth.uid(),'list_archive','school_list_documents',p_id);
end $$;
create function authorize_school_list_export(p_format text,p_columns text[],p_count integer) returns void language plpgsql security definer set search_path=public as $$
begin
 if my_school() is null or not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode='42501'; end if;
 if p_format is null or p_format not in ('pdf','xlsx','print') or p_count is null or p_count not between 0 and 5000 or p_columns is null or cardinality(p_columns) not between 1 and 16 then raise exception 'Çıktı bilgileri geçersiz.' using errcode='22023'; end if;
 if exists(select 1 from unnest(p_columns) c where c is null or c not in ('number','studentName','className','schoolNo','parentName','relation','phone','email','blank')) then raise exception 'Çıktı sütunu geçersiz.' using errcode='22023'; end if;
 insert into audit_log(user_id,action,entity,meta) values(auth.uid(),'list_export','school_list_documents',jsonb_build_object('format',p_format,'columns',p_columns,'rows',p_count));
end $$;
revoke all on function school_list_sources(),update_parent_contact(uuid,text,text,timestamptz),save_school_list(uuid,text,text,text,jsonb,jsonb,integer),archive_school_list(uuid),authorize_school_list_export(text,text[],integer) from public,anon;
grant execute on function school_list_sources(),update_parent_contact(uuid,text,text,timestamptz),save_school_list(uuid,text,text,text,jsonb,jsonb,integer),archive_school_list(uuid),authorize_school_list_export(text,text[],integer) to authenticated;
