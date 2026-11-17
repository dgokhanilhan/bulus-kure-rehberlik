import type { ReactNode } from 'react'

/** Native details: klavye ve Safari ile çalışır, içerik kapalıyken odaklanılmaz. */
export function AnalysisDisclosure({ title, count, countLabel = 'hedef', children, testId }: { title: string; count?: number; countLabel?: string; children: ReactNode; testId?: string }) {
  return <details className="analysis-disclosure" data-testid={testId}>
    <summary><span>{title}</span>{count !== undefined && <span className="chip n">{count} {countLabel}</span>}</summary>
    <div className="analysis-disclosure-body">{children}</div>
  </details>
}
