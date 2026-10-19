import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { EnvCheck } from '../../shared/types'
import { outputPathFor, uniquePath } from './paths'

let cachedEnv: EnvCheck | null = null

const PS_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass']

/** 运行一段 PowerShell 并拿到 stdout */
function runPowerShell(script: string, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [...PS_ARGS, '-Command', script], {
      windowsHide: true
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('PowerShell 超时'))
    }, timeoutMs)
    child.stdout.on('data', (d) => (out += d.toString('utf8')))
    child.stderr.on('data', (d) => (err += d.toString('utf8')))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(out.trim() || err.trim())
    })
  })
}

const LIBREOFFICE_CANDIDATES = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
]

async function findLibreOffice(): Promise<string | null> {
  for (const p of LIBREOFFICE_CANDIDATES) {
    if (existsSync(p)) return p
  }
  try {
    const where = await runPowerShell(
      "$c = Get-Command soffice.exe -ErrorAction SilentlyContinue; if ($c) { $c.Source } else { '' }"
    )
    return where && existsSync(where) ? where : null
  } catch {
    return null
  }
}

/** 检测本机可用的 Word->PDF 引擎（结果会缓存） */
export async function detectEnvironment(force = false): Promise<EnvCheck> {
  if (cachedEnv && !force) return cachedEnv

  let word = false
  try {
    const r = await runPowerShell(
      "$ErrorActionPreference='Stop';" +
        'try {' +
        '  $w = New-Object -ComObject Word.Application; $w.Visible=$false;' +
        '  $v = $w.Version; $w.Quit();' +
        "  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($w) | Out-Null;" +
        '  "WORD_OK " + $v' +
        "} catch { 'WORD_NO' }",
      30_000
    )
    word = r.includes('WORD_OK')
  } catch {
    word = false
  }

  cachedEnv = {
    word,
    libreoffice: await findLibreOffice(),
    platform: process.platform
  }
  return cachedEnv
}

/* ------------------------------------------------------------------ */
/* Word (Microsoft Office COM) 批量转换                                  */
/* ------------------------------------------------------------------ */

const WORD_SCRIPT = String.raw`
param([Parameter(Mandatory=$true)][string]$PayloadPath)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'

$payload = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json

try {
  $word = New-Object -ComObject Word.Application
} catch {
  Write-Output ("FATAL" + [char]9 + "无法启动 Word：" + $_.Exception.Message)
  exit 1
}

$word.Visible = $false
$word.DisplayAlerts = 0
$word.Options.WarnBeforeSavingPrintingSendingMarkup = $false
$wdFormatPDF = 17
$fail = 0

foreach ($item in $payload.files) {
  try {
    $doc = $word.Documents.Open($item.input, $false, $true)
    $doc.SaveAs([ref]$item.output, [ref]$wdFormatPDF)
    $doc.Close([ref]$false)
    Write-Output ("OK" + [char]9 + $item.input)
  } catch {
    $fail++
    Write-Output ("ERR" + [char]9 + $item.input + [char]9 + $_.Exception.Message)
  }
}

try { $word.Quit() } catch {}
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
[GC]::Collect()
exit 0
`

type Job = { input: string; output: string }

export type ConvertHooks = {
  onItem?: (input: string, ok: boolean, message?: string) => void
}

/** 用本机 Office 批量把 Word 转成 PDF */
async function convertWithWord(jobs: Job[], hooks: ConvertHooks = {}): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'psx-word-'))
  const scriptPath = path.join(tmpDir, 'convert.ps1')
  const payloadPath = path.join(tmpDir, 'payload.json')

  // 带 BOM 写入，保证 PowerShell 5.1 正确识别脚本中的中文
  await fs.writeFile(scriptPath, '\uFEFF' + WORD_SCRIPT, 'utf8')
  await fs.writeFile(payloadPath, JSON.stringify({ files: jobs }), 'utf8')

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [...PS_ARGS, '-File', scriptPath, '-PayloadPath', payloadPath],
      { windowsHide: true }
    )
    let buf = ''
    const seen = new Set<string>()

    const handleLine = (line: string): void => {
      const t = line.trim()
      if (!t) return
      const [tag, input, message] = t.split('\t')
      if (tag === 'OK') {
        seen.add(input)
        hooks.onItem?.(input, true)
      } else if (tag === 'ERR') {
        seen.add(input)
        hooks.onItem?.(input, false, message)
      } else if (tag === 'FATAL') {
        reject(new Error(message || 'Word 启动失败'))
      }
    }

    child.stdout.on('data', (d) => {
      buf += d.toString('utf8')
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        handleLine(buf.slice(0, idx))
        buf = buf.slice(idx + 1)
      }
    })
    child.on('error', reject)
    child.on('close', () => {
      if (buf.trim()) handleLine(buf)
      // 未上报的文件（Word 静默跳过）统一按失败处理
      for (const j of jobs) {
        if (!seen.has(j.input)) hooks.onItem?.(j.input, false, 'Word 未返回结果')
      }
      resolve()
    })
  })

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
}

/* ------------------------------------------------------------------ */
/* LibreOffice 批量转换                                                  */
/* ------------------------------------------------------------------ */

async function convertWithLibreOffice(
  soffice: string,
  jobs: Job[],
  targetExt: string,
  hooks: ConvertHooks = {}
): Promise<void> {
  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'psx-lo-'))
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'psx-loprofile-'))

  const args = [
    `-env:UserInstallation=file:///${profileDir.replace(/\\/g, '/')}`,
    '--headless',
    '--norestore',
    '--convert-to',
    targetExt,
    '--outdir',
    stageDir,
    ...jobs.map((j) => j.input)
  ]

  await new Promise<void>((resolve, reject) => {
    const child = spawn(soffice, args, { windowsHide: true })
    let err = ''
    child.stderr.on('data', (d) => (err += d.toString('utf8')))
    child.on('error', reject)
    child.on('close', () => {
      if (err.trim()) hooks?.onItem?.('', false, err.trim())
      resolve()
    })
  })

  // LibreOffice 按「同名换扩展名」输出到 stageDir，这里再搬运到唯一路径
  for (const job of jobs) {
    const produced = path.join(stageDir, path.basename(job.output, path.extname(job.output)) + '.' + targetExt)
    const fallback = path.join(stageDir, path.basename(job.input, path.extname(job.input)) + '.' + targetExt)
    const src = existsSync(produced) ? produced : fallback
    if (existsSync(src)) {
      await fs.copyFile(src, job.output)
      hooks?.onItem?.(job.input, true)
    } else {
      hooks?.onItem?.(job.input, false, 'LibreOffice 未生成输出文件')
    }
  }

  await fs.rm(stageDir, { recursive: true, force: true }).catch(() => {})
  await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {})
}

/* ------------------------------------------------------------------ */
/* 对外统一入口                                                          */
/* ------------------------------------------------------------------ */

export type OfficeConvertOutcome = {
  engine: 'word' | 'libreoffice' | 'none'
  jobs: { input: string; output: string | null; ok: boolean; message?: string }[]
}

/**
 * 把一批 Word 文档转成 PDF。
 * @param files  源文件绝对路径
 * @param outDir 输出目录；传 null 表示与源文件同目录
 */
export async function wordToPdf(
  files: string[],
  outDir: string | null,
  hooks: ConvertHooks = {}
): Promise<OfficeConvertOutcome> {
  const env = await detectEnvironment()
  const engine: OfficeConvertOutcome['engine'] = env.word
    ? 'word'
    : env.libreoffice
      ? 'libreoffice'
      : 'none'

  if (engine === 'none') {
    throw new Error(
      '本机没有找到可用的转换引擎。请安装 Microsoft Office 或 LibreOffice 后重试。'
    )
  }

  const taken = new Set<string>()
  const results = new Map<string, { output: string | null; ok: boolean; message?: string }>()
  const jobs: Job[] = []

  for (const f of files) {
    const dir = outDir ?? path.dirname(f)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const out = outputPathFor(f, dir, '.pdf', taken)
    jobs.push({ input: f, output: out })
    results.set(f, { output: out, ok: false })
  }

  const wrapped: ConvertHooks = {
    onItem: (input, ok, message) => {
      if (input && results.has(input)) {
        results.get(input)!.ok = ok
        if (message) results.get(input)!.message = message
      }
      hooks?.onItem?.(input, ok, message)
    }
  }

  if (engine === 'word') {
    await convertWithWord(jobs, wrapped)
  } else {
    await convertWithLibreOffice(env.libreoffice!, jobs, 'pdf', wrapped)
  }

  return {
    engine,
    jobs: jobs.map((j) => ({
      input: j.input,
      output: results.get(j.input)?.ok ? j.output : results.get(j.input)?.output ?? null,
      ok: results.get(j.input)?.ok ?? false,
      message: results.get(j.input)?.message
    }))
  }
}

/** 用 LibreOffice 转成其它格式（用于 PDF->Word 等场景） */
export async function libreOfficeConvert(
  files: string[],
  targetExt: string,
  outDir: string
): Promise<{ input: string; output: string; ok: boolean; message?: string }[]> {
  const env = await detectEnvironment()
  if (!env.libreoffice) throw new Error('未安装 LibreOffice，无法使用该转换。')
  const taken = new Set<string>()
  const jobs = files.map<Job>((f) => ({
    input: f,
    output: outputPathFor(f, outDir, '.' + targetExt, taken)
  }))
  const out: { input: string; output: string; ok: boolean; message?: string }[] = []
  await convertWithLibreOffice(env.libreoffice, jobs, targetExt, {
    onItem: (input, ok, message) => {
      if (!input) return
      const job = jobs.find((j) => j.input === input)
      out.push({ input, output: job?.output ?? '', ok, message })
    }
  })
  return out
}

export { uniquePath }
