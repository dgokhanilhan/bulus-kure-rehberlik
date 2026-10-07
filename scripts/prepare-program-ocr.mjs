import { mkdir, copyFile, readdir } from 'node:fs/promises'
const dest = 'public/program-ocr'
await mkdir(dest, { recursive: true })
await copyFile('node_modules/tesseract.js/dist/worker.min.js', `${dest}/worker.min.js`)
for (const file of await readdir('node_modules/tesseract.js-core')) {
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(file)) await copyFile(`node_modules/tesseract.js-core/${file}`, `${dest}/${file}`)
}
for (const lang of ['tur', 'eng']) await copyFile(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `${dest}/${lang}.traineddata.gz`)
