import type { ErrorEvent } from '@sentry/react'

/** Serbest metin, URL parametresi ve kullanıcı bağlamı dış servise gitmez. */
export function minimalErrorEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id, timestamp: event.timestamp, platform: event.platform,
    release: event.release, environment: event.environment, level: event.level,
    exception: { values: event.exception?.values?.map((ex) => ({
      type: ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError', 'URIError', 'EvalError'].includes(ex.type ?? '') ? ex.type : 'Error',
      value: 'Uygulama hatası (kişisel ayrıntılar çıkarıldı)',
      stacktrace: { frames: ex.stacktrace?.frames?.filter((f) =>
        !!f.filename && /\/assets\/[^/?#]+\.(?:js|mjs)(?:[?#]|$)/.test(f.filename),
      ).map((f) => ({
        filename: f.filename!.split(/[?#]/)[0], lineno: f.lineno,
        colno: f.colno, in_app: f.in_app,
      })) },
    })) },
  }
}
