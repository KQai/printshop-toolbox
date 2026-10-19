import { useState } from 'react'
import FilePicker from '../components/FilePicker'
import { ProgressBar } from '../components/ProgressBar'
import ResultPanel from '../components/ResultPanel'
import { dirname, joinPath } from '../lib/path'
import { useTask } from '../lib/useTask'

type Paper = 'a3' | 'a4'

export default function PdfImpose() {
  const [file, setFile] = useState<string[]>([])
  const [paper, setPaper] = useState<Paper>('a3')
  const [perSheet, setPerSheet] = useState<2 | 4 | 8>(2)
  const [order, setOrder] = useState<'sequential' | 'booklet'>('sequential')
  const [marginMm, setMarginMm] = useState(6)
  const [gapMm, setGapMm] = useState(0)
  const [cropMarks, setCropMarks] = useState(true)
  const [outDir, setOutDir] = useState<string | null>(null)
  const { running, progress, result, error, run } = useTask()

  const suggested = file.length ? dirname(file[0]) : null
  const canRun = file.length === 1 && !running
  const isBooklet = order === 'booklet'

  const start = (): void => {
    void run((taskId) =>
      window.api.impose({
        taskId,
        file: file[0],
        outDir: outDir ?? suggested,
        paper,
        perSheet,
        order,
        marginMm,
        gapMm,
        cropMarks
      })
    )
  }

  return (
    <>
      <h2 className="page-title">PDF 拼版</h2>
      <p className="page-desc">
        把小页拼到大纸上打印，最常用的是 <strong>A3 拼 A4</strong>（一张 A3 放两页
        A4，打出来中间裁一刀就是两份）。程序会自动选横竖方向，尽量把纸用满。
      </p>

      <div className="card">
        <FilePicker
          files={file}
          onChange={setFile}
          extensions={['pdf']}
          title="选择要拼版的 PDF"
          hint="一次拼一个 PDF"
          multiple={false}
        />
      </div>

      <div className="card">
        <p className="card-title">拼版方案</p>
        <div className="row">
          <div className="field">
            <label>目标纸张</label>
            <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
              <option value="a3">A3（常见）</option>
              <option value="a4">A4</option>
            </select>
          </div>

          <div className="field">
            <label>每张纸放几页</label>
            <select
              value={perSheet}
              disabled={isBooklet}
              onChange={(e) => setPerSheet(Number(e.target.value) as 2 | 4 | 8)}
            >
              <option value={2}>2 页</option>
              <option value={4}>4 页</option>
              <option value={8}>8 页</option>
            </select>
          </div>

          <div className="field">
            <label>装订顺序</label>
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value as 'sequential' | 'booklet')}
            >
              <option value="sequential">顺序（直接打印）</option>
              <option value="booklet">骑马钉（对折成册）</option>
            </select>
          </div>

          <div className="field">
            <label>页边距 {marginMm} mm</label>
            <input
              type="range"
              min={0}
              max={25}
              value={marginMm}
              onChange={(e) => setMarginMm(Number(e.target.value))}
            />
          </div>

          <div className="field">
            <label>页间距 {gapMm} mm</label>
            <input
              type="range"
              min={0}
              max={20}
              value={gapMm}
              onChange={(e) => setGapMm(Number(e.target.value))}
            />
          </div>

          <label style={{ display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer', paddingBottom: 9 }}>
            <input
              type="checkbox"
              checked={cropMarks}
              onChange={(e) => setCropMarks(e.target.checked)}
            />
            打印裁切线
          </label>
        </div>

        <div className="tip">
          {isBooklet
            ? '骑马钉：每面放 2 页，按对折顺序重排；页数会自动补齐到 4 的倍数（不够的用空白页）。打印时选「双面、沿短边翻页」，印完从中缝装订即可成册。'
            : `顺序：第 1、2 页并排放在第 1 张纸上，第 3、4 页放在第 2 张上，依此类推。`}
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
          {running ? '拼版中…' : '开始拼版'}
        </button>
      </div>

      {running && progress && <ProgressBar progress={progress} />}
      <ResultPanel
        result={result}
        error={error}
        successText={(r) => `拼版完成，共生成 ${r.succeeded} 张纸（页面）。`}
      />
    </>
  )
}
