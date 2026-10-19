// ÖSYM "Tablo-4 En Küçük ve En Büyük Puanlar" (lisans) Excel'inden yerleşik hedef programları migration'ı üretir.
// Kullanım: npx jiti scripts/osym-tablo4-sql.ts <tablo4.xlsx> <yıl> <kaynak-url> > supabase/migrations/00NN_yks_<yıl>_tablo4.sql
// Okuma kuralları src/lib/hedef.ts (osymTablo4) ile aynıdır; uygulamadaki Excel yüklemesi de aynı fonksiyonu kullanır.
import { readFileSync } from 'node:fs'
import readXlsxFile from 'read-excel-file/node'
import { osymTablo4 } from '../src/lib/hedef'

const [file, yilS, kaynak] = process.argv.slice(2)
if (!file || !yilS || !kaynak) throw new Error('Kullanım: <tablo4.xlsx> <yıl> <kaynak-url>')
const yil = Number(yilS)
const { programlar, atlanan, hata } = osymTablo4((await readXlsxFile(readFileSync(file))) as unknown[][], yil)
if (hata) throw new Error(hata)
const q = (v: string | null | undefined) => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`)
const n = (v: number | null | undefined) => (v == null ? 'null' : String(v))
const out: string[] = [
  `-- ${yil}-YKS lisans programları: ÖSYM "En Küçük ve En Büyük Puanlar (TABLO-4)", genel kontenjan. Yerleşik satırlar (school_id boş).`,
  `-- Kaynak: ${kaynak}`,
  `-- ${programlar.length} program; ${atlanan} satır okunamadı. Üretim: scripts/osym-tablo4-sql.ts. Yalnız ekleme; tekrar çalıştırılabilir.`,
  `-- Geri alma: delete from hedef_programlar where school_id is null and sinav = 'YKS' and yil = ${yil};`,
]
for (let i = 0; i < programlar.length; i += 500) {
  const part = programlar.slice(i, i + 500)
  out.push('insert into hedef_programlar (school_id, sinav, yil, kod, kurum, il, birim, program, puan_turu, taban_puan, tavan_puan, kontenjan, yerlesen, kaynak) values')
  out.push(
    part
      .map((p) => `(null,'YKS',${yil},${q(p.kod)},${q(p.kurum)},${q(p.il)},${q(p.birim)},${q(p.program)},${q(p.puan_turu)},${n(p.taban_puan)},${n(p.tavan_puan)},${n(p.kontenjan)},${n(p.yerlesen)},'ÖSYM ${yil} Tablo-4')`)
      .join(',\n'),
  )
  out.push(`on conflict (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), sinav, yil, kod) do nothing;`)
}
process.stdout.write(out.join('\n') + '\n')
