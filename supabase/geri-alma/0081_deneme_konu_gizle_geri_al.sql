-- 0081 geri alma: veli haftalık özeti yeniden açılır; konu gizleme anahtarı ve işlevi kaldırılır (konu verisi zaten silinmemişti).
grant execute on function veli_ozet_gonder(uuid, jsonb, text) to authenticated;
drop function setting_spec();
alter function setting_spec_before_0081() rename to setting_spec;
select ayar_varsayilan_yenile();

drop function if exists set_exam_topics_hidden(uuid, boolean);
alter table exams drop column if exists topics_hidden;
