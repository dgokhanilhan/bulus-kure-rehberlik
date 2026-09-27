import { useState } from 'react'
import { Modal } from './Modal'
import { Icon } from './Icon'

/** Geri alınamaz silme onayı: kullanıcı adı birebir yazmadan düğme açılmaz. */
export function ConfirmDelete({
  title,
  name,
  children,
  onConfirm,
  onClose,
}: {
  title: string
  name: string
  children: React.ReactNode
  onConfirm: () => Promise<string | null>
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ok = typed.trim().toLocaleLowerCase('tr') === name.trim().toLocaleLowerCase('tr')
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn warn"
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true)
              const e = await onConfirm()
              setBusy(false)
              if (e) setErr(e)
            }}
          >
            <Icon name="trash" size={16} />
            Kalıcı olarak sil
          </button>
        </>
      }
    >
      <div className="issue card" style={{ borderWidth: 1.5 }}>
        <span className="t">GERİ ALINAMAZ</span>
        <div style={{ fontSize: 14 }}>{children}</div>
      </div>
      <label className="field" htmlFor="confirmName">
        Onaylamak için “{name}” yaz
        <input id="confirmName" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}
