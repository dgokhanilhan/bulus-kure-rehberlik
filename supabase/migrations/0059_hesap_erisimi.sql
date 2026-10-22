-- Yönetici, öğrenci / öğretmen / veli hesabının e-postasını değiştirir ve yeni şifre verir (Edge Function admin-davet:
-- set_email, set_password). Şifreler yalnız özet (hash) olarak tutulur; kimse mevcut şifreyi göremez. Yeni şifre verilince
-- kişinin açık oturumları kapatılır (eski şifreyle açılmış cihazlar yeniden giriş yapar). Bu fonksiyonu yalnız service_role çağırır.
-- Geri alma: supabase/geri-alma/0059_hesap_erisimi_geri_al.sql
create function hesap_oturumlarini_kapat(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from auth.sessions where user_id = p_user;
end $$;
revoke all on function hesap_oturumlarini_kapat(uuid) from public, anon, authenticated;
grant execute on function hesap_oturumlarini_kapat(uuid) to service_role;
