import { promises as fs } from 'node:fs'
import { degrees, PDFDocument, rgb, type PDFPage } from 'pdf-lib'

/** 1 毫米 = 2.834645669291339 PDF 点 */
const MM = 72 / 25.4

/** 常见纸张（毫米，纵向） */
const PAPERS = {
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 }
} as const

export type PaperName = keyof typeof PAPERS
export type PerSheet = 2 | 4 | 8
export type ImposeOrder = 'sequential' | 'booklet'

export type ImposeOptions = {
  paper: PaperName
  perSheet: PerSheet
  order: ImposeOrder
  marginMm: number
  gapMm: number
  cropMarks: boolean
}

export type ImposeResult = {
  outputPages: number
  sourcePages: number
  paddedBlanks: number
  grid: { cols: number; rows: number }
  sheetMm: { w: number; h: number }
}

/** 行列候选：cols * rows === perSheet */
function divisorGrids(perSheet: number): [number, number][] {
  const out: [number, number][] = []
  for (let cols = 1; cols <= perSheet; cols++) {
    if (perSheet % cols === 0) out.push([cols, perSheet / cols])
  }
  return out
}

/**
 * 选出让纸张利用率最高的「横向/纵向 + 行列」组合。
 * 例如 A3 + 每张 2 页 + A4 纵向源页 → A3 横向、1 行 2 列，利用率 100%。
 */
function chooseLayout(
  paper: PaperName,
  perSheet: number,
  srcW: number,
  srcH: number
): { sheetW: number; sheetH: number; cols: number; rows: number; util: number } {
  const base = PAPERS[paper]
  let best = { sheetW: base.w * MM, sheetH: base.h * MM, cols: 1, rows: perSheet, util: -1 }

  for (const landscape of [false, true]) {
    const sheetW = (landscape ? base.h : base.w) * MM
    const sheetH = (landscape ? base.w : base.h) * MM
    for (const [cols, rows] of divisorGrids(perSheet)) {
      const cellW = sheetW / cols
      const cellH = sheetH / rows
      const scale = Math.min(cellW / srcW, cellH / srcH)
      const util = (srcW * scale * srcH * scale) / (cellW * cellH)
      if (util > best.util) best = { sheetW, sheetH, cols, rows, util }
    }
  }
  return best
}

/** 旋转角度归一化到 0 / 90 / 180 / 270 */
function normAngle(angle: number): 0 | 90 | 180 | 270 {
  const a = ((Math.round(angle / 90) * 90) % 360 + 360) % 360
  return a as 0 | 90 | 180 | 270
}

/**
 * 计算把「尺寸 sw×sh、自带 rotate 角」的源页放进 cw×ch 单元格时的
 * 缩放比、放置点，以及旋转后占用的实际宽高。
 *
 * 推导基于 pdf-lib 的 drawPage 变换：(px,py) -> (x + R(θ)·S·(px,py))，
 * 即在 (x,y) 处按逆时针 θ 旋转 θ 前先缩放。
 */
function placeRotated(
  sw: number,
  sh: number,
  cw: number,
  ch: number,
  angle: 0 | 90 | 180 | 270
): { scale: number; dx: number; dy: number; rotate: number; footW: number; footH: number } {
  if (angle === 90 || angle === 270) {
    const scale = Math.min(cw / sh, ch / sw)
    const footW = sh * scale
    const footH = sw * scale
    // /Rotate 90 用逆时针 270 复现，/Rotate 270 用逆时针 90
    const dx = angle === 270 ? footW : 0
    const dy = angle === 90 ? footH : 0
    return { scale, dx, dy, rotate: angle === 90 ? 270 : 90, footW, footH }
  }
  const scale = Math.min(cw / sw, ch / sh)
  const footW = sw * scale
  const footH = sh * scale
  const dx = angle === 180 ? footW : 0
  const dy = angle === 180 ? footH : 0
  return { scale, dx, dy, rotate: angle, footW, footH }
}

/**
 * 生成装订顺序（骑马钉）。
 * 每个元素是一次输出的「一面」，元素内是页码（1 基，-1 表示空白）。
 * 把 total 页补到 4 的倍数后，每张纸对折可容纳 4 页，因此共有 total/4 张纸、total/2 个面。
 */
function bookletSheets(pageCount: number): number[][] {
  const total = Math.ceil(pageCount / 4) * 4
  const sheets: number[][] = []
  for (let i = 0; i < total / 4; i++) {
    const front = [total - 2 * i, 2 * i + 1]
    const back = [2 * i + 2, total - 2 * i - 1]
    sheets.push(front.map((n) => (n <= pageCount ? n : -1)))
    sheets.push(back.map((n) => (n <= pageCount ? n : -1)))
  }
  return sheets
}

/** 顺序拼版：按每张 perSheet 页依次切分，末尾补空白 */
function sequentialSheets(pageCount: number, perSheet: number): number[][] {
  const sheets: number[][] = []
  for (let i = 0; i < pageCount; i += perSheet) {
    const group: number[] = []
    for (let k = 0; k < perSheet; k++) {
      const n = i + k + 1
      group.push(n <= pageCount ? n : -1)
    }
    sheets.push(group)
  }
  return sheets
}

/** 在单元格四角画裁切线 */
function drawCropMarks(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  len: number
): void {
  const color = rgb(0.45, 0.45, 0.45)
  const thickness = 0.4
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color })
  }
  // 左下
  line(x, y, x - len, y)
  line(x, y, x, y - len)
  // 右下
  line(x + w, y, x + w + len, y)
  line(x + w, y, x + w, y - len)
  // 左上
  line(x, y + h, x - len, y + h)
  line(x, y + h, x, y + h + len)
  // 右上
  line(x + w, y + h, x + w + len, y + h)
  line(x + w, y + h, x + w, y + h + len)
}

/**
 * 拼版：把多页 PDF 排到更大的纸张上（例如 A3 拼 A4）。
 */
export async function imposePdf(
  input: string,
  output: string,
  opts: ImposeOptions
): Promise<ImposeResult> {
  const src = await PDFDocument.load(await fs.readFile(input), { ignoreEncryption: true })
  const srcCount = src.getPageCount()
  if (srcCount === 0) throw new Error('这个 PDF 没有任何页面')

  const { paper, perSheet, order, marginMm, gapMm, cropMarks } = opts

  // 用第一页的显示尺寸决定网格（多数文档每页尺寸一致）
  const firstSize = src.getPage(0).getSize()
  const firstAngle = normAngle(src.getPage(0).getRotation().angle)
  const firstW = firstAngle === 90 || firstAngle === 270 ? firstSize.height : firstSize.width
  const firstH = firstAngle === 90 || firstAngle === 270 ? firstSize.width : firstSize.height

  // 骑马钉固定 2 页一面，网格按 2 计算纸张方向
  const layoutPerSheet = order === 'booklet' ? 2 : perSheet
  const layout = chooseLayout(paper, layoutPerSheet, firstW, firstH)
  const { sheetW, sheetH, cols, rows } = layout

  const margin = marginMm * MM
  const gap = gapMm * MM
  const usableW = sheetW - margin * 2
  const usableH = sheetH - margin * 2
  const cellW = (usableW - gap * (cols - 1)) / cols
  const cellH = (usableH - gap * (rows - 1)) / rows

  const sheets =
    order === 'booklet' ? bookletSheets(srcCount) : sequentialSheets(srcCount, perSheet)

  // 骑马钉固定 2 页一面，网格按 2 重新算一次
  const effectiveCols = order === 'booklet' ? 2 : cols
  const effectiveRows = order === 'booklet' ? 1 : rows
  const effCellW = order === 'booklet' ? (usableW - gap) / 2 : cellW
  const effCellH = order === 'booklet' ? usableH : cellH

  const out = await PDFDocument.create()
  const embeddedCache = new Map<number, Awaited<ReturnType<typeof out.embedPage>>>()

  const getEmbedded = async (index: number) => {
    let hit = embeddedCache.get(index)
    if (!hit) {
      hit = await out.embedPage(src.getPage(index))
      embeddedCache.set(index, hit)
    }
    return hit
  }

  let blanks = 0

  for (const group of sheets) {
    const page = out.addPage([sheetW, sheetH])
    for (let slot = 0; slot < group.length; slot++) {
      const pageNo = group[slot]
      if (pageNo === -1) {
        blanks++
        continue
      }
      const col = slot % effectiveCols
      const row = Math.floor(slot / effectiveCols)

      const cellX = margin + col * (effCellW + gap)
      const cellY = sheetH - margin - (row + 1) * effCellH - row * gap

      const srcPage = src.getPage(pageNo - 1)
      const size = srcPage.getSize()
      const angle = normAngle(srcPage.getRotation().angle)

      const p = placeRotated(size.width, size.height, effCellW, effCellH, angle)

      const cx = cellX + (effCellW - p.footW) / 2
      const cy = cellY + (effCellH - p.footH) / 2

      page.drawPage(await getEmbedded(pageNo - 1), {
        x: cx + p.dx,
        y: cy + p.dy,
        xScale: p.scale,
        yScale: p.scale,
        rotate: degrees(p.rotate)
      })
    }

    if (cropMarks) {
      for (let slot = 0; slot < effectiveCols * effectiveRows; slot++) {
        const col = slot % effectiveCols
        const row = Math.floor(slot / effectiveCols)
        const cellX = margin + col * (effCellW + gap)
        const cellY = sheetH - margin - (row + 1) * effCellH - row * gap
        drawCropMarks(page, cellX, cellY, effCellW, effCellH, 4 * MM)
      }
    }
  }

  await fs.writeFile(output, await out.save())

  return {
    outputPages: sheets.length,
    sourcePages: srcCount,
    paddedBlanks: blanks,
    grid: { cols: effectiveCols, rows: effectiveRows },
    sheetMm: { w: sheetW / MM, h: sheetH / MM }
  }
}

export { PAPERS, MM, bookletSheets, sequentialSheets, placeRotated, chooseLayout }
