import { useState } from 'react'
import { Modal } from './Modal'

/** Geri alınabilir ama etkisi geniş işlemler için tek adımlı onay (modül kapatma, arşivleme, atama kaldırma…). */
export function Confirm({
  title,
  action,
  children,
  onConfirm,
  onClose,
  warn,
}: {
  title: string
  action: string
  children: React.ReactNode
  onConfirm: () => Promise<string | null | void>
  onClose: () => void
  warn?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
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
            className={`btn ${warn ? 'warn' : 'pri'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const e = await onConfirm()
              setBusy(false)
              if (e) setErr(e)
            }}
          >
            {busy && <span className="spinner" aria-hidden="true" />} {action}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 14 }}>{children}</div>
      {err && (
        <div className="err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  )
}
