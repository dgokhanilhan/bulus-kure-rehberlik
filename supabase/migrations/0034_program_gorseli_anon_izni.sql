-- Supabase varsayılan fonksiyon izinleri anon rolüne doğrudan EXECUTE verebilir.
-- Program içe aktarımı yalnız oturum açmış yönetici tarafından çağrılmalıdır.
revoke all on function public.import_timetable_image(uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.import_timetable_image(uuid, jsonb, jsonb, boolean) to authenticated;
