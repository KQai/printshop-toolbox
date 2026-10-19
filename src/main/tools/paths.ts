import { existsSync } from 'node:fs'
import path from 'node:path'

/** 取文件名（不含扩展名） */
export function stem(file: string): string {
  return path.basename(file, path.extname(file))
}

/** 保证目标路径不与已有文件冲突，冲突时追加 -1 / -2 ... */
export function uniquePath(target: string, taken?: Set<string>): string {
  const dir = path.dirname(target)
  const ext = path.extname(target)
  const base = path.basename(target, ext)
  let candidate = target
  let i = 1
  while (existsSync(candidate) || (taken?.has(candidate.toLowerCase()) ?? false)) {
    candidate = path.join(dir, `${base}-${i}${ext}`)
    i++
  }
  taken?.add(candidate.toLowerCase())
  return candidate
}

/** 拼接输出路径：同名换扩展名，落盘到指定目录 */
export function outputPathFor(
  input: string,
  outDir: string,
  newExt: string,
  taken?: Set<string>
): string {
  const name = stem(input) + (newExt.startsWith('.') ? newExt : '.' + newExt)
  return uniquePath(path.join(outDir, name), taken)
}

export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'gif', 'bmp', 'heic']
