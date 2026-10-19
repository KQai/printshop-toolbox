import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Document, Packer, PageBreak, Paragraph, TextRun } from 'docx'
import { PDFParse } from 'pdf-parse'
import { libreOfficeConvert } from './office'
import { outputPathFor } from './paths'

export type PdfToWordEngine = 'text' | 'libreoffice'

export type PdfToWordResult = {
  engine: PdfToWordEngine
  output: string
  pages: number
  /** 提取到的字符数，用于判断是不是扫描件 */
  chars: number
}

const FONT = {
  ascii: 'Calibri',
  hAnsi: 'Calibri',
  eastAsia: '微软雅黑',
  cs: 'Calibri'
}

/** 每页至少有这么多字符才算「有文字」，低于此值很可能是扫描件 */
export const CHARS_PER_PAGE_HINT = 20

/**
 * 内置引擎：用 pdf-parse 提取文字，再生成可编辑的 .docx。
 * 只保留文字与换行，不保留原排版、图片和表格。
 */
async function convertWithTextEngine(
  input: string,
  output: string
): Promise<{ pages: number; chars: number }> {
  const buf = await fs.readFile(input)
  const parser = new PDFParse({ data: new Uint8Array(buf) })

  let pages: { num: number; text: string }[] = []
  let total = 0
  let allText = ''

  try {
    const result = await parser.getText()
    pages = result.pages ?? []
    total = result.total ?? pages.length
    allText = result.text ?? ''
  } finally {
    await parser.destroy().catch(() => undefined)
  }

  const children: Paragraph[] = []

  pages.forEach((page, index) => {
    if (index > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
    }
    const lines = (page.text ?? '').replace(/\r\n?/g, '\n').split('\n')
    if (!lines.length) {
      children.push(new Paragraph({ children: [] }))
      return
    }
    for (const line of lines) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, font: FONT, size: 22 })],
          spacing: { after: 0, line: 300 }
        })
      )
    }
  })

  const doc = new Document({
    creator: '文印工具箱',
    title: path.basename(input, path.extname(input)),
    sections: [
      {
        properties: {
          // 上下左右各 2cm（单位 twip，1cm = 567）
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } }
        },
        children: children.length ? children : [new Paragraph({ children: [] })]
      }
    ]
  })

  await fs.writeFile(output, await Packer.toBuffer(doc))
  return { pages: total, chars: allText.length }
}

/**
 * PDF 转 Word。
 * @param engine 'text' 内置文本提取（免依赖）；'libreoffice' 调用 LibreOffice 尽量保版
 */
export async function pdfToWord(
  input: string,
  outDir: string | null,
  engine: PdfToWordEngine
): Promise<PdfToWordResult> {
  const dir = outDir ?? path.dirname(input)
  await fs.mkdir(dir, { recursive: true })

  if (engine === 'libreoffice') {
    const res = await libreOfficeConvert([input], 'docx', dir)
    const hit = res.find((r) => r.input === input)
    if (!hit?.ok || !hit.output) {
      throw new Error(hit?.message ?? 'LibreOffice 转换失败')
    }
    return { engine, output: hit.output, pages: 0, chars: 0 }
  }

  const output = outputPathFor(input, dir, '.docx')
  const { pages, chars } = await convertWithTextEngine(input, output)
  return { engine, output, pages, chars }
}
