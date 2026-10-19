import { useEffect, useState } from 'react'
import FilePicker from '../components/FilePicker'
import { ProgressBar } from '../components/ProgressBar'
import ResultPanel from '../components/ResultPanel'
import { dirname, joinPath } from '../lib/path'
import { useTask } from '../lib/useTask'
import type { EnvCheck } from '../../../shared/types'

type Engine = 'text' | 'libreoffice'

export default function PdfToWord() {
  const [files, setFiles] = useState<string[]>([])
  const [engine, setEngine] = useState<Engine>('text')
  const [outDir, setOutDir] = useState<string | null>(null)
  const [env, setEnv] = useState<EnvCheck | null>(null)
  const { running, progress, result, error, run } = useTask()

  useEffect(() => {
    window.api.checkEnv().then(setEnv).catch(() => setEnv(null))
  }, [])

  const hasLibreOffice = !!env?.libreoffice
  const suggested = files.length ? dirname(files[0]) : null
  const canRun = files.length > 0 && !running

  const start = (): void => {
    void run((taskId) =>
      window.api.pdfToWord({ taskId, files, engine, outDir: outDir ?? suggested })
    )
  }

  return (
    <>
      <h2 className="page-title">PDF 转 Word</h2>
      <p className="page-desc">
        把 PDF 转成可编辑的 .docx。管理员/文印场景常用来改一改文字内容。
      </p>

      <div className="card">
        <FilePicker
          files={files}
          onChange={setFiles}
          extensions={['pdf']}
          title="选择要转换的 PDF"
          hint="支持批量转换"
        />
      </div>

      <div className="card">
        <p className="card-title">转换引擎</p>

        <label
          style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 12 }}
        >
          <input
            type="radio"
            checked={engine === 'text'}
            onChange={() => setEngine('text')}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>内置文本引擎</strong>
            <span className="muted">（默认，免安装）</span>
            <div className="tip" style={{ marginTop: 2 }}>
              提取 PDF 里的文字生成 Word，<strong>文字可以随便改</strong>。但原来的排版、图片、表格不会保留。
            </div>
          </span>
        </label>

        <label
          style={{
            display: 'flex',
            gap: 9,
            alignItems: 'flex-start',
            cursor: hasLibreOffice ? 'pointer' : 'not-allowed',
            opacity: hasLibreOffice ? 1 : 0.5
          }}
        >
          <input
            type="radio"
            disabled={!hasLibreOffice}
            checked={engine === 'libreoffice'}
            onChange={() => setEngine('libreoffice')}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>LibreOffice 保版引擎</strong>
            <span className="muted">（{hasLibreOffice ? '可用' : '未安装'}）</span>
            <div className="tip" style={{ marginTop: 2 }}>
              尽量保留原版式，转换更慢，复杂排版仍可能走形。
              {!hasLibreOffice && ' 需要先安装免费的 LibreOffice。'}
            </div>
          </span>
        </label>
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
            {outDir ?? suggested ?? '默认与原 PDF 同目录'}
          </span>
        </div>
      </div>

      <div className="row">
        <button className="btn primary" disabled={!canRun} onClick={start}>
          {running ? '转换中…' : `开始转换（${files.length}）`}
        </button>
        {engine === 'text' && <span className="muted">扫描件（图片型 PDF）转不出文字</span>}
      </div>

      {running && progress && <ProgressBar progress={progress} />}
      <ResultPanel
        result={result}
        error={error}
        successText={(r) =>
          r.succeeded === 0
            ? '没有转换出任何文件。'
            : `转换完成，成功 ${r.succeeded} 个${r.failed ? `，失败 ${r.failed} 个` : ''}。转换出来的 Word 可能还需要手动调整格式。`
        }
      />
    </>
  )
}
