import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  EnvCheck,
  ImageConvertArgs,
  ImagesToPdfArgs,
  ImposeArgs,
  OpenDialogOptions,
  PdfMergeArgs,
  PdfPageNumberArgs,
  PdfSplitArgs,
  PdfToWordArgs,
  ProgressEvent,
  TaskResult,
  WordToPdfArgs
} from '../shared/types'

const api = {
  /** 取拖拽进窗口的文件的真实路径（Electron 29+ 必须用 webUtils） */
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },

  openFiles(opts: OpenDialogOptions): Promise<string[]> {
    return ipcRenderer.invoke('dialog:openFiles', opts)
  },

  openDirectory(title?: string): Promise<string | null> {
    return ipcRenderer.invoke('dialog:openDirectory', title)
  },

  saveFile(args: { defaultPath: string; extensions: string[]; title?: string }): Promise<string | null> {
    return ipcRenderer.invoke('dialog:saveFile', args)
  },

  checkEnv(): Promise<EnvCheck> {
    return ipcRenderer.invoke('env:check')
  },

  reveal(target: string): Promise<void> {
    return ipcRenderer.invoke('shell:reveal', target)
  },

  openPath(target: string): Promise<void> {
    return ipcRenderer.invoke('shell:openPath', target)
  },

  wordToPdf(args: WordToPdfArgs & { taskId: string }): Promise<TaskResult> {
    return ipcRenderer.invoke('task:wordToPdf', args)
  },

  imageConvert(args: ImageConvertArgs & { taskId: string }): Promise<TaskResult> {
    return ipcRenderer.invoke('task:imageConvert', args)
  },

  imagesToPdf(args: ImagesToPdfArgs & { taskId: string }): Promise<TaskResult> {
    return ipcRenderer.invoke('task:imagesToPdf', args)
  },

  pdfMerge(args: PdfMergeArgs & { taskId: string }): Promise<TaskResult> {
    return ipcRenderer.invoke('task:pdfMerge', args)
  },

  pdfSplit(args: PdfSplitArgs & { taskId: string }): Promise<TaskResult> {
    return ipcRenderer.invoke('task:pdfSplit', args)
  },

  pdfPageNumbers(args: PdfPageNumberArgs & { taskId: string }): Promise<TaskResult> {
    return ipcRenderer.invoke('task:pdfPageNumbers', args)
  },

  pdfToWord(args: PdfToWordArgs & { taskId: string }): Promise<TaskResult> {
    return ipcRenderer.invoke('task:pdfToWord', args)
  },

  impose(args: ImposeArgs & { taskId: string }): Promise<TaskResult> {
    return ipcRenderer.invoke('task:impose', args)
  },

  onProgress(cb: (p: ProgressEvent) => void): () => void {
    const handler = (_e: Electron.IpcRendererEvent, p: ProgressEvent): void => cb(p)
    ipcRenderer.on('task:progress', handler)
    return () => ipcRenderer.removeListener('task:progress', handler)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
