import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { outputPathFor } from './paths'

/* ------------------------------------------------------------------ */
/* 图片格式批量转换                                                      */
/* ------------------------------------------------------------------ */

export type ImageConvertOptions = {
  format: 'jpeg' | 'png' | 'webp' | 'avif'
  quality: number
  maxEdge: number
}

const EXT_BY_FORMAT: Record<ImageConvertOptions['format'], string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif'
}

export async function convertImages(
  files: string[],
  outDir: string,
  opts: ImageConvertOptions,
  onItem?: (input: string, ok: boolean, message?: string) => void
): Promise<void> {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const taken = new Set<string>()

  for (const file of files) {
    try {
      const ext = EXT_BY_FORMAT[opts.format]
      const out = outputPathFor(file, outDir, '.' + ext, taken)

      let pipeline = sharp(file, { failOn: 'none' }).rotate()
      if (opts.maxEdge > 0) {
        pipeline = pipeline.resize({
          width: opts.maxEdge,
          height: opts.maxEdge,
          fit: 'inside',
          withoutEnlargement: true
        })
      }

      switch (opts.format) {
        case 'jpeg':
          // JPEG 不支持透明，先铺白底，否则透明区域会变黑
          pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: opts.quality })
          break
        case 'png':
          pipeline = pipeline.png({ compressionLevel: 9 })
          break
        case 'webp':
          pipeline = pipeline.webp({ quality: opts.quality })
          break
        case 'avif':
          pipeline = pipeline.avif({ quality: opts.quality })
          break
      }

      await pipeline.toFile(out)
      onItem?.(file, true)
    } catch (e) {
      onItem?.(file, false, (e as Error).message)
    }
  }
}

/* ------------------------------------------------------------------ */
/* 图片 -> PDF                                                          */
/* ------------------------------------------------------------------ */

export type ImagesToPdfOptions = {
  pageSize: 'fit' | 'a4' | 'a3'
  orientation: 'portrait' | 'landscape'
  margin: number
  /** 与源文件同目录输出 */
  outDir: string
}

const PT_PER_PX = 72 / 96 // 按 96dpi 屏幕像素折算成 PDF 点

const PAGE_SIZES = {
  a4: { w: 595.28, h: 841.89 },
  a3: { w: 841.89, h: 1190.55 }
}

/** 把单张图片渲染成 jpeg buffer（统一格式，顺带修正 EXIF 方向） */
async function toJpeg(file: string): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(file, { failOn: 'none' })
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 92 })
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** 把一批图片合并成一个 PDF（顺序即传入顺序） */
export async function imagesToSinglePdf(
  files: string[],
  outPath: string,
  opts: Pick<ImagesToPdfOptions, 'pageSize' | 'orientation' | 'margin'>,
  onItem?: (input: string, ok: boolean, message?: string) => void
): Promise<{ ok: number; failed: number; outputs: string[] }> {
  const pdf = await PDFDocument.create()
  let ok = 0
  let failed = 0

  for (const file of files) {
    try {
      const jpg = await toJpeg(file)
      const embedded = await pdf.embedJpg(jpg.data)

      if (opts.pageSize === 'fit') {
        const w = jpg.width * PT_PER_PX
        const h = jpg.height * PT_PER_PX
        const page = pdf.addPage([w, h])
        page.drawImage(embedded, { x: 0, y: 0, width: w, height: h })
      } else {
        const base = PAGE_SIZES[opts.pageSize]
        const [pw, ph] =
          opts.orientation === 'portrait' ? [base.w, base.h] : [base.h, base.w]
        const page = pdf.addPage([pw, ph])
        const maxW = pw - opts.margin * 2
        const maxH = ph - opts.margin * 2
        const scale = Math.min(maxW / jpg.width, maxH / jpg.height)
        const w = jpg.width * scale
        const h = jpg.height * scale
        page.drawImage(embedded, {
          x: (pw - w) / 2,
          y: (ph - h) / 2,
          width: w,
          height: h
        })
      }
      ok++
      onItem?.(file, true)
    } catch (e) {
      failed++
      onItem?.(file, false, (e as Error).message)
    }
  }

  const bytes = await pdf.save()
  const { promises: fs } = await import('node:fs')
  await fs.writeFile(outPath, bytes)
  return { ok, failed, outputs: [outPath] }
}

/** 每张图片各生成一个 PDF */
export async function imagesToSeparatePdfs(
  files: string[],
  outDir: string,
  opts: Pick<ImagesToPdfOptions, 'pageSize' | 'orientation' | 'margin'>,
  onItem?: (input: string, ok: boolean, message?: string) => void
): Promise<{ ok: number; failed: number; outputs: string[] }> {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const taken = new Set<string>()
  const outputs: string[] = []
  let ok = 0
  let failed = 0

  for (const file of files) {
    try {
      const out = outputPathFor(file, outDir, '.pdf', taken)
      const res = await imagesToSinglePdf([file], out, opts)
      if (res.ok > 0) {
        ok++
        outputs.push(out)
        onItem?.(file, true)
      } else {
        failed++
        onItem?.(file, false, '生成失败')
      }
    } catch (e) {
      failed++
      onItem?.(file, false, (e as Error).message)
    }
  }
  return { ok, failed, outputs }
}

export function defaultOutputDirFor(files: string[]): string {
  return files.length ? path.dirname(files[0]) : process.cwd()
}
