// design/tokens.json → src/styles/tokens.css
// Token'lar tek kaynaktan gelir; bu dosyayı elle düzenleme, `npm run tokens` çalıştır.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const t = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8'))

// Prototipte kullanılan, tokens.json'da adı olmayan türetilmiş tonlar (kenar, ikincil zemin).
// Yeni anlam taşımazlar; yalnız ayırıcı / hover tonlarıdır.
const derived = {
  'ink-2': { light: '#3b4a50', dark: '#d3d9d8' },
  'primary-line': { light: '#c5dcd7', dark: '#2d5652' },
  'bar-soft': { light: '#cfe0dc', dark: '#2d5652' },
  'signal-line': { light: '#f0c6a6', dark: '#6a4128' },
  'nav-2': { light: '#24363b', dark: '#16242a' },
  'nav-active': { light: '#2e4349', dark: '#24363b' },
  // Açık turuncu zemin ve paper üzerindeki turuncu METİN (WCAG AA 4.5:1). signal dolgu/ikon için kalır.
  'signal-ink': { light: '#a14a16', dark: '#f0a36b' },
}

const colors = [...t.color.tokens.map((x) => [x.name, x.value]), ...Object.entries(derived)]
const block = (mode) => colors.map(([n, v]) => `  --${n}: ${v[mode]};`).join('\n')

const scalar = [
  ...t.spacing.tokens.map((x) => [x.name, x.value]),
  ...t.radius.tokens.map((x) => [x.name, x.value]),
  ...t.size.tokens.map((x) => [x.name, x.value]),
  ['font-display', t.type.families.display],
  ['font-sans', t.type.families.sans],
  ['font-mono', t.type.families.mono],
]

const typeRules = t.type.groups
  .flatMap((g) =>
    g.styles.map(
      (s) =>
        `.t-${s.name} { font-family: var(--font-${g.family}); font-size: ${s.fontSize}; line-height: ${s.lineHeight}; font-weight: ${s.fontWeight};${
          s.letterSpacing ? ` letter-spacing: ${s.letterSpacing};` : ''
        }${g.family === 'mono' ? ' font-variant-numeric: tabular-nums;' : ''} }`,
    ),
  )
  .join('\n')

// Tailwind v4: token'ları yardımcı sınıf olarak aç (bg-paper, text-ink, rounded-lg …).
const theme = [
  ...colors.map(([n]) => `  --color-${n}: var(--${n});`),
  ...t.radius.tokens.map((x) => `  --radius-${x.name.replace('radius-', '')}: var(--${x.name});`),
  `  --font-display: ${t.type.families.display};`,
  `  --font-sans: ${t.type.families.sans};`,
  `  --font-mono: ${t.type.families.mono};`,
].join('\n')

const css = `/* OTOMATİK ÜRETİLDİ — scripts/gen-tokens.mjs (${t.name} v${t.version}). Elle düzenleme. */
:root {
${block('light')}
${scalar.map(([n, v]) => `  --${n}: ${v};`).join('\n')}
  --shadow: 0 1px 2px rgba(27, 42, 47, 0.08), 0 8px 24px rgba(27, 42, 47, 0.06);
  --ease: cubic-bezier(0.2, 0.75, 0.2, 1);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${block('dark').replace(/^/gm, '  ')}
  }
}
:root[data-theme='dark'] {
  color-scheme: dark;
${block('dark')}
}

@theme inline {
${theme}
}

${typeRules}
`

mkdirSync(new URL('../src/styles/', import.meta.url), { recursive: true })
writeFileSync(new URL('../src/styles/tokens.css', import.meta.url), css)
console.log(`tokens.css: ${colors.length} renk, ${scalar.length} ölçü`)
