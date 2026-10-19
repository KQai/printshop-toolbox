/**
 * 端到端自测：把主进程的工具函数单独打包成 CJS，用真实文件跑一遍所有转换。
 * 运行：node scripts/selftest.mjs
 *
 * 缺少依赖引擎的用例（例如没装 LibreOffice / Office）会标记为 SKIP，不影响退出码。
 */
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { degrees, PDFDocument } from 'pdf-lib'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..')
const tmp = path.join(root, '.selftest')
const bundled = path.join(tmp, 'bundled')

const results = []
const record = (name, status, detail = '') => {
  const label = status === 'skip' ? 'SKIP' : status ? 'PASS' : 'FAIL'
  results.push({ name, status })
  console.log(`${label}  ${name}${detail ? '  -> ' + detail : ''}`)
}

const CJK_FONTS = [
  'C:\\Windows\\Fonts\\simhei.ttf',
  'C:\\Windows\\Fonts\\simkai.ttf',
  'C:\\Windows\\Fonts\\simfang.ttf',
  'C:\\Windows\\Fonts\\Deng.ttf',
  'C:\\Windows\\Fonts\\msyh.ttc',
  'C:\\Windows\\Fonts\\simsun.ttc',
  '/System/Library/Fonts/PingFang.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
]
const hasCjkFont = CJK_FONTS.some((p) => existsSync(p))

async function bundle(entry, outfile) {
  await build({
    entryPoints: [path.join(root, 'src/main/tools', entry)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    external: ['sharp', 'pdf-lib', '@pdf-lib/fontkit', 'docx', 'pdf-parse', 'electron'],
    logLevel: 'warning'
  })
}

async function makePdf(file, text, pages = 1, rotate = 0) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842])
    p.drawText(`${text} - page ${i + 1}`, { x: 60, y: 760, size: 18 })
    if (rotate) p.setRotation(degrees(rotate))
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
  spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, file], {
    encoding: 'utf8'
  })
  return existsSync(file)
}

async function pageCountOf(file) {
  return (await PDFDocument.load(readFileSync(file))).getPageCount()
}

/**
 * 从 .docx（本质是 zip）里把 word/document.xml 解出来，用于校验正文内容。
 * 走「中央目录」（End Of Central Directory）解析：这里的尺寸信息一定是准的，
 * 而本地文件头常常因为 data descriptor 而写 0。
 */
function readDocxXml(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65535; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null

  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)

  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')

    if (name === 'word/document.xml') {
      if (localOffset + 30 > buf.length) return null
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null
      const lNameLen = buf.readUInt16LE(localOffset + 26)
      const lExtraLen = buf.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + lNameLen + lExtraLen
      const raw = buf.subarray(dataStart, dataStart + csize)
      try {
        return method === 8 ? zlib.inflateRawSync(raw) : raw
      } catch {
        return null
      }
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  return null
}

async function main() {
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(bundled, { recursive: true })

  for (const name of ['images', 'pdf', 'office', 'impose', 'pdf2word']) {
    await bundle(`${name}.ts`, path.join(bundled, `${name}.cjs`))
  }

  const images = require(path.join(bundled, 'images.cjs'))
  const pdf = require(path.join(bundled, 'pdf.cjs'))
  const office = require(path.join(bundled, 'office.cjs'))
  const impose = require(path.join(bundled, 'impose.cjs'))
  const pdf2word = require(path.join(bundled, 'pdf2word.cjs'))

  const assets = path.join(tmp, 'assets')
  const out = path.join(tmp, 'out')
  mkdirSync(assets, { recursive: true })
  mkdirSync(out, { recursive: true })

  const env = await office.detectEnvironment()
  const hasOfficeEngine = env.word || !!env.libreoffice

  /* ---------------- 素材 ---------------- */
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
  const pdfRot = path.join(assets, 'rotated.pdf')
  await makePdf(pdfA, 'Hello world from printshop toolbox', 2)
  await makePdf(pdfB, 'Second document', 3)
  await makePdf(pdfRot, 'Rotated page', 2, 90)

  /* ---------------- 1. 图片格式转换 ---------------- */
  try {
    const convOut = path.join(out, 'imgconv')
    await images.convertImages([png, jpg], convOut, { format: 'webp', quality: 88, maxEdge: 1000 })
    const made = readdirSync(convOut)
    const meta = made.length ? await sharp(path.join(convOut, made[0])).metadata() : null
    record(
      '图片批量转 WebP + 限制最长边',
      made.length === 2 && made.every((f) => f.endsWith('.webp')) && meta.width <= 1000,
      `${made.length} 个文件, 宽=${meta?.width}`
    )
  } catch (e) {
    record('图片批量转 WebP + 限制最长边', false, e.message)
  }

  /* ---------------- 2. 图片转 PDF ---------------- */
  try {
    const target = path.join(out, 'photo-book.pdf')
    const r = await images.imagesToSinglePdf([png, jpg], target, {
      pageSize: 'a4',
      orientation: 'portrait',
      margin: 20
    })
    record('多图合成 A4 PDF', r.ok === 2 && (await pageCountOf(target)) === 2, `页数=${await pageCountOf(target)}`)
  } catch (e) {
    record('多图合成 A4 PDF', false, e.message)
  }

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

  /* ---------------- 3. PDF 合并 / 拆分 ---------------- */
  const mergedFile = path.join(out, 'merged.pdf')
  try {
    await pdf.mergePdfs([pdfA, pdfB], mergedFile)
    record('PDF 合并（2+3 页）', (await pageCountOf(mergedFile)) === 5, `页数=${await pageCountOf(mergedFile)}`)
  } catch (e) {
    record('PDF 合并（2+3 页）', false, e.message)
  }

  try {
    const dir = path.join(out, 'split-every')
    mkdirSync(dir, { recursive: true })
    const files = await pdf.splitPdf(mergedFile, dir, 'every', 2, '')
    const counts = await Promise.all(files.map(pageCountOf))
    record('PDF 按每 2 页拆分', files.length === 3 && counts.join(',') === '2,2,1', counts.join(','))
  } catch (e) {
    record('PDF 按每 2 页拆分', false, e.message)
  }

  try {
    const dir = path.join(out, 'split-ranges')
    mkdirSync(dir, { recursive: true })
    const files = await pdf.splitPdf(mergedFile, dir, 'ranges', 1, '1-3, 5')
    const counts = await Promise.all(files.map(pageCountOf))
    record('PDF 按区间拆分（1-3,5）', files.length === 2 && counts.join(',') === '3,1', counts.join(','))
  } catch (e) {
    record('PDF 按区间拆分（1-3,5）', false, e.message)
  }

  /* ---------------- 4. 加页码 ---------------- */
  try {
    const target = path.join(out, 'numbered-en.pdf')
    await pdf.addPageNumbers(pdfA, target, {
      position: 'bottom-center',
      startNumber: 1,
      fontSize: 11,
      template: 'Page {n} / {total}',
      margin: 28
    })
    record('PDF 加页码（英文模板）', (await pageCountOf(target)) === 2 && statSync(target).size > 800)
  } catch (e) {
    record('PDF 加页码（英文模板）', false, e.message)
  }

  try {
    const target = path.join(out, 'numbered-cn.pdf')
    await pdf.addPageNumbers(pdfA, target, {
      position: 'bottom-center',
      startNumber: 1,
      fontSize: 11,
      template: '第 {n} 页 / 共 {total} 页',
      margin: 28
    })
    record(
      'PDF 加页码（中文模板）',
      (await pageCountOf(target)) === 2 && statSync(target).size > 800,
      `${statSync(target).size} 字节`
    )
  } catch (e) {
    if (/中文字体/.test(e.message)) {
      record('PDF 加页码（中文模板）', 'skip', '本机没有可用中文字体')
    } else {
      record('PDF 加页码（中文模板）', false, e.message)
    }
  }

  /* ---------------- 5. Word 转 PDF ---------------- */
  if (!hasOfficeEngine) {
    record('Word 转 PDF', 'skip', '本机既没有 Office 也没有 LibreOffice')
  } else {
    try {
      const docx = path.join(assets, '自测文档.docx')
      if (!makeDocx(docx)) throw new Error('测试用 .docx 生成失败')
      const r = await office.wordToPdf([docx], path.join(out, 'word'))
      const job = r.jobs[0]
      if (!job.ok || !existsSync(job.output)) throw new Error(job.message || '未生成 PDF')
      record(`Word 转 PDF（引擎=${r.engine}）`, (await pageCountOf(job.output)) >= 1, `页数=${await pageCountOf(job.output)}`)
    } catch (e) {
      record('Word 转 PDF', false, e.message)
    }
  }

  /* ---------------- 6. PDF 转 Word ---------------- */
  try {
    const dir = path.join(out, 'pdf2word')
    const r = await pdf2word.pdfToWord(pdfA, dir, 'text')
    const buf = readFileSync(r.output)
    const isZip = buf.subarray(0, 2).toString('latin1') === 'PK'
    const xml = readDocxXml(buf)
    const body = xml ? xml.toString('utf8') : ''
    const hasText = body.includes('Hello world')
    record(
      'PDF 转 Word（内置文本引擎）',
      isZip && buf.length > 1000 && r.pages === 2 && hasText,
      `docx ${buf.length} 字节, 页数=${r.pages}, 提取 ${r.chars} 字符, 正文命中=${hasText}`
    )
  } catch (e) {
    record('PDF 转 Word（内置文本引擎）', false, e.message)
  }

  if (!env.libreoffice) {
    record('PDF 转 Word（LibreOffice 保版）', 'skip', '未安装 LibreOffice')
  } else {
    try {
      const dir = path.join(out, 'pdf2word-lo')
      const r = await pdf2word.pdfToWord(pdfA, dir, 'libreoffice')
      record('PDF 转 Word（LibreOffice 保版）', existsSync(r.output), path.basename(r.output))
    } catch (e) {
      record('PDF 转 Word（LibreOffice 保版）', false, e.message)
    }
  }

  /* ---------------- 7. 拼版：几何单元测试 ---------------- */
  try {
    const p0 = impose.placeRotated(595, 842, 595, 842, 0)
    const p90 = impose.placeRotated(595, 842, 842, 595, 90)
    const p270 = impose.placeRotated(595, 842, 842, 595, 270)
    const ok =
      p0.scale === 1 &&
      p0.dx === 0 &&
      p0.dy === 0 &&
      Math.abs(p90.footW - 842) < 0.01 &&
      Math.abs(p90.footH - 595) < 0.01 &&
      p90.rotate === 270 &&
      p90.dx === 0 &&
      Math.abs(p90.dy - 595) < 0.01 &&
      Math.abs(p270.footW - 842) < 0.01 &&
      p270.rotate === 90 &&
      Math.abs(p270.dx - 842) < 0.01 &&
      p270.dy === 0
    record('拼版旋转几何（0°/90°/270°）', ok)
  } catch (e) {
    record('拼版旋转几何（0°/90°/270°）', false, e.message)
  }

  try {
    const seq = impose.sequentialSheets(3, 2)
    const book4 = impose.bookletSheets(4)
    const book8 = impose.bookletSheets(8)
    const flat = (s) => s.map((g) => g.join('/')).join('|')
    const ok =
      flat(seq) === '1/2|3/-1' &&
      flat(book4) === '4/1|2/3' &&
      flat(book8) === '8/1|2/7|6/3|4/5'
    record(
      '拼版页序（顺序 / 骑马钉 4 页 / 8 页）',
      ok,
      `4页=${flat(book4)}  8页=${flat(book8)}`
    )
  } catch (e) {
    record('拼版页序（顺序 / 骑马钉 4 页 / 8 页）', false, e.message)
  }

  /* ---------------- 8. 拼版：真实文件 ---------------- */
  try {
    const target = path.join(out, 'imposed-a3.pdf')
    const r = await impose.imposePdf(mergedFile, target, {
      paper: 'a3',
      perSheet: 2,
      order: 'sequential',
      marginMm: 6,
      gapMm: 0,
      cropMarks: true
    })
    const doc = await PDFDocument.load(readFileSync(target))
    const { width, height } = doc.getPage(0).getSize()
    // A3 横向 = 1190.55 x 841.89 pt
    const sizeOk = Math.abs(width - 1190.55) < 1 && Math.abs(height - 841.89) < 1
    record(
      'A3 拼 A4（5 页 → 3 张纸，横向自动选向）',
      r.outputPages === 3 && doc.getPageCount() === 3 && sizeOk && r.grid.cols === 2 && r.grid.rows === 1,
      `纸张=${r.sheetMm.w.toFixed(0)}x${r.sheetMm.h.toFixed(0)}mm, ${r.grid.cols}列${r.grid.rows}行`
    )
  } catch (e) {
    record('A3 拼 A4（5 页 → 3 张纸，横向自动选向）', false, e.message)
  }

  try {
    const target = path.join(out, 'imposed-booklet.pdf')
    const r = await impose.imposePdf(pdfB, target, {
      paper: 'a3',
      perSheet: 2,
      order: 'booklet',
      marginMm: 6,
      gapMm: 0,
      cropMarks: false
    })
    // 3 页 → 补到 4 页 → 2 个面
    record('骑马钉拼版（3 页 → 补 1 张空白 → 2 面）', r.outputPages === 2 && r.paddedBlanks === 1, `面数=${r.outputPages}`)
  } catch (e) {
    record('骑马钉拼版（3 页 → 补 1 张空白 → 2 面）', false, e.message)
  }

  try {
    const target = path.join(out, 'imposed-rotated.pdf')
    const r = await impose.imposePdf(pdfRot, target, {
      paper: 'a3',
      perSheet: 2,
      order: 'sequential',
      marginMm: 6,
      gapMm: 0,
      cropMarks: false
    })
    record('拼版含 /Rotate 90 的旋转页', r.outputPages === 1, `面数=${r.outputPages}`)
  } catch (e) {
    record('拼版含 /Rotate 90 的旋转页', false, e.message)
  }

  try {
    const target = path.join(out, 'imposed-4up.pdf')
    const r = await impose.imposePdf(mergedFile, target, {
      paper: 'a3',
      perSheet: 4,
      order: 'sequential',
      marginMm: 6,
      gapMm: 2,
      cropMarks: true
    })
    record('A3 每张 4 页（5 页 → 2 张）', r.outputPages === 2 && r.grid.cols * r.grid.rows === 4, `${r.grid.cols}列${r.grid.rows}行`)
  } catch (e) {
    record('A3 每张 4 页（5 页 → 2 张）', false, e.message)
  }

  /* ---------------- 汇总 ---------------- */
  const failed = results.filter((r) => r.status === false)
  const skipped = results.filter((r) => r.status === 'skip')
  const passed = results.filter((r) => r.status === true)
  console.log(
    `\n合计 ${results.length} 项：通过 ${passed.length}，失败 ${failed.length}，跳过 ${skipped.length}` +
      (hasCjkFont ? '' : '\n（本机无中文字体，相关用例已跳过）')
  )
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
