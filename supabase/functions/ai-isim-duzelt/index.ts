// Öğrenci isimleri dış sağlayıcıya gönderilmez; eski istemciler de durdurulur.
import { cors, json } from '../_shared/ai.ts'
Deno.serve((req) => req.method === 'OPTIONS'
  ? new Response('ok', { headers: cors })
  : json({ error: 'disabled', message: 'İsim eşleştirme cihazda yapılır.' }, 410))
