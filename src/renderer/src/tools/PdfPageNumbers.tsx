import { useState } from 'react'
import FilePicker from '../components/FilePicker'
import { ProgressBar } from '../components/ProgressBar'
import ResultPanel from '../components/ResultPanel'
import { dirname, joinPath } from '../lib/path'
import { useTask } from '../lib/useTask'

type Position =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'

export default function PdfPageNumbers() {
  const [files, setFiles] = useState<string[]>([])
  const [position, setPosition] = useState<Position>('bottom-center')
  const [startNumber, setStartNumber] = useState(1)
  const [fontSize, setFontSize] = useState(10)
  const [margin, setMargin] = useState(28)
  const [template, setTemplate] = useState('第 {n} 页 / 共 {total} 页')
  const [outDir, setOutDir] = useState<string | null>(null)
  const { running, progress, result, error, run } = useTask()

  const suggested = files.length ? joinPath(dirname(files[0]), '加页码结果') : null
  const canRun = files.length > 0 && !running

  const start = (): void => {
    void run((taskId) =>
      window.api.pdfPageNumbers({
        taskId,
        files,
        outDir: outDir ?? suggested!,
        position,
        startNumber,
        fontSize,
        template,
        margin
      })
    )
  }

  return (
    <>
      <h2 className="page-title">PDF 批量加页码</h2>
      <p className="page-desc">
        给 PDF 每一页加上页码，位置、字号、起始页码和文字模板都可以自定义。原件不会被修改。
      </p>

      <div className="card">
        <FilePicker
          files={files}
          onChange={setFiles}
          extensions={['pdf']}
          title="选择要加页码的 PDF"
          hint="支持批量处理多个 PDF"
        />
      </div>

      <div className="card">
        <p className="card-title">页码样式</p>
        <div className="row">
          <div className="field">
            <label>位置</label>
            <select value={position} onChange={(e) => setPosition(e.target.value as Position)}>
              <option value="bottom-center">页脚居中</option>
              <option value="bottom-right">页脚右侧</option>
              <option value="bottom-left">页脚左侧</option>
              <option value="top-center">页眉居中</option>
              <option value="top-right">页眉右侧</option>
            </select>
          </div>

          <div className="field">
            <label>起始页码</label>
            <input
              type="number"
              min={1}
              value={startNumber}
              onChange={(e) => setStartNumber(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className="field">
            <label>字号</label>
            <input
              type="number"
              min={6}
              max={40}
              value={fontSize}
              onChange={(e) => setFontSize(Math.max(6, Number(e.target.value) || 10))}
            />
          </div>

          <div className="field">
            <label>距页边（pt）</label>
            <input
              type="number"
              min={4}
              max={200}
              value={margin}
              onChange={(e) => setMargin(Math.max(4, Number(e.target.value) || 28))}
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>文字模板（{' {n} '} 为当前页码，{' {total} '} 为总页数）</label>
            <input
              type="text"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              style={{ minWidth: 340 }}
              placeholder="第 {n} 页 / 共 {total} 页"
            />
          </div>
        </div>
        <div className="tip">例如「第 {'{n}'} 页」或「{' {n} '} / {' {total} '}」。</div>
      </div>

      <div className="card">
        <p className="card-title">输出文件夹</p>
        <div className="row">
          <button
            className="btn"
            onClick={async () => {
              const d = await window.api.openDirectory('选择输出文件夹')
              if (d) setOutDir(d)
            }}
          >
            选择文件夹…
          </button>
          <span className="muted" style={{ wordBreak: 'break-all' }}>
            {outDir ?? suggested ?? '请先添加文件'}
          </span>
        </div>
      </div>

      <div className="row">
        <button className="btn primary" disabled={!canRun} onClick={start}>
          {running ? '处理中…' : `开始处理（${files.length}）`}
        </button>
      </div>

      {running && progress && <ProgressBar progress={progress} />}
      <ResultPanel result={result} error={error} />
    </>
  )
}
