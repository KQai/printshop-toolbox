import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { outputPathFor, stem, uniquePath } from './paths'

/* ------------------------------------------------------------------ */
/* 合并                                                                 */
/* ------------------------------------------------------------------ */

export async function mergePdfs(files: string[], outPath: string): Promise<void> {
  const merged = await PDFDocument.create()
  for (const file of files) {
    const bytes = await fs.readFile(file)
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const pages = await merged.copyPages(doc, doc.getPageIndices())
    pages.forEach((p) => merged.addPage(p))
  }
  await fs.writeFile(outPath, await merged.save())
}

/* ------------------------------------------------------------------ */
/* 拆分                                                                 */
/* ------------------------------------------------------------------ */

/** 解析 "1-3,5,8-10" -> [[0,1,2],[4],[7,8,9]]（0 基索引） */
export function parseRanges(spec: string, pageCount: number): number[][] {
  const groups: number[][] = []
  for (const raw of spec.split(/[,，]/)) {
    const part = raw.trim()
    if (!part) continue
    const m = /^(\d+)\s*[-~—]\s*(\d+)$/.exec(part)
    if (m) {
      const from = Math.max(1, parseInt(m[1], 10))
      const to = Math.min(pageCount, parseInt(m[2], 10))
      const arr: number[] = []
      for (let i = from; i <= to; i++) arr.push(i - 1)
      if (arr.length) groups.push(arr)
    } else if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10)
      if (n >= 1 && n <= pageCount) groups.push([n - 1])
    } else {
      throw new Error(`无法识别的页码表达式："${part}"`)
    }
  }
  if (!groups.length) throw new Error('没有解析到任何有效页码')
  return groups
}

export async function splitPdf(
  file: string,
  outDir: string,
  mode: 'every' | 'ranges',
  every: number,
  ranges: string
): Promise<string[]> {
  const src = await PDFDocument.load(await fs.readFile(file), { ignoreEncryption: true })
  const total = src.getPageCount()
  const base = stem(file)
  const taken = new Set<string>()
  const outputs: string[] = []

  const groups: number[][] =
    mode === 'every'
      ? (() => {
          const size = Math.max(1, Math.floor(every))
          const g: number[][] = []
          for (let i = 0; i < total; i += size) {
            g.push(Array.from({ length: Math.min(size, total - i) }, (_, k) => i + k))
          }
          return g
        })()
      : parseRanges(ranges, total)

  for (let i = 0; i < groups.length; i++) {
    const idx = groups[i]
    const first = idx[0] + 1
    const last = idx[idx.length - 1] + 1
    const out = uniquePath(path.join(outDir, `${base}_${first}-${last}页.pdf`), taken)
    const doc = await PDFDocument.create()
    const pages = await doc.copyPages(src, idx)
    pages.forEach((p) => doc.addPage(p))
    await fs.writeFile(out, await doc.save())
    outputs.push(out)
  }
  return outputs
}

/* ------------------------------------------------------------------ */
/* 加页码                                                               */
/* ------------------------------------------------------------------ */

const CJK_FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\simhei.ttf',
  'C:\\Windows\\Fonts\\simkai.ttf',
  'C:\\Windows\\Fonts\\simfang.ttf',
  'C:\\Windows\\Fonts\\Deng.ttf',
  'C:\\Windows\\Fonts\\msyh.ttc',
  'C:\\Windows\\Fonts\\simsun.ttc'
]

function firstExistingFont(): string | null {
  return CJK_FONT_CANDIDATES.find((p) => existsSync(p)) ?? null
}

async function loadNumberFont(
  pdf: PDFDocument
): Promise<{ font: PDFFont; isFallback: boolean }> {
  const candidate = firstExistingFont()
  if (candidate) {
    try {
      pdf.registerFontkit(fontkit)
      const bytes = await fs.readFile(candidate)
      const font = await pdf.embedFont(bytes, { subset: true })
      return { font, isFallback: false }
    } catch {
      /* 落到内置字体 */
    }
  }
  return { font: await pdf.embedFont(StandardFonts.Helvetica), isFallback: true }
}

const NON_ASCII = /[^\u0000-\u00ff]/

export type PageNumberOptions = {
  position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right'
  startNumber: number
  fontSize: number
  template: string
  margin: number
}

export async function addPageNumbers(file: string, outPath: string, opts: PageNumberOptions): Promise<void> {
  const doc = await PDFDocument.load(await fs.readFile(file), { ignoreEncryption: true })
  const { font, isFallback } = await loadNumberFont(doc)
  const pages = doc.getPages()
  const total = pages.length

  if (isFallback && NON_ASCII.test(opts.template)) {
    throw new Error('未找到中文字体，页码模板请改用英文，例如 "Page {n} / {total}"')
  }

  pages.forEach((page, i) => {
    const n = opts.startNumber + i
    const text = opts.template.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total))
    const size = opts.fontSize
    const textWidth = font.widthOfTextAtSize(text, size)
    const { width: w, height: h } = page.getSize()
    const m = opts.margin

    let x = m
    let y = m
    switch (opts.position) {
      case 'bottom-left':
        x = m
        y = m
        break
      case 'bottom-right':
        x = w - textWidth - m
        y = m
        break
      case 'bottom-center':
        x = (w - textWidth) / 2
        y = m
        break
      case 'top-center':
        x = (w - textWidth) / 2
        y = h - m - size
        break
      case 'top-right':
        x = w - textWidth - m
        y = h - m - size
        break
    }

    page.drawText(text, { x, y, size, font, color: rgb(0.15, 0.15, 0.15) })
  })

  await fs.writeFile(outPath, await doc.save())
}

export function pdfOutputPathFor(input: string, outDir: string, suffix: string, taken?: Set<string>): string {
  const target = path.join(outDir, `${stem(input)}${suffix}.pdf`)
  return uniquePath(target, taken)
}

export { outputPathFor }
