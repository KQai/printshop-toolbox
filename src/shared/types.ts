/** 主进程 <-> 渲染进程 之间的共享类型定义 */

export type ProgressEvent = {
  /** 任务批次 id */
  id: string
  /** 已处理数量 */
  done: number
  /** 总数量 */
  total: number
  /** 当前正在处理的文件名 */
  current: string
  /** 附加说明（错误信息 / 提示） */
  message?: string
}

export type TaskResult = {
  ok: boolean
  /** 成功数量 */
  succeeded: number
  /** 失败数量 */
  failed: number
  /** 产出文件路径 */
  outputs: string[]
  errors: { input: string; message: string }[]
  /** 输出目录（如果适用） */
  outDir?: string
}

export type OpenDialogOptions = {
  title?: string
  /** 扩展名，不带点，如 ['docx', 'doc'] */
  extensions: string[]
  multi?: boolean
}

export type EnvCheck = {
  /** Word COM 自动化是否可用 */
  word: boolean
  /** LibreOffice 可执行文件路径，未安装为 null */
  libreoffice: string | null
  platform: string
}

/* ---------------- 各工具的参数 ---------------- */

export type WordToPdfArgs = {
  files: string[]
  outDir: string | null
  /** 输出 PDF 与源文件同目录 */
  sameFolder: boolean
}

export type ImagesToPdfArgs = {
  files: string[]
  outPath: string | null
  /** 每张图片单独生成一个 PDF */
  separateFiles: boolean
  outDir: string | null
  pageSize: 'fit' | 'a4' | 'a3'
  orientation: 'portrait' | 'landscape'
  margin: number
}

export type ImageConvertArgs = {
  files: string[]
  outDir: string
  format: 'jpeg' | 'png' | 'webp' | 'avif'
  quality: number
  /** 最长边像素上限，0 表示不缩放 */
  maxEdge: number
}

export type PdfMergeArgs = {
  files: string[]
  outPath: string
}

export type PdfSplitArgs = {
  file: string
  outDir: string
  /** every: 按固定页数切；ranges: 按页码区间切 */
  mode: 'every' | 'ranges'
  every: number
  /** 形如 "1-3,5,8-10" */
  ranges: string
}

export type PdfPageNumberArgs = {
  files: string[]
  outDir: string
  position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right'
  startNumber: number
  fontSize: number
  /** 例如 "第 {n} 页 / 共 {total} 页" */
  template: string
  margin: number
}

export type PdfToWordArgs = {
  files: string[]
  /** text = 内置文本提取（免依赖）；libreoffice = 尽量保版 */
  engine: 'text' | 'libreoffice'
  outDir: string | null
}

export type ImposeArgs = {
  file: string
  outDir: string | null
  paper: 'a3' | 'a4'
  perSheet: 2 | 4 | 8
  order: 'sequential' | 'booklet'
  marginMm: number
  gapMm: number
  cropMarks: boolean
}
