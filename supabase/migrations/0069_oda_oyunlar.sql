-- Öğretmenler Odası (2/3): oyunlar ve haftalık lig. Yalnız öğretmenler (is_teacher); veli/öğrenci hiçbir satırı göremez.
-- Günün Sudokusu ve Günün Kelimesi sunucuda üretilir ve doğrulanır (cevap tarayıcıya gitmez, süre sunucuda ölçülür).
-- Yılan, Hesap Sprinti, Mayın Tarlası, Hafıza Kartları tarayıcıda oynanır; skor makul sınırlarla kaydedilir (hile geçirmez değil).
-- Lig: her hafta (Pazartesi–Pazar) her oyunun sıralamasına göre puan; skor tablosundan çıkmak isteyen gizlenebilir.
-- Yalnız ekleme. Geri alma: supabase/geri-alma/0069_oda_oyunlar_geri_al.sql

create table oda_oyun (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  oyun text not null check (oyun in ('sudoku', 'kelime', 'yilan', 'sprint', 'mayin', 'hafiza')),
  gun date not null default tr_today(),
  -- Sudoku/Mayın/Hafıza: saniye (az olan iyi); Kelime: deneme sayısı (az olan iyi, 7 = bulamadı); Yılan/Sprint: puan (çok olan iyi)
  puan int,
  basladi timestamptz not null default now(),
  bitti timestamptz,
  durum jsonb not null default '{}'::jsonb
);
create unique index oda_oyun_gunluk on oda_oyun (user_id, oyun, gun) where oyun in ('sudoku', 'kelime');
create index oda_oyun_tablo on oda_oyun (school_id, oyun, gun) where bitti is not null;
alter table oda_oyun enable row level security;
-- Doğrudan yazma yok: yalnız aşağıdaki fonksiyonlar. Okuma: okulun öğretmenleri (skor tablosu); durum (kelime tahminleri) yalnız sahibine RPC ile.
create policy oda_oyun_oku on oda_oyun for select to authenticated using (school_id = my_school() and is_teacher() and bitti is not null);
revoke all on oda_oyun from anon, authenticated;
grant select (id, school_id, user_id, oyun, gun, puan, bitti) on oda_oyun to authenticated;

create table oda_oyun_tercih (
  user_id uuid primary key references profiles(id) on delete cascade,
  gizli boolean not null default false
);
alter table oda_oyun_tercih enable row level security;
create policy oda_oyun_tercih_kendi on oda_oyun_tercih for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and is_teacher());
revoke all on oda_oyun_tercih from anon;
grant select, insert, update on oda_oyun_tercih to authenticated;

-- ---------- Deterministik rastgele (gün + sayaç) ----------
create function oda_rs(tohum text, i int) returns bigint language sql immutable as $$
  select ('x' || substr(md5(tohum || ':' || i), 1, 8))::bit(32)::bigint
$$;

-- ---------- Günün Sudokusu: bütün okul aynı bulmacayı çözer ----------
create function oda_sudoku_uret(g date, out cozum int[], out ipucu int[]) language plpgsql immutable as $$
declare
  t text := 'sudoku:' || g;
  bant int[]; satir int[] := '{}'; sutun int[] := '{}'; rakam int[]; ic int[]; b int; r int; c int; k int; ver int;
begin
  select array_agg(x order by oda_rs(t, 10 + x)) into bant from generate_series(0, 2) x;
  foreach b in array bant loop
    select array_agg(b * 3 + x order by oda_rs(t, 20 + b * 3 + x)) into ic from generate_series(0, 2) x;
    satir := satir || ic;
  end loop;
  select array_agg(x order by oda_rs(t, 40 + x)) into bant from generate_series(0, 2) x;
  foreach b in array bant loop
    select array_agg(b * 3 + x order by oda_rs(t, 50 + b * 3 + x)) into ic from generate_series(0, 2) x;
    sutun := sutun || ic;
  end loop;
  select array_agg(x order by oda_rs(t, 70 + x)) into rakam from generate_series(1, 9) x;
  cozum := array_fill(0, array[81]);
  for r in 0..8 loop
    for c in 0..8 loop
      cozum[r * 9 + c + 1] := rakam[((3 * (satir[r + 1] % 3) + satir[r + 1] / 3 + sutun[c + 1]) % 9) + 1];
    end loop;
  end loop;
  -- Hafta içi 34, hafta sonu 30 ipucu
  ver := case when extract(isodow from g) >= 6 then 30 else 34 end;
  ipucu := array_fill(0, array[81]);
  for k in select x from generate_series(1, 81) x order by oda_rs(t, 100 + x) limit ver loop
    ipucu[k] := cozum[k];
  end loop;
end $$;

create function oda_sudoku_gecerli(a int[], ipucu int[]) returns boolean language sql immutable as $$
  select array_length(a, 1) = 81
     and not exists (select 1 from generate_series(1, 81) i where a[i] is null or a[i] < 1 or a[i] > 9 or (ipucu[i] > 0 and a[i] <> ipucu[i]))
     and not exists (
       select 1 from generate_series(0, 8) g, lateral (
         select count(distinct a[g * 9 + x + 1]) s, count(distinct a[x * 9 + g + 1]) u,
                count(distinct a[((g / 3) * 3 + x / 3) * 9 + (g % 3) * 3 + x % 3 + 1]) k
         from generate_series(0, 8) x) q
       where q.s <> 9 or q.u <> 9 or q.k <> 9)
$$;

-- Bugünkü bulmacayı aç (ilk açılışta süre başlar). Dönen: ipuçları, başlangıç, bitti ise puan.
create function oda_sudoku_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; u record;
begin
  if not is_teacher() then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun) values (my_school(), auth.uid(), 'sudoku', g)
    on conflict (user_id, oyun, gun) where oyun in ('sudoku', 'kelime') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g;
  select * into u from oda_sudoku_uret(g);
  return jsonb_build_object('gun', g, 'ipucu', to_jsonb(u.ipucu), 'basladi', s.basladi, 'bitti', s.bitti, 'puan', s.puan,
                            'cozum', case when s.bitti is not null then to_jsonb(u.cozum) end);
end $$;

-- Çözümü gönder: doğruysa süre (sn) puan olur. Yanlışsa hangi hücrelerin çeliştiği söylenmez; yalnız "henüz değil".
create function oda_sudoku_bitir(p int[]) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; u record; sn int;
begin
  if not is_teacher() then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and gun = g for update;
  if s.id is null then raise exception 'Önce bulmacayı aç'; end if;
  if s.bitti is not null then return jsonb_build_object('dogru', true, 'puan', s.puan); end if;
  select * into u from oda_sudoku_uret(g);
  if not oda_sudoku_gecerli(p, u.ipucu) then return jsonb_build_object('dogru', false); end if;
  sn := greatest(1, extract(epoch from now() - s.basladi)::int);
  update oda_oyun set bitti = now(), puan = sn where id = s.id;
  return jsonb_build_object('dogru', true, 'puan', sn);
end $$;

-- ---------- Günün Kelimesi: 5 harf, 6 hak; cevap tarayıcıya yalnız oyun bitince gider ----------
create table oda_kelime (k text primary key check (char_length(k) = 5 and k ~ '^[abcçdefgğhıijklmnoöprsştuüvyz]{5}$'));
alter table oda_kelime enable row level security; -- kural yok: yalnız fonksiyonlar okur
revoke all on oda_kelime from anon, authenticated;
insert into oda_kelime (k) values ('kalem'), ('kitap'), ('sınıf'), ('bahçe'), ('balık'), ('bilgi'), ('çiçek'), ('deniz'), ('dünya'), ('elmas'),
  ('fidan'), ('güneş'), ('ırmak'), ('insan'), ('kapak'), ('kaşık'), ('kavun'), ('kiraz'), ('konum'), ('kumaş'),
  ('limon'), ('masal'), ('meyve'), ('müzik'), ('nehir'), ('orman'), ('palto'), ('pazar'), ('perde'), ('pilav'),
  ('radyo'), ('resim'), ('saray'), ('sabah'), ('sebze'), ('şehir'), ('şeker'), ('tabak'), ('tahta'), ('tavuk'),
  ('tepsi'), ('yazar'), ('adres'), ('akşam'), ('alarm'), ('altın'), ('aslan'), ('ayran'), ('bakır'), ('balon'),
  ('banka'), ('başak'), ('beyaz'), ('bıçak'), ('biber'), ('bulut'), ('cadde'), ('ceket'), ('çanta'), ('çatal'),
  ('çadır'), ('çorba'), ('damla'), ('dolap'), ('duvar'), ('ekmek'), ('fener'), ('fırın'), ('gölge'), ('haber'),
  ('hamur'), ('hayat'), ('hesap'), ('horoz'), ('iplik'), ('kabak'), ('kahve'), ('kanat'), ('kasap'), ('kayık'),
  ('kazak'), ('keman'), ('kemik'), ('kömür'), ('kulak'), ('lamba'), ('liman'), ('lokum'), ('marul'), ('merak'),
  ('mısır'), ('nokta'), ('paket'), ('pamuk'), ('pasta'), ('rakam'), ('roman'), ('sabun'), ('sahil'), ('salon'),
  ('satır'), ('sayfa'), ('sepet'), ('sevgi'), ('silgi'), ('sinek'), ('soğan'), ('sokak'), ('sorun'), ('şapka'),
  ('şarkı'), ('tarla'), ('tatil'), ('tavan'), ('teyze'), ('tohum'), ('tören'), ('vatan'), ('yayla'), ('yemek'),
  ('yolcu'), ('zaman'), ('zemin'), ('dergi'), ('defne'), ('hırka'), ('kiler'), ('kovan'), ('ördek'), ('roket'),
  ('sınav'), ('kural'), ('ölçek'), ('sıcak'), ('soğuk'), ('temiz'), ('keyif'), ('dilim'), ('gönül'), ('hafta'),
  ('kader'), ('kalıp'), ('kanun'), ('kenar'), ('model'), ('nazik'), ('parti'), ('pembe'), ('radar'), ('sakin'),
  ('saygı'), ('seçim'), ('sergi'), ('sıfır'), ('tahin'), ('tekne'), ('yayın'), ('yetki'), ('yürek'), ('zirve'),
  ('armut'), ('boyut'), ('cevap'), ('çevre'), ('düğme'), ('durak'), ('ekran'), ('erkek'), ('fikir'), ('geçit'),
  ('gelin'), ('gümüş'), ('havuç'), ('hızlı'), ('işlem'), ('kasım'), ('kayak'), ('kirpi'), ('koyun'), ('kuzey'),
  ('lider'), ('masum'), ('mutlu'), ('ödünç'), ('pınar'), ('sakız'), ('sesli'), ('simit'), ('soyut'), ('şimdi'),
  ('tavla'), ('tilki'), ('toplu'), ('turşu'), ('vagon'), ('yalın'), ('yarın'), ('yaşam'), ('yokuş'), ('yulaf');

create function oda_kelime_gunun(g date) returns text language sql stable security definer set search_path = public as $$
  select k from oda_kelime order by md5('kelime:' || g || ':' || k) limit 1
$$;
revoke all on function oda_kelime_gunun(date) from public, anon, authenticated;

-- Tahminin renkleri: 2 = doğru yer, 1 = kelimede var, 0 = yok (tekrarlı harfler doğru sayılır)
create function oda_kelime_renk(t text, c text) returns int[] language plpgsql immutable as $$
declare r int[] := array[0,0,0,0,0]; kalan text[] := array[]::text[]; i int; j int;
begin
  for i in 1..5 loop
    if substr(t, i, 1) = substr(c, i, 1) then r[i] := 2; else kalan := kalan || substr(c, i, 1); end if;
  end loop;
  for i in 1..5 loop
    if r[i] = 0 then
      j := array_position(kalan, substr(t, i, 1));
      if j is not null then r[i] := 1; kalan := kalan[1:j-1] || kalan[j+1:]; end if;
    end if;
  end loop;
  return r;
end $$;

create function oda_kelime_durum_of(s oda_oyun) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c text := oda_kelime_gunun(s.gun);
begin
  return jsonb_build_object(
    'gun', s.gun, 'bitti', s.bitti, 'puan', s.puan,
    'tahminler', coalesce((select jsonb_agg(jsonb_build_object('t', x, 'r', to_jsonb(oda_kelime_renk(x, c))) order by o)
                           from jsonb_array_elements_text(coalesce(s.durum->'tahminler', '[]')) with ordinality as a(x, o)), '[]'),
    'cevap', case when s.bitti is not null then c end);
end $$;
revoke all on function oda_kelime_durum_of(oda_oyun) from public, anon, authenticated;

create function oda_kelime_ac() returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun;
begin
  if not is_teacher() then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  insert into oda_oyun (school_id, user_id, oyun, gun, durum) values (my_school(), auth.uid(), 'kelime', g, '{"tahminler":[]}')
    on conflict (user_id, oyun, gun) where oyun in ('sudoku', 'kelime') do nothing;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and gun = g;
  return oda_kelime_durum_of(s);
end $$;

create function oda_kelime_tahmin(p text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g date := tr_today(); s oda_oyun; c text; n int;
begin
  if not is_teacher() then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  if p is null or char_length(p) <> 5 or p !~ '^[abcçdefgğhıijklmnoöprsştuüvyz]{5}$' then raise exception 'Beş harfli bir kelime yaz'; end if;
  select * into s from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and gun = g for update;
  if s.id is null then raise exception 'Önce oyunu aç'; end if;
  if s.bitti is not null then return oda_kelime_durum_of(s); end if;
  c := oda_kelime_gunun(g);
  s.durum := jsonb_set(coalesce(s.durum, '{}'), '{tahminler}', coalesce(s.durum->'tahminler', '[]') || to_jsonb(p));
  n := jsonb_array_length(s.durum->'tahminler');
  if p = c then s.bitti := now(); s.puan := n;
  elsif n >= 6 then s.bitti := now(); s.puan := 7;
  end if;
  update oda_oyun set durum = s.durum, bitti = s.bitti, puan = s.puan where id = s.id;
  return oda_kelime_durum_of(s);
end $$;

-- ---------- Tarayıcıda oynanan oyunlar: skor kaydı (makul sınırlar; günde oyun başına en çok 40 kayıt) ----------
-- Yılan ve Hesap Sprinti: puan (çok olan iyi). Mayın Tarlası ve Hafıza Kartları: saniye (az olan iyi).
create function oda_skor_kaydet(p_oyun text, p_puan int, p_sure_ms int) returns void
language plpgsql volatile security definer set search_path = public as $$
declare ust int; alt_sure int;
begin
  if not is_teacher() then raise exception 'Yalnız öğretmenler' using errcode = '42501'; end if;
  case p_oyun
    when 'yilan' then ust := 2000; alt_sure := coalesce(p_puan, 0) * 60;
    when 'sprint' then ust := 150; alt_sure := 59000;
    when 'mayin' then ust := 3600; alt_sure := coalesce(p_puan, 0) * 1000 - 1500;
    when 'hafiza' then ust := 3600; alt_sure := coalesce(p_puan, 0) * 1000 - 1500;
    else raise exception 'Bilinmeyen oyun';
  end case;
  if p_puan is null or p_puan < 0 or p_puan > ust or p_sure_ms is null or p_sure_ms < alt_sure or p_sure_ms > 3600000 then
    raise exception 'Skor kaydedilemedi';
  end if;
  if p_oyun in ('mayin', 'hafiza') and p_puan < 5 then raise exception 'Skor kaydedilemedi'; end if;
  if (select count(*) from oda_oyun where user_id = auth.uid() and oyun = p_oyun and gun = tr_today()) >= 40 then
    raise exception 'Bugünlük bu kadar, yarın yine gel';
  end if;
  insert into oda_oyun (school_id, user_id, oyun, gun, puan, basladi, bitti)
  values (my_school(), auth.uid(), p_oyun, tr_today(), p_puan, now() - make_interval(secs => p_sure_ms / 1000.0), now());
end $$;

-- ---------- Skor tablosu ve haftalık lig ----------
create function oda_hafta_basi() returns date language sql stable as $$
  select tr_today() - (extract(isodow from tr_today())::int - 1)
$$;

-- Dönem: 'gun' (bugün) ya da 'hafta' (bu Pazartesi–Pazar). Kişi başına en iyi skor; gizlenenler çıkar (kendisi hariç).
create function oda_skor_tablosu(p_oyun text, p_donem text default 'gun')
returns table (sira int, user_id uuid, ad text, puan int, ben boolean)
language sql stable security definer set search_path = public as $$
  with b as (
    select o.user_id, case when p_oyun in ('yilan', 'sprint') then max(o.puan) else min(o.puan) end p
    from oda_oyun o
    where is_teacher() and o.school_id = my_school() and o.oyun = p_oyun and o.bitti is not null and o.puan is not null
      and o.gun between (case when p_donem = 'hafta' then oda_hafta_basi() else tr_today() end) and tr_today()
      and (o.oyun <> 'kelime' or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by o.user_id
  )
  select (rank() over (order by case when p_oyun in ('yilan', 'sprint') then -b.p else b.p end))::int, b.user_id, pr.full_name, b.p, b.user_id = auth.uid()
  from b join profiles pr on pr.id = b.user_id
  order by 1, 3
  limit 50
$$;

-- Haftalık lig: her oyunun haftalık sıralamasında 1. 10, 2. 8, 3. 6, 4. 5, 5. 4, sonrakiler 2 puan (katılım)
create function oda_lig(p_hafta_basi date default null)
returns table (sira int, user_id uuid, ad text, puan int, oyun_sayisi int, ben boolean)
language sql stable security definer set search_path = public as $$
  with h as (select coalesce(p_hafta_basi, oda_hafta_basi()) b),
  en as (
    select o.oyun, o.user_id, case when o.oyun in ('yilan', 'sprint') then -max(o.puan) else min(o.puan) end k
    from oda_oyun o, h
    where is_teacher() and o.school_id = my_school() and o.bitti is not null and o.puan is not null
      and o.gun between h.b and h.b + 6 and (o.oyun <> 'kelime' or o.puan <= 6)
      and (o.user_id = auth.uid() or not coalesce((select t.gizli from oda_oyun_tercih t where t.user_id = o.user_id), false))
    group by o.oyun, o.user_id
  ),
  s as (select oyun, user_id, rank() over (partition by oyun order by k) r from en),
  t as (select user_id, sum(case r when 1 then 10 when 2 then 8 when 3 then 6 when 4 then 5 when 5 then 4 else 2 end)::int p, count(*)::int n
        from s group by user_id)
  select (rank() over (order by t.p desc))::int, t.user_id, pr.full_name, t.p, t.n, t.user_id = auth.uid()
  from t join profiles pr on pr.id = t.user_id
  order by 1, 3
  limit 50
$$;

-- Rozetler için kendi istatistiğim
create function oda_oyun_istatistik() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'toplam', (select count(*) from oda_oyun where user_id = auth.uid() and bitti is not null),
    'sudoku', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and bitti is not null),
    'sudoku_en_iyi', (select min(puan) from oda_oyun where user_id = auth.uid() and oyun = 'sudoku' and bitti is not null),
    'kelime_bulunan', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and puan <= 6),
    'kelime_ikide', (select count(*) from oda_oyun where user_id = auth.uid() and oyun = 'kelime' and puan <= 2),
    'yilan_en_iyi', (select max(puan) from oda_oyun where user_id = auth.uid() and oyun = 'yilan'),
    'sprint_en_iyi', (select max(puan) from oda_oyun where user_id = auth.uid() and oyun = 'sprint'),
    'oyun_turu', (select count(distinct oyun) from oda_oyun where user_id = auth.uid() and bitti is not null),
    'gunler', (select coalesce(jsonb_agg(g order by g desc), '[]') from (select distinct gun g from oda_oyun
               where user_id = auth.uid() and bitti is not null and gun > tr_today() - 60) d))
  where is_teacher()
$$;

do $$ declare f text; begin
  foreach f in array array['oda_sudoku_ac()', 'oda_sudoku_bitir(int[])', 'oda_kelime_ac()', 'oda_kelime_tahmin(text)',
    'oda_skor_kaydet(text, int, int)', 'oda_skor_tablosu(text, text)', 'oda_lig(date)', 'oda_oyun_istatistik()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function oda_sudoku_uret(date), oda_sudoku_gecerli(int[], int[]), oda_kelime_renk(text, text), oda_rs(text, int) from public, anon;
revoke all on function oda_sudoku_uret(date) from authenticated; -- çözüm yalnız bitince (oda_sudoku_ac) gider
grant execute on function oda_sudoku_uret(date) to service_role;
