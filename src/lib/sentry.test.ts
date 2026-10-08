import { expect, it } from 'vitest'
import { minimalErrorEvent } from './sentryPrivacy'
it('kurtarma tokenı, öğrenci bilgisi ve serbest metin telemetride kalmaz', () => {
  const output = minimalErrorEvent({
    type: undefined,
    message: 'Ayşe Yıldız ayse@ornek.com', user: { id: 'private-user' },
    request: { url: 'https://okul.test/#access_token=secret-token', data: 'private-body' },
    extra: { student: 'private-student' }, tags: { name: 'private-name' },
    breadcrumbs: [{ message: 'private-message' }],
    exception: { values: [{ type: 'Error', value: 'private-error', stacktrace: { frames: [
      { filename: 'https://okul.test/ogrenciler/private-id#secret' },
      { filename: 'https://okul.test/assets/app.js?access_token=secret', lineno: 5 },
    ] } }] },
  })
  expect(JSON.stringify(output)).not.toMatch(/private|secret|Ayşe|ayse@/)
  expect(output.exception?.values?.[0]?.stacktrace?.frames).toEqual([{ filename: 'https://okul.test/assets/app.js', lineno: 5, colno: undefined, in_app: undefined }])
})
