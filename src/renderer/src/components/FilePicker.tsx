import { useCallback, useRef, useState, type DragEvent } from 'react'

type Props = {
  files: string[]
  onChange: (files: string[]) => void
  /** 不带点的扩展名，用于文件对话框过滤 */
  extensions: string[]
  title?: string
  hint?: string
  multiple?: boolean
  /** 是否允许调整顺序（合并 PDF / 拼图时很重要） */
  sortable?: boolean
}

export default function FilePicker({
  files,
  onChange,
  extensions,
  title,
  hint,
  multiple = true,
  sortable = false
}: Props) {
  const [dragging, setDragging] = useState(false)
  const dragIndex = useRef<number | null>(null)

  const add = useCallback(
    (paths: string[]) => {
      const next = multiple ? [...files, ...paths] : paths.slice(0, 1)
      onChange(next)
    },
    [files, multiple, onChange]
  )

  const pick = useCallback(async () => {
    const picked = await window.api.openFiles({
      title,
      extensions,
      multi: multiple
    })
    if (picked.length) add(picked)
  }, [add, extensions, multiple, title])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const paths: string[] = []
      for (const f of Array.from(e.dataTransfer.files)) {
        const p = window.api.getPathForFile(f)
        if (p) paths.push(p)
      }
      if (paths.length) add(paths)
    },
    [add]
  )

  const remove = (i: number): void => onChange(files.filter((_, k) => k !== i))
  const clear = (): void => onChange([])

  const move = (from: number, to: number): void => {
    if (to < 0 || to >= files.length || from === to) return
    const next = [...files]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  return (
    <>
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="big">把文件拖到这里，或点击选择</div>
        <div className="hint">{hint ?? `支持 ${extensions.map((e) => '.' + e).join(' / ')}`}</div>
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="muted">
              已选 {files.length} 个文件
              {sortable ? '（可用 ↑↓ 调整顺序）' : ''}
            </span>
            <button className="btn small ghost" onClick={clear}>
              清空
            </button>
          </div>
          <ul className="file-list">
            {files.map((f, i) => (
              <li key={f + i}>
                <span className="idx">{i + 1}</span>
                <span className="name" title={f}>
                  {f.split(/[\\/]/).pop()}
                </span>
                {sortable && (
                  <>
                    <button
                      className="del"
                      title="上移"
                      onClick={() => move(i, i - 1)}
                      disabled={i === 0}
                    >
                      ↑
                    </button>
                    <button
                      className="del"
                      title="下移"
                      onClick={() => move(i, i + 1)}
                      disabled={i === files.length - 1}
                    >
                      ↓
                    </button>
                  </>
                )}
                <button className="del" title="移除" onClick={() => remove(i)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
