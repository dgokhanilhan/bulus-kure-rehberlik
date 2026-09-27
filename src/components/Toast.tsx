import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Show = (msg: string, icon?: IconName) => void
const Ctx = createContext<Show>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; icon: IconName; n: number } | null>(null)
  const n = useRef(0)
  const show = useCallback<Show>((msg, icon = 'check') => setT({ msg, icon, n: ++n.current }), [])
  return (
    <Ctx.Provider value={show}>
      {children}
      <div id="toast" role="status" aria-live="polite" key={t?.n} className={t ? 'show' : ''}>
        {t && (
          <>
            <Icon name={t.icon} size={18} stroke={2.4} />
            <span>{t.msg}</span>
          </>
        )}
      </div>
    </Ctx.Provider>
  )
}
