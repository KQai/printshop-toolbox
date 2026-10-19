import { useState } from 'react'
import FilePicker from '../components/FilePicker'
import { ProgressBar } from '../components/ProgressBar'
import ResultPanel from '../components/ResultPanel'
import { dirname, joinPath } from '../lib/path'
import { useTask } from '../lib/useTask'

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff', 'gif', 'heic']

type Fmt = 'jpeg' | 'png' | 'webp' | 'avif'

export default function ImageConvert() {
  const [files, setFiles] = useState<string[]>([])
  const [format, setFormat] = useState<Fmt>('png')
  const [quality, setQuality] = useState(90)
  const [maxEdge, setMaxEdge] = useState(0)
  const [outDir, setOutDir] = useState<string | null>(null)
  const { running, progress, result, error, run } = useTask()

  const suggested = files.length ? joinPath(dirname(files[0]), '转换结果') : null
  const lossy = format !== 'png'
  const canRun = files.length > 0 && !running

  const start = (): void => {
    void run((taskId) =>
      window.api.imageConvert({
        taskId,
        files,
        outDir: outDir ?? suggested!,
        format,
        quality,
        maxEdge
      })
    )
  }

  return (
    <>
      <h2 className="page-title">图片格式转换</h2>
      <p className="page-desc">
        批量转成 JPG / PNG / WebP / AVIF，可同时压缩体积、限制尺寸。例如 .jpg 转 .png、PNG 转
        WebP 减小体积。
      </p>

      <div className="card">
        <FilePicker
          files={files}
          onChange={setFiles}
          extensions={IMAGE_EXTS}
          title="选择要转换的图片"
          hint="支持批量选择，输出文件名与原文件同名"
        />
      </div>

      <div className="card">
        <p className="card-title">转换参数</p>
        <div className="row">
          <div className="field">
            <label>目标格式</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as Fmt)}>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
            </select>
          </div>

          {lossy && (
            <div className="field">
              <label>画质 {quality}</label>
              <input
                type="range"
                min={40}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </div>
          )}

          <div className="field">
            <label>最长边限制（像素，0 = 不缩放）</label>
            <input
              type="number"
              min={0}
              max={20000}
              step={100}
              value={maxEdge}
              onChange={(e) => setMaxEdge(Math.max(0, Number(e.target.value) || 0))}
              style={{ minWidth: 140 }}
            />
          </div>
        </div>

        <div className="tip">
          PNG 支持透明通道且无损；JPG 体积小但不支持透明（透明区域会自动铺白底）。
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
            {outDir ?? suggested ?? '请先添加文件'}
          </span>
        </div>
      </div>

      <div className="row">
        <button className="btn primary" disabled={!canRun} onClick={start}>
          {running ? '转换中…' : `开始转换（${files.length}）`}
        </button>
      </div>

      {running && progress && <ProgressBar progress={progress} />}
      <ResultPanel result={result} error={error} />
    </>
  )
}
