-- Veli davet kampanyası: öğrenciye özel davet kodu (QR kart ve WhatsApp bağlantısı).
-- Kod: 10 harf (~50 bit), 14 gün geçerli, anne ve baba için 2 kez kullanılabilir; yenilenince eskisi geçersiz olur.
-- Velinin açtığı sayfa (/v/<kod>) yalnız kısaltılmış adı ve sınıfı görür. Kayıt mevcut veli kaydıdır (auth.signUp);
-- kodla gelen kayıt öğrenciye hazır eşleşmiş olarak Onaylar'a düşer, yönetici tek tıkla onaylar (otomatik onay yok).
-- Kayıt kapalıyken ya da davet zorunluyken de geçerli kodla veli kaydı alınır.
-- Geri alma: supabase/geri-alma/0103_veli_davet_kodu_geri_al.sql

create table veli_davet (
  student_id uuid primary key references students(id) on delete cascade,
  school_id uuid not null references schools(id) on delete cascade,
  kod text not null unique check (kod ~ '^[A-HJ-NP-Z2-9]{10}$'),
  olustu timestamptz not null default now(),
  son timestamptz not null,
  kullanim int not null default 0,
  kart_at timestamptz,
  whatsapp_at timestamptz,
  olusturan uuid references profiles(id) on delete set null
);
create index veli_davet_okul on veli_davet (school_id);
alter table veli_davet enable row level security;
revoke all on veli_davet from anon, authenticated;

create function veli_davet_kod_uret() returns text language plpgsql volatile set search_path = public as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(10); c text := ''; i int;
begin
  for i in 0..9 loop c := c || substr(a, (get_byte(b, i) % 32) + 1, 1); end loop;
  return c;
end $$;
revoke all on function veli_davet_kod_uret() from public, anon, authenticated;

-- Geçerli davet (süresi geçmemiş, hakkı bitmemiş, öğrencisi arşivde değil); yoksa null
create function veli_davet_gecerli(p_kod text) returns veli_davet
language sql stable security definer set search_path = public as $$
  select d.* from veli_davet d join students s on s.id = d.student_id
  where d.kod = tahta_kod_norm(p_kod) and d.son > now() and d.kullanim < 2 and s.archived_at is null
$$;
revoke all on function veli_davet_gecerli(text) from public, anon, authenticated;

-- ---------- Velinin sayfası (giriş yok) ----------
-- Yalnız kısaltılmış ad ("Elif Y."), sınıf ve okul adı.
create function veli_davet_bilgi(p_kod text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d veli_davet; s students; ham veli_davet;
begin
  if tahta_kod_norm(p_kod) !~ '^[A-Z0-9]{10}$' then return jsonb_build_object('gecerli', false, 'neden', 'yok'); end if;
  d := veli_davet_gecerli(p_kod);
  if d.student_id is null then
    select * into ham from veli_davet where kod = tahta_kod_norm(p_kod);
    return jsonb_build_object('gecerli', false, 'neden',
      case when ham.student_id is null then 'yok' when ham.kullanim >= 2 then 'dolu' else 'suresi' end);
  end if;
  select * into s from students where id = d.student_id;
  return jsonb_build_object('gecerli', true,
    'cocuk', case when btrim(s.full_name) ~ '\s'
               then split_part(btrim(s.full_name), ' ', 1) || ' ' || left(regexp_replace(btrim(s.full_name), '^.*\s', ''), 1) || '.'
               else btrim(s.full_name) end,
    'sinif', coalesce((select name from classes where id = s.class_id), s.class_name),
    'okul', (select name from schools where id = d.school_id),
    'son', d.son);
end $$;
revoke all on function veli_davet_bilgi(text) from public;
grant execute on function veli_davet_bilgi(text) to anon, authenticated;

-- ---------- Kayıt: kodla gelen veli ----------
-- Kayıt kapalı / davet zorunlu denetimi (0052): geçerli veli davet koduyla gelen kayıt geçer. Gövde 0052'den alındı.
create or replace function handle_new_user_kayit() returns trigger
language plpgsql security definer set search_path = public as $$
declare sch uuid; invited boolean;
begin
  if session_user <> 'supabase_auth_admin' then return new; end if;
  invited := exists (select 1 from invite_intents i where i.email = lower(new.email) and i.created_at > now() - interval '10 minutes');
  if invited then return new; end if;
  select id into sch from schools where slug = new.raw_user_meta_data->>'school';
  if sch is null then return new; end if;
  if new.raw_user_meta_data->>'role' = 'veli' and (veli_davet_gecerli(new.raw_user_meta_data->>'davet')).school_id = sch then return new; end if;
  if not coalesce((school_setting(sch, 'kayit.acik'))::text::boolean, true)
     or coalesce((school_setting(sch, 'kayit.davet_zorunlu'))::text::boolean, false) then
    raise exception 'Okul şu an yeni kayıt almıyor.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Profil oluştuktan sonra (on_auth_user_created): öğrenci eşleşmesi beyana yazılır, kod hakkı düşer.
-- Tetikleyici adı alfabetik olarak en sonda: kayıt denetimi (zy) kodun hakkı düşmeden önce çalışır.
create function veli_davet_kayit() returns trigger
language plpgsql security definer set search_path = public as $$
declare d veli_davet; s students; sch uuid;
begin
  if coalesce(new.raw_user_meta_data->>'davet', '') = '' then return new; end if;
  if new.raw_user_meta_data->>'role' is distinct from 'veli' then
    raise exception 'Davet kodu yalnız veli kaydı içindir.' using errcode = '22023';
  end if;
  select school_id into sch from profiles where id = new.id;
  select * into d from veli_davet where kod = tahta_kod_norm(new.raw_user_meta_data->>'davet') for update;
  if d.student_id is null or d.son <= now() or d.kullanim >= 2 or d.school_id is distinct from sch then
    raise exception 'Davet kodu geçersiz ya da süresi dolmuş.' using errcode = '22023';
  end if;
  select * into s from students where id = d.student_id and archived_at is null;
  if s.id is null then raise exception 'Davet kodu geçersiz ya da süresi dolmuş.' using errcode = '22023'; end if;
  update profiles set declared = coalesce(declared, '{}'::jsonb) || jsonb_build_object(
      'childName', s.full_name,
      'childClass', coalesce((select name from classes where id = s.class_id), s.class_name),
      'davetStudent', s.id)
  where id = new.id;
  update veli_davet set kullanim = kullanim + 1 where student_id = d.student_id;
  return new;
end $$;
revoke all on function veli_davet_kayit() from public, anon, authenticated;
create trigger on_auth_user_zzz_davet after insert on auth.users for each row execute function veli_davet_kayit();

-- ---------- Yönetici ----------
create function veli_davet_yetki() returns uuid language plpgsql stable security definer set search_path = public as $$
declare sid uuid := my_school();
begin
  if sid is null or not is_admin() then raise exception 'Yönetici ve iki adımlı doğrulama gerekir.' using errcode = '42501'; end if;
  return sid;
end $$;
revoke all on function veli_davet_yetki() from public, anon, authenticated;

-- Sınıf bazlı özet: öğrenci, bağlı veli olan öğrenci, davet hazırlanan öğrenci, onay bekleyen kodlu kayıt
create function veli_davet_ozet() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid uuid := veli_davet_yetki();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'ad', c.name, 'kademe', c.grade,
      'ogrenci', (select count(*) from students s where s.class_id = c.id and s.archived_at is null),
      'bagli', (select count(*) from students s where s.class_id = c.id and s.archived_at is null
                  and exists (select 1 from parent_links l join profiles p on p.id = l.parent_id where l.student_id = s.id and p.status = 'approved')),
      'davetli', (select count(*) from veli_davet d join students s on s.id = d.student_id where s.class_id = c.id and s.archived_at is null),
      'kart', (select count(*) from veli_davet d join students s on s.id = d.student_id where s.class_id = c.id and s.archived_at is null and d.kart_at is not null),
      'whatsapp', (select count(*) from veli_davet d join students s on s.id = d.student_id where s.class_id = c.id and s.archived_at is null and d.whatsapp_at is not null),
      'bekleyen', (select count(*) from profiles p join students s on s.id::text = p.declared->>'davetStudent'
                    where p.school_id = sid and p.status = 'pending' and s.class_id = c.id))
    order by c.grade, c.section) from classes c where c.school_id = sid), '[]');
end $$;

-- Sınıfın öğrencileri ve davet durumları
create function veli_davet_sinif(p_class uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid uuid := veli_davet_yetki();
begin
  if not exists (select 1 from classes where id = p_class and school_id = sid) then raise exception 'Sınıf bulunamadı.' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'ad', s.full_name, 'no', s.school_no,
      'bagli', (select count(*) from parent_links l join profiles p on p.id = l.parent_id where l.student_id = s.id and p.status = 'approved'),
      'bekleyen', (select count(*) from profiles p where p.school_id = sid and p.status = 'pending' and p.declared->>'davetStudent' = s.id::text),
      'kod', d.kod, 'son', d.son, 'kullanim', d.kullanim, 'kart_at', d.kart_at, 'whatsapp_at', d.whatsapp_at,
      'gecerli', d.kod is not null and d.son > now() and d.kullanim < 2)
    order by s.school_no nulls last, s.full_name)
    from students s left join veli_davet d on d.student_id = s.id
    where s.class_id = p_class and s.archived_at is null), '[]');
end $$;

-- Kod hazırlar: geçerli kodu olan öğrencide aynı kodu döndürür; yoksa (ya da p_yenile) yeni kod verir.
create function veli_davet_hazirla(p_students uuid[], p_yenile boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare sid uuid := veli_davet_yetki(); s record; k text; n int := 0; r jsonb := '[]';
begin
  if coalesce(array_length(p_students, 1), 0) = 0 or array_length(p_students, 1) > 600 then
    raise exception 'Öğrenci seçilmedi.' using errcode = '22023';
  end if;
  for s in select st.id, st.full_name, coalesce(c.name, st.class_name) sinif, st.school_no
           from students st left join classes c on c.id = st.class_id
           where st.id = any(p_students) and st.school_id = sid and st.archived_at is null
           order by c.grade, c.section, st.school_no nulls last, st.full_name loop
    if p_yenile or not exists (select 1 from veli_davet d where d.student_id = s.id and d.son > now() and d.kullanim < 2) then
      loop
        k := veli_davet_kod_uret();
        exit when not exists (select 1 from veli_davet where kod = k);
      end loop;
      insert into veli_davet (student_id, school_id, kod, son, olusturan)
      values (s.id, sid, k, now() + interval '14 days', auth.uid())
      on conflict (student_id) do update set kod = excluded.kod, olustu = now(), son = excluded.son, kullanim = 0,
        kart_at = null, whatsapp_at = null, olusturan = excluded.olusturan;
      n := n + 1;
    end if;
    r := r || jsonb_build_object('id', s.id, 'ad', s.full_name, 'sinif', s.sinif, 'no', s.school_no,
      'kod', (select kod from veli_davet where student_id = s.id), 'son', (select son from veli_davet where student_id = s.id));
  end loop;
  if n > 0 then
    insert into audit_log (user_id, action, entity, entity_id, meta)
    values (auth.uid(), 'veli_davet', 'veli_davet', null, jsonb_build_object('yeni_kod', n, 'yenile', p_yenile));
  end if;
  return r;
end $$;

-- Kart basıldı / WhatsApp'tan paylaşıldı işareti
create function veli_davet_isaretle(p_students uuid[], p_tur text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare sid uuid := veli_davet_yetki();
begin
  if p_tur not in ('kart', 'whatsapp') then raise exception 'Geçersiz işaret.' using errcode = '22023'; end if;
  update veli_davet set kart_at = case when p_tur = 'kart' then now() else kart_at end,
                        whatsapp_at = case when p_tur = 'whatsapp' then now() else whatsapp_at end
  where school_id = sid and student_id = any(p_students);
end $$;

revoke all on function veli_davet_ozet(), veli_davet_sinif(uuid), veli_davet_hazirla(uuid[], boolean), veli_davet_isaretle(uuid[], text) from public, anon;
grant execute on function veli_davet_ozet(), veli_davet_sinif(uuid), veli_davet_hazirla(uuid[], boolean), veli_davet_isaretle(uuid[], text) to authenticated;
