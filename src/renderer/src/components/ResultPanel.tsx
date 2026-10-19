import type { TaskResult } from '../../../shared/types'

type Props = {
  result: TaskResult | null
  error: string | null
  successText?: (r: TaskResult) => string
}

/** 统一的「结果 + 打开文件夹」面板 */
export default function ResultPanel({ result, error, successText }: Props) {
  if (error) {
    return (
      <div className="result err">
        <strong>出错了</strong>
        <div className="err-line">{error}</div>
      </div>
    )
  }

  if (!result) return null

  const text = successText
    ? successText(result)
    : result.failed === 0
      ? `全部完成，共 ${result.succeeded} 个文件。`
      : `完成：成功 ${result.succeeded} 个，失败 ${result.failed} 个。`

  const openTarget = result.outDir ?? result.outputs[0]

  return (
    <div className={`result ${result.failed === 0 ? 'ok' : 'err'}`}>
      <strong>{result.failed === 0 ? '✓ 完成' : '⚠ 部分失败'}</strong>
      <div>{text}</div>

      {result.errors.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {result.errors.slice(0, 8).map((e, i) => (
            <div className="err-line" key={i}>
              {e.input.split(/[\\/]/).pop()}：{e.message}
            </div>
          ))}
          {result.errors.length > 8 && (
            <div className="err-line">…还有 {result.errors.length - 8} 个失败项</div>
          )}
        </div>
      )}

      {openTarget && (
        <div className="actions">
          <button className="btn small" onClick={() => window.api.reveal(openTarget)}>
            打开所在文件夹
          </button>
          {result.outputs.length === 1 && (
            <button className="btn small ghost" onClick={() => window.api.openPath(result.outputs[0])}>
              打开文件
            </button>
          )}
        </div>
      )}
    </div>
  )
}
