import { useMemo, useState, type ComponentType } from 'react'
import ImageConvert from './tools/ImageConvert'
import ImagesToPdf from './tools/ImagesToPdf'
import PdfMerge from './tools/PdfMerge'
import PdfPageNumbers from './tools/PdfPageNumbers'
import PdfSplit from './tools/PdfSplit'
import WordToPdf from './tools/WordToPdf'

type ToolItem = {
  id: string
  label: string
  icon: string
  Comp: ComponentType
}

const GROUPS: { group: string; items: ToolItem[] }[] = [
  {
    group: '格式转换',
    items: [
      { id: 'word2pdf', label: 'Word 转 PDF', icon: '📄', Comp: WordToPdf },
      { id: 'img2pdf', label: '图片转 PDF', icon: '🖼️', Comp: ImagesToPdf },
      { id: 'imgconv', label: '图片格式转换', icon: '🔄', Comp: ImageConvert }
    ]
  },
  {
    group: 'PDF 处理',
    items: [
      { id: 'merge', label: 'PDF 合并', icon: '🔗', Comp: PdfMerge },
      { id: 'split', label: 'PDF 拆分', icon: '✂️', Comp: PdfSplit },
      { id: 'pagenum', label: '批量加页码', icon: '🔢', Comp: PdfPageNumbers }
    ]
  }
]

export default function App() {
  const [active, setActive] = useState('word2pdf')

  const Current = useMemo(() => {
    for (const g of GROUPS) {
      const hit = g.items.find((i) => i.id === active)
      if (hit) return hit.Comp
    }
    return WordToPdf
  }, [active])

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <h1>文印工具箱</h1>
          <span>本地处理 · 文件不上传</span>
        </div>

        {GROUPS.map((g) => (
          <div key={g.group}>
            <div className="nav-group">{g.group}</div>
            {g.items.map((item) => (
              <button
                key={item.id}
                className={`nav-item${active === item.id ? ' active' : ''}`}
                onClick={() => setActive(item.id)}
              >
                <span className="ico">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        ))}

        <div style={{ marginTop: 'auto', padding: '10px 10px 0' }}>
          <div className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
            所有转换都在你的电脑上完成，
            <br />
            文件不会离开本机。
          </div>
        </div>
      </nav>

      <main className="content">
        <Current />
      </main>
    </div>
  )
}
