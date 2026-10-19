import { useState } from 'react'
import FilePicker from '../components/FilePicker'
import { ProgressBar } from '../components/ProgressBar'
import ResultPanel from '../components/ResultPanel'
import { dirname, joinPath } from '../lib/path'
import { useTask } from '../lib/useTask'

export default function PdfSplit() {
  const [file, setFile] = useState<string[]>([])
  const [mode, setMode] = useState<'every' | 'ranges'>('every')
  const [every, setEvery] = useState(1)
  const [ranges, setRanges] = useState('1-3, 5, 8-10')
  const [outDir, setOutDir] = useState<string | null>(null)
  const { running, progress, result, error, run } = useTask()

  const suggested = file.length ? joinPath(dirname(file[0]), '拆分结果') : null
  const canRun = file.length === 1 && !running

  const start = (): void => {
    void run((taskId) =>
      window.api.pdfSplit({
        taskId,
        file: file[0],
        outDir: outDir ?? suggested!,
        mode,
        every,
        ranges
      })
    )
  }

  return (
    <>
      <h2 className="page-title">PDF 拆分</h2>
      <p className="page-desc">
        把一个 PDF 按固定页数切开（例如每 2 页一个文件），或者按页码区间拆成多个文件。
      </p>

      <div className="card">
        <FilePicker
          files={file}
          onChange={setFile}
          extensions={['pdf']}
          title="选择要拆分的 PDF"
          hint="一次只能拆分一个 PDF"
          multiple={false}
        />
      </div>

      <div className="card">
        <p className="card-title">拆分方式</p>
        <div className="row">
          <div className="field">
            <label>方式</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'every' | 'ranges')}>
              <option value="every">按固定页数切分</option>
              <option value="ranges">按页码区间切分</option>
            </select>
          </div>

          {mode === 'every' ? (
            <div className="field">
              <label>每个文件包含页数</label>
              <input
                type="number"
                min={1}
                max={500}
                value={every}
                onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          ) : (
            <div className="field" style={{ flex: 1 }}>
              <label>页码区间（逗号分隔，支持 1-3 这种写法）</label>
              <input
                type="text"
                value={ranges}
                onChange={(e) => setRanges(e.target.value)}
                style={{ minWidth: 320 }}
                placeholder="例如：1-3, 5, 8-10"
              />
            </div>
          )}
        </div>
        <div className="tip">
          按区间拆分时，每个区间会生成一个 PDF。例如「1-3, 5, 8-10」会生成 3 个文件。
        </div>
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
            {outDir ?? suggested ?? '请先选择 PDF'}
          </span>
        </div>
      </div>

      <div className="row">
        <button className="btn primary" disabled={!canRun} onClick={start}>
          {running ? '拆分中…' : '开始拆分'}
        </button>
      </div>

      {running && progress && <ProgressBar progress={progress} />}
      <ResultPanel result={result} error={error} />
    </>
  )
}
