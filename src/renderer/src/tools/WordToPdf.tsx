import { useEffect, useState } from 'react'
import FilePicker from '../components/FilePicker'
import { ProgressBar } from '../components/ProgressBar'
import ResultPanel from '../components/ResultPanel'
import { useTask } from '../lib/useTask'
import type { EnvCheck } from '../../../shared/types'

export default function WordToPdf() {
  const [files, setFiles] = useState<string[]>([])
  const [sameFolder, setSameFolder] = useState(true)
  const [outDir, setOutDir] = useState<string | null>(null)
  const [env, setEnv] = useState<EnvCheck | null>(null)
  const { running, progress, result, error, run } = useTask()

  useEffect(() => {
    window.api.checkEnv().then(setEnv).catch(() => setEnv(null))
  }, [])

  const canRun = files.length > 0 && !running && (sameFolder || !!outDir)

  const start = (): void => {
    void run((taskId) => window.api.wordToPdf({ taskId, files, outDir, sameFolder }))
  }

  return (
    <>
      <h2 className="page-title">Word 转 PDF</h2>
      <p className="page-desc">
        批量把 .doc / .docx 转成 PDF，保留原有排版。文件全部在本机处理，不会上传到任何服务器。
      </p>

      {env && !env.word && !env.libreoffice && (
        <div className="banner warn">
          本机没有检测到 Microsoft Office 或 LibreOffice，Word 转 PDF 需要其中之一。建议安装
          LibreOffice（免费），装好后重启本程序即可。
        </div>
      )}
      {env?.word && (
        <div className="banner ok">✓ 检测到本机 Microsoft Office，转换引擎就绪。</div>
      )}
      {env && !env.word && env.libreoffice && (
        <div className="banner ok">✓ 检测到 LibreOffice，转换引擎就绪。</div>
      )}

      <div className="card">
        <FilePicker
          files={files}
          onChange={setFiles}
          extensions={['doc', 'docx', 'rtf', 'odt', 'txt']}
          title="选择要转换的 Word 文档"
          hint="支持 .doc / .docx，可一次拖入多个文件"
        />
      </div>

      <div className="card">
        <p className="card-title">输出位置</p>
        <div className="row">
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={sameFolder}
              onChange={(e) => setSameFolder(e.target.checked)}
            />
            与原文件放在同一文件夹
          </label>
        </div>
        {!sameFolder && (
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn"
              onClick={async () => {
                const d = await window.api.openDirectory('选择输出文件夹')
                if (d) setOutDir(d)
              }}
            >
              选择输出文件夹…
            </button>
            <span className="muted" style={{ wordBreak: 'break-all' }}>
              {outDir ?? '尚未选择'}
            </span>
          </div>
        )}
      </div>

      <div className="row">
        <button className="btn primary" disabled={!canRun} onClick={start}>
          {running ? '转换中…' : `开始转换（${files.length}）`}
        </button>
        <span className="muted">首次调用 Office 需要几秒钟启动</span>
      </div>

      {running && progress && <ProgressBar progress={progress} />}
      <ResultPanel result={result} error={error} />
    </>
  )
}
