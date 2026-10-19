import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  EnvCheck,
  ImageConvertArgs,
  ImagesToPdfArgs,
  OpenDialogOptions,
  PdfMergeArgs,
  PdfPageNumberArgs,
  PdfSplitArgs,
  ProgressEvent,
  TaskResult,
  WordToPdfArgs
} from '../shared/types'
import { defaultOutputDirFor, convertImages, imagesToSeparatePdfs, imagesToSinglePdf } from './tools/images'
import { detectEnvironment, wordToPdf } from './tools/office'
import { uniquePath } from './tools/paths'
import { addPageNumbers, mergePdfs, splitPdf } from './tools/pdf'

function emit(event: Electron.IpcMainInvokeEvent, payload: ProgressEvent): void {
  const wc = event.sender
  if (!wc.isDestroyed()) wc.send('task:progress', payload)
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function registerIpc(): void {
  /* ------------------------- 对话框 ------------------------- */

  ipcMain.handle('dialog:openFiles', async (e, opts: OpenDialogOptions) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      title: opts.title,
      properties: opts.multi === false ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: [{ name: '支持的文件', extensions: opts.extensions }]
    })
    return res.canceled ? [] : res.filePaths
  })

  ipcMain.handle('dialog:openDirectory', async (e, title?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showOpenDialog(win!, {
      title: title ?? '选择输出文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (e, args: { defaultPath: string; extensions: string[]; title?: string }) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const res = await dialog.showSaveDialog(win!, {
      title: args.title ?? '保存文件',
      defaultPath: args.defaultPath,
      filters: [{ name: '文件', extensions: args.extensions }]
    })
    return res.canceled ? null : res.filePath
  })

  /* ------------------------- 系统 ------------------------- */

  ipcMain.handle('env:check', async (): Promise<EnvCheck> => detectEnvironment())

  ipcMain.handle('shell:reveal', async (_e, target: string) => {
    if (target) shell.showItemInFolder(target)
  })

  ipcMain.handle('shell:openPath', async (_e, target: string) => {
    if (target) await shell.openPath(target)
  })

  /* ------------------------- 任务 ------------------------- */

  ipcMain.handle('task:wordToPdf', async (e, args: WordToPdfArgs & { taskId: string }): Promise<TaskResult> => {
    const { taskId, files, outDir, sameFolder } = args
    const total = files.length
    const errors: TaskResult['errors'] = []
    const outputs: string[] = []
    let done = 0
    let succeeded = 0
    let failed = 0

    const result = await wordToPdf(files, sameFolder ? null : outDir, {
      onItem: (input, _ok, message) => {
        done++
        emit(e, { id: taskId, done, total, current: path.basename(input || ''), message })
      }
    })

    for (const job of result.jobs) {
      if (job.ok && job.output) {
        succeeded++
        outputs.push(job.output)
      } else {
        failed++
        errors.push({ input: job.input, message: job.message ?? '转换失败' })
      }
    }

    return { ok: failed === 0, succeeded, failed, outputs, errors }
  })

  ipcMain.handle('task:imageConvert', async (e, args: ImageConvertArgs & { taskId: string }): Promise<TaskResult> => {
    const { taskId, files, outDir, format, quality, maxEdge } = args
    const total = files.length
    const errors: TaskResult['errors'] = []
    const outputs: string[] = []
    let done = 0
    let succeeded = 0
    let failed = 0

    await convertImages(files, outDir, { format, quality, maxEdge }, (input, ok, message) => {
      done++
      if (ok) succeeded++
      else {
        failed++
        errors.push({ input, message: message ?? '转换失败' })
      }
      emit(e, { id: taskId, done, total, current: path.basename(input), message })
    })

    return { ok: failed === 0, succeeded, failed, outputs, errors, outDir }
  })

  ipcMain.handle('task:imagesToPdf', async (e, args: ImagesToPdfArgs & { taskId: string }): Promise<TaskResult> => {
    const { taskId, files, outPath, separateFiles, outDir, pageSize, orientation, margin } = args
    const total = files.length
    const errors: TaskResult['errors'] = []
    let done = 0
    let succeeded = 0
    let failed = 0

    const onItem = (input: string, ok: boolean, message?: string): void => {
      done++
      if (ok) succeeded++
      else {
        failed++
        errors.push({ input, message: message ?? '生成失败' })
      }
      emit(e, { id: taskId, done, total, current: path.basename(input), message })
    }

    if (separateFiles) {
      const dir = outDir || defaultOutputDirFor(files)
      const res = await imagesToSeparatePdfs(files, dir, { pageSize, orientation, margin }, onItem)
      return { ok: res.failed === 0, succeeded: res.ok, failed: res.failed, outputs: res.outputs, errors, outDir: dir }
    }

    const target = outPath ?? path.join(defaultOutputDirFor(files), `合并图片_${Date.now()}.pdf`)
    const res = await imagesToSinglePdf(files, target, { pageSize, orientation, margin }, onItem)
    return { ok: res.failed === 0, succeeded: res.ok, failed: res.failed, outputs: res.outputs, errors }
  })

  ipcMain.handle('task:pdfMerge', async (e, args: PdfMergeArgs & { taskId: string }): Promise<TaskResult> => {
    const { taskId, files, outPath } = args
    emit(e, { id: taskId, done: 0, total: 1, current: '正在合并…' })
    try {
      const target = uniquePath(outPath)
      await mergePdfs(files, target)
      emit(e, { id: taskId, done: 1, total: 1, current: path.basename(target) })
      return { ok: true, succeeded: 1, failed: 0, outputs: [target], errors: [] }
    } catch (err) {
      return { ok: false, succeeded: 0, failed: 1, outputs: [], errors: [{ input: files.join(', '), message: errorText(err) }] }
    }
  })

  ipcMain.handle('task:pdfSplit', async (e, args: PdfSplitArgs & { taskId: string }): Promise<TaskResult> => {
    const { taskId, file, outDir, mode, every, ranges } = args
    try {
      emit(e, { id: taskId, done: 0, total: 1, current: path.basename(file) })
      await fs.mkdir(outDir, { recursive: true })
      const outputs = await splitPdf(file, outDir, mode, every, ranges)
      emit(e, { id: taskId, done: 1, total: 1, current: path.basename(file) })
      return { ok: true, succeeded: outputs.length, failed: 0, outputs, errors: [], outDir }
    } catch (err) {
      return { ok: false, succeeded: 0, failed: 1, outputs: [], errors: [{ input: file, message: errorText(err) }], outDir }
    }
  })

  ipcMain.handle('task:pdfPageNumbers', async (e, args: PdfPageNumberArgs & { taskId: string }): Promise<TaskResult> => {
    const { taskId, files, outDir, position, startNumber, fontSize, template, margin } = args
    const total = files.length
    const errors: TaskResult['errors'] = []
    const outputs: string[] = []
    let succeeded = 0

    await fs.mkdir(outDir, { recursive: true })
    const taken = new Set<string>()

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const target = uniquePath(
          path.join(outDir, `${path.basename(file, path.extname(file))}_带页码.pdf`),
          taken
        )
        await addPageNumbers(file, target, { position, startNumber, fontSize, template, margin })
        outputs.push(target)
        succeeded++
      } catch (err) {
        errors.push({ input: file, message: errorText(err) })
      }
      emit(e, { id: taskId, done: i + 1, total, current: path.basename(file) })
    }

    return { ok: errors.length === 0, succeeded, failed: errors.length, outputs, errors, outDir }
  })
}
