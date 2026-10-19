import type { ProgressEvent } from '../../../shared/types'

export function ProgressBar({ progress }: { progress: ProgressEvent }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-text">
        <span className="cur">{progress.current || '处理中…'}</span>
        <span>
          {progress.done} / {progress.total}
        </span>
      </div>
    </div>
  )
}
