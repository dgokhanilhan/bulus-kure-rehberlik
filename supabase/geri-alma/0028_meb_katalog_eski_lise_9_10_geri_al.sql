-- 0028_meb_katalog_eski_lise_9_10 GERİ ALMA (yalnız gerekirse, elle çalıştırılır; migration değildir).
-- Satırlar SİLİNMEZ (soru eşleşmeleri bağlı olabilir): 0028'in eklediği 17 sürüm pasifleştirilir; curriculum_for() onları seçmez.
begin;
update curriculum_versions set active = false where id in (
  '101895bd-2a32-5175-a21b-537c8eb54a07', '24ee7bb6-3259-5cca-ba8d-821566f92527', '2ead857d-72a1-587a-bdd1-2ae9f6476f28', '2eba1da3-1d70-5811-b1e0-fa257d76064b', '3d67841a-f82f-571e-a56a-11f4d6ca997e', '4acc8956-2e26-55d3-b63a-102abff6938c', '4bf11454-7634-512e-a728-910cf8cee9db', '6e3380ce-86c1-5dc8-a6fa-d6d798a13c7a', '77661503-0152-54a9-9771-dd978b7be96c', '7e94c6e6-07d1-5862-a946-e6cb96948a2b', '9790fe19-e4e7-50d9-9f95-d71ccae7a756', 'a1571f77-05c7-5149-8d33-b25244925525', 'a2c46abd-700f-5ee8-8940-72eb6b225260', 'd07ef697-3789-52a6-81ed-3e135c36c970', 'f06f263e-0353-52cc-a8e7-40bc544a896b', 'f4963a6a-871f-5733-8918-b0c071ee6083', 'fa5b0a19-28e4-5241-9d6c-a50ca1d2ff8c'
);
commit;
