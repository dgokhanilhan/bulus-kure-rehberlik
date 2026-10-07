// Mobil uygulama (Capacitor) ile web aynı koddan derlenir. MOBIL derleme anında belirlenir (vite --mode mobil),
// böylece mobilde kapalı olan kod yolları web paketine de mobil pakete de gereksiz yük bindirmez.
/** iOS / Android uygulama paketi mi? (vite.config.ts → define) */
export const MOBIL = import.meta.env.VITE_MOBIL === '1'

/**
 * Deneme PDF'ini okuma (MuPDF, AGPL-3.0) mobil pakette yok: uygulama mağazası koşulları AGPL ile bağdaşmaz ve
 * MuPDF'in lisansı okulun değil (docs/mobil.md). PDF yükleme bilgisayardan web sitesinde yapılır.
 */
export const PDF_OKUMA = !MOBIL
