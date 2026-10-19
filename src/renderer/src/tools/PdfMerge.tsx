import { useState } from 'react'
import FilePicker from '../components/FilePicker'
import { ProgressBar } from '../components/ProgressBar'
import ResultPanel from '../components/ResultPanel'
import { dirname, joinPath } from '../lib/path'
import { useTask } from '../lib/useTask'

export default function PdfMerge() {
  const [files, setFiles] = useState<string[]>([])
  const [outPath, setOutPath] = useState<string | null>(null)
  const { running, progress, result, error, run } = useTask()

  const defaultPath = files.length ? joinPath(dirname(files[0]), '合并结果.pdf') : '合并结果.pdf'
  const canRun = files.length >= 2 && !running

  const start = (): void => {
    void run((taskId) => window.api.pdfMerge({ taskId, files, outPath: outPath ?? defaultPath }))
  }

  return (
    <>
      <h2 className="page-title">PDF 合并</h2>
      <p className="page-desc">
        把多个 PDF 按你指定的顺序合并成一个文件。用 ↑↓ 可以调整顺序。
      </p>

      <div className="card">
        <FilePicker
          files={files}
          onChange={setFiles}
          extensions={['pdf']}
          title="选择要合并的 PDF"
          hint="至少选择 2 个 PDF，合并顺序 = 列表顺序"
          sortable
        />
      </div>

      <div className="card">
        <p className="card-title">输出文件</p>
        <div className="row">
          <button
            className="btn"
            onClick={async () => {
              const p = await window.api.saveFile({
                defaultPath: outPath ?? defaultPath,
                extensions: ['pdf'],
                title: '合并后保存为'
              })
              if (p) setOutPath(p)
            }}
          >
            选择保存位置…
          </button>
          <span className="muted" style={{ wordBreak: 'break-all' }}>
            {outPath ?? defaultPath}
          </span>
        </div>
      </div>

      <div className="row">
        <button className="btn primary" disabled={!canRun} onClick={start}>
          {running ? '合并中…' : `开始合并（${files.length} 个文件）`}
        </button>
        {files.length === 1 && <span className="muted">请至少添加 2 个 PDF</span>}
      </div>

      {running && progress && <ProgressBar progress={progress} />}
      <ResultPanel result={result} error={error} />
    </>
  )
}
