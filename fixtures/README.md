# Deneme PDF regresyonu

- `pdf/` — gerçek deneme sonuç PDF'leri (Hız, ATA, TÖDER…). **Git'e girmez** (gerçek öğrenci verisi, KVKK).
- `beklenen/` — her PDF için motorun okuduğu sonuçların **maskeli** özeti (öğrenci adı/numarası yok):
  sayfa, şube, puan, toplam net ve her ders için [D, Y, B, net]. Bu klasör repoya girer.

## Kullanım
1. PDF'leri `fixtures/pdf/` içine koy (ör. `hiz-tg5.pdf`, `ata-tg2.pdf`, `toder-tg4.pdf`).
2. İlk kez: `npm run regresyon:kaydet` → `beklenen/*.json` oluşur. **Birkaç öğrenciyi PDF'le elle karşılaştırıp doğrula.**
3. Sonra her değişiklikte `npm run test` bu sonuçları birebir karşılaştırır. Sonuç (D/Y/B/net/puan) kazanım
   okumasından bağımsızdır; kazanım okuma geliştirmesi bu sayıları değiştirirse test kırılır (CLAUDE.md §2).
