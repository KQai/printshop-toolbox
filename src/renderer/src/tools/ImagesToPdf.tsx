import { useState } from 'react'
import FilePicker from '../components/FilePicker'
import { ProgressBar } from '../components/ProgressBar'
import ResultPanel from '../components/ResultPanel'
import { dirname, joinPath } from '../lib/path'
import { useTask } from '../lib/useTask'

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff', 'gif', 'heic']

export default function ImagesToPdf() {
  const [files, setFiles] = useState<string[]>([])
  const [separate, setSeparate] = useState(false)
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'a3'>('fit')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [margin, setMargin] = useState(20)
  const [outPath, setOutPath] = useState<string | null>(null)
  const [outDir, setOutDir] = useState<string | null>(null)
  const { running, progress, result, error, run } = useTask()

  const defaultPdfName = files.length
    ? joinPath(dirname(files[0]), '合并图片.pdf')
    : '合并图片.pdf'

  const canRun = files.length > 0 && !running && (separate || !!outPath)

  const chooseFolder = async (): Promise<void> => {
    const d = await window.api.openDirectory('选择输出文件夹')
    if (d) setOutDir(d)
  }

  const start = (): void => {
    void run((taskId) =>
      window.api.imagesToPdf({
        taskId,
        files,
        outPath,
        separateFiles: separate,
        outDir,
        pageSize,
        orientation,
        margin
      })
    )
  }

  return (
    <>
      <h2 className="page-title">图片转 PDF</h2>
      <p className="page-desc">
        把多张图片合并成一个 PDF，或每张图片各生成一个 PDF。支持 JPG / PNG / WebP / BMP / TIFF / HEIC。
      </p>

      <div className="card">
        <FilePicker
          files={files}
          onChange={setFiles}
          extensions={IMAGE_EXTS}
          title="选择要转换的图片"
          hint="可一次拖入多个文件，输出顺序与列表顺序一致"
          sortable
        />
      </div>

      <div className="card">
        <p className="card-title">输出方式</p>
        <div className="row">
          <div className="field">
            <label>输出</label>
            <select
              value={separate ? 'separate' : 'single'}
              onChange={(e) => setSeparate(e.target.value === 'separate')}
            >
              <option value="single">合并为一个 PDF</option>
              <option value="separate">每张图片各生成一个 PDF</option>
            </select>
          </div>
          <div className="field">
            <label>纸张</label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as 'fit' | 'a4' | 'a3')}
            >
              <option value="fit">跟随图片尺寸</option>
              <option value="a4">A4</option>
              <option value="a3">A3</option>
            </select>
          </div>
          {pageSize !== 'fit' && (
            <>
              <div className="field">
                <label>方向</label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
                >
                  <option value="portrait">纵向</option>
                  <option value="landscape">横向</option>
                </select>
              </div>
              <div className="field">
                <label>页边距 {margin} pt</label>
                <input
                  type="range"
                  min={0}
                  max={80}
                  step={2}
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                />
              </div>
            </>
          )}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          {separate ? (
            <>
              <button className="btn" onClick={chooseFolder}>
                选择输出文件夹…
              </button>
              <span className="muted" style={{ wordBreak: 'break-all' }}>
                {outDir ?? '默认与原图同目录'}
              </span>
            </>
          ) : (
            <>
              <button
                className="btn"
                onClick={async () => {
                  const p = await window.api.saveFile({
                    defaultPath: outPath ?? defaultPdfName,
                    extensions: ['pdf'],
                    title: '保存 PDF 到'
                  })
                  if (p) setOutPath(p)
                }}
              >
                选择保存位置…
              </button>
              <span className="muted" style={{ wordBreak: 'break-all' }}>
                {outPath ?? defaultPdfName}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="row">
        <button className="btn primary" disabled={!canRun} onClick={start}>
          {running ? '生成中…' : `开始生成（${files.length}）`}
        </button>
      </div>

      {running && progress && <ProgressBar progress={progress} />}
      <ResultPanel result={result} error={error} />
    </>
  )
}
