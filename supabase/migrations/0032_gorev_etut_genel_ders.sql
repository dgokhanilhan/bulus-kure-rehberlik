-- Görev ve etüt: 5–12 genel denemelerin dersleri ve yeni kazanım kataloğu.
-- Neden: tasks.subject ve study_sessions.subject "subject_code" enum'u (yalnız 6 LGS dersi); tasks.outcome_code yalnız eski 8. sınıf
-- kazanım tablosuna bağlı. 6. sınıf TYMM öğrenme çıktısına ya da 12. sınıf Fizik kazanımına görev atanamıyor, 6/A için etüt açılamıyordu.
-- YALNIZ EKLEME: enum'a değer eklenir (mevcut değerler ve satırlar değişmez); görevlere isteğe bağlı yeni katalog bağlantısı.
alter type subject_code add value if not exists 'SOS';
alter type subject_code add value if not exists 'TDE';
alter type subject_code add value if not exists 'TAR';
alter type subject_code add value if not exists 'COG';
alter type subject_code add value if not exists 'FEL';
alter type subject_code add value if not exists 'FIZ';
alter type subject_code add value if not exists 'KIM';
alter type subject_code add value if not exists 'BIY';

alter table tasks add column if not exists learning_outcome_id uuid references learning_outcomes(id) on delete set null;
create index if not exists tasks_learning_outcome on tasks (learning_outcome_id) where learning_outcome_id is not null;
