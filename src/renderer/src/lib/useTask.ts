import { useCallback, useEffect, useState } from 'react'
import type { ProgressEvent, TaskResult } from '../../../shared/types'

function readableError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  // 去掉 Electron IPC 的包装前缀
  const m = /Error invoking remote method '[^']+':\s*(?:Error:\s*)?(.*)/s.exec(raw)
  return (m ? m[1] : raw).trim()
}

export type TaskRunner = {
  running: boolean
  progress: ProgressEvent | null
  result: TaskResult | null
  error: string | null
  run: (fn: (taskId: string) => Promise<TaskResult>) => Promise<TaskResult | null>
  reset: () => void
}

export function useTask(): TaskRunner {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [result, setResult] = useState<TaskResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => window.api.onProgress(setProgress), [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setProgress(null)
  }, [])

  const run = useCallback(async (fn: (taskId: string) => Promise<TaskResult>) => {
    setRunning(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      const r = await fn(crypto.randomUUID())
      setResult(r)
      return r
    } catch (e) {
      setError(readableError(e))
      return null
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }, [])

  return { running, progress, result, error, run, reset }
}
