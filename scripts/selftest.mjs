/**
 * 端到端自测：把主进程的工具函数单独打包成 CJS，用真实文件跑一遍所有转换。
 * 运行：node scripts/selftest.mjs
 */
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..')
const tmp = path.join(root, '.selftest')
const bundled = path.join(tmp, 'bundled')

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`)
}

async function bundle(entry, outfile) {
  await build({
    entryPoints: [path.join(root, 'src/main/tools', entry)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    external: ['sharp', 'pdf-lib', '@pdf-lib/fontkit', 'electron'],
    logLevel: 'warning'
  })
}

async function makePdf(file, text, pages = 1) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842])
    p.drawText(`${text} - page ${i + 1}`, { x: 60, y: 760, size: 18 })
  }
  writeFileSync(file, await doc.save())
}

function makeDocx(file) {
  const ps = [
    "$ErrorActionPreference='Stop'",
    'try {',
    '  $w = New-Object -ComObject Word.Application',
    '  $w.Visible = $false',
    '  $w.DisplayAlerts = 0',
    '  $d = $w.Documents.Add()',
    '  $d.Content.Text = "文印工具箱自测文档"',
    '  $d.Content.InsertParagraphAfter()',
    '  $d.Content.InsertAfter("第二段：中文排版测试 abc 123")',
    '  $out = $args[0]',
    '  $fmt = 16',
    '  $d.SaveAs([ref]$out, [ref]$fmt)',
    '  $noSave = 0',
    '  $d.Close([ref]$noSave)',
    '} catch { Write-Output ("DOCX_ERR " + $_.Exception.Message) }',
    'try { $w.Quit() } catch {}'
  ].join('\n')

  const scriptPath = path.join(tmp, 'make-docx.ps1')
  writeFileSync(scriptPath, '\uFEFF' + ps, 'utf8')
  spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, file],
    { encoding: 'utf8' }
  )
  return existsSync(file)
}

async function main() {
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(bundled, { recursive: true })

  await bundle('images.ts', path.join(bundled, 'images.cjs'))
  await bundle('pdf.ts', path.join(bundled, 'pdf.cjs'))
  await bundle('office.ts', path.join(bundled, 'office.cjs'))

  const images = require(path.join(bundled, 'images.cjs'))
  const pdf = require(path.join(bundled, 'pdf.cjs'))
  const office = require(path.join(bundled, 'office.cjs'))

  const assets = path.join(tmp, 'assets')
  const out = path.join(tmp, 'out')
  mkdirSync(assets, { recursive: true })
  mkdirSync(out, { recursive: true })

  /* ---------- 造测试素材 ---------- */
  const png = path.join(assets, '测试图 A.png')
  const jpg = path.join(assets, 'photo-b.jpg')
  await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 30, g: 120, b: 220, alpha: 1 } } })
    .png()
    .toFile(png)
  await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 240, g: 200, b: 60 } } })
    .jpeg()
    .toFile(jpg)

  const pdfA = path.join(assets, 'a.pdf')
  const pdfB = path.join(assets, 'b.pdf')
  await makePdf(pdfA, 'A', 2)
  await makePdf(pdfB, 'B', 3)

  const docx = path.join(assets, '自测文档.docx')
  const docxOk = makeDocx(docx)

  /* ---------- 1. 图片格式转换 ---------- */
  try {
    const convOut = path.join(out, 'imgconv')
    await images.convertImages([png, jpg], convOut, { format: 'webp', quality: 88, maxEdge: 1000 })
    const made = readdirSync(convOut)
    const ok = made.length === 2 && made.every((f) => f.endsWith('.webp'))
    const meta = ok ? await sharp(path.join(convOut, made[0])).metadata() : null
    record('图片批量转 WebP + 限制最长边', ok && meta.width <= 1000, `${made.length} 个文件, 宽=${meta?.width}`)
  } catch (e) {
    record('图片批量转 WebP + 限制最长边', false, e.message)
  }

  /* ---------- 2. 图片转 PDF（A4） ---------- */
  try {
    const target = path.join(out, 'photo-book.pdf')
    const r = await images.imagesToSinglePdf([png, jpg], target, {
      pageSize: 'a4',
      orientation: 'portrait',
      margin: 20
    })
    const doc = await PDFDocument.load(require('node:fs').readFileSync(target))
    record('多图合成 A4 PDF', r.ok === 2 && doc.getPageCount() === 2, `页数=${doc.getPageCount()}`)
  } catch (e) {
    record('多图合成 A4 PDF', false, e.message)
  }

  /* ---------- 3. 每图各生成一个 PDF ---------- */
  try {
    const dir = path.join(out, 'img-sep')
    const r = await images.imagesToSeparatePdfs([png, jpg], dir, {
      pageSize: 'fit',
      orientation: 'portrait',
      margin: 0
    })
    record('每图各生成一个 PDF', r.ok === 2 && readdirSync(dir).length === 2)
  } catch (e) {
    record('每图各生成一个 PDF', false, e.message)
  }

  /* ---------- 4. PDF 合并 ---------- */
  let mergedFile = path.join(out, 'merged.pdf')
  try {
    await pdf.mergePdfs([pdfA, pdfB], mergedFile)
    const doc = await PDFDocument.load(require('node:fs').readFileSync(mergedFile))
    record('PDF 合并（2+3 页）', doc.getPageCount() === 5, `页数=${doc.getPageCount()}`)
  } catch (e) {
    record('PDF 合并（2+3 页）', false, e.message)
  }

  /* ---------- 5. PDF 拆分 ---------- */
  try {
    const dir = path.join(out, 'split-every')
    mkdirSync(dir, { recursive: true })
    const files = await pdf.splitPdf(mergedFile, dir, 'every', 2, '')
    const counts = await Promise.all(
      files.map(async (f) => (await PDFDocument.load(require('node:fs').readFileSync(f))).getPageCount())
    )
    record('PDF 按每 2 页拆分', files.length === 3 && counts.join(',') === '2,2,1', counts.join(','))
  } catch (e) {
    record('PDF 按每 2 页拆分', false, e.message)
  }

  try {
    const dir = path.join(out, 'split-ranges')
    mkdirSync(dir, { recursive: true })
    const files = await pdf.splitPdf(mergedFile, dir, 'ranges', 1, '1-3, 5')
    const counts = await Promise.all(
      files.map(async (f) => (await PDFDocument.load(require('node:fs').readFileSync(f))).getPageCount())
    )
    record('PDF 按区间拆分（1-3,5）', files.length === 2 && counts.join(',') === '3,1', counts.join(','))
  } catch (e) {
    record('PDF 按区间拆分（1-3,5）', false, e.message)
  }

  /* ---------- 6. 加页码（中文模板） ---------- */
  try {
    const target = path.join(out, 'numbered.pdf')
    await pdf.addPageNumbers(pdfA, target, {
      position: 'bottom-center',
      startNumber: 1,
      fontSize: 11,
      template: '第 {n} 页 / 共 {total} 页',
      margin: 28
    })
    const doc = await PDFDocument.load(require('node:fs').readFileSync(target))
    const size = require('node:fs').statSync(target).size
    record('中文页码「第 X 页 / 共 Y 页」', doc.getPageCount() === 2 && size > 800, `${size} 字节`)
  } catch (e) {
    record('中文页码「第 X 页 / 共 Y 页」', false, e.message)
  }

  /* ---------- 7. Word -> PDF（本机 Office） ---------- */
  try {
    if (!docxOk) throw new Error('测试用 .docx 生成失败')
    const r = await office.wordToPdf([docx], path.join(out, 'word'))
    const job = r.jobs[0]
    if (!job.ok || !existsSync(job.output)) throw new Error(job.message || '未生成 PDF')
    const doc = await PDFDocument.load(require('node:fs').readFileSync(job.output))
    record(`Word 转 PDF（引擎=${r.engine}）`, doc.getPageCount() >= 1, `页数=${doc.getPageCount()}`)
  } catch (e) {
    record('Word 转 PDF', false, e.message)
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
