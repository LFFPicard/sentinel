import fs from 'fs'
import path from 'path'

const LOG_PATH = process.env.LOG_PATH ?? '/data/logs/collector.log'
const MAX_BYTES = 10 * 1024 * 1024  // 10 MB
const KEEP_FILES = 3                  // collector.log, .1, .2

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function rotate(): void {
  for (let i = KEEP_FILES - 2; i >= 1; i--) {
    const from = `${LOG_PATH}.${i}`
    const to = `${LOG_PATH}.${i + 1}`
    if (fs.existsSync(from)) {
      try { fs.renameSync(from, to) } catch { /* ignore */ }
    }
  }
  if (fs.existsSync(LOG_PATH)) {
    try { fs.renameSync(LOG_PATH, `${LOG_PATH}.1`) } catch { /* ignore */ }
  }
}

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const line = `[${timestamp()}] [${level}] ${message}\n`

  if (level === 'ERROR') process.stderr.write(line)
  else process.stdout.write(line)

  try {
    const dir = path.dirname(LOG_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    try {
      if (fs.statSync(LOG_PATH).size >= MAX_BYTES) rotate()
    } catch { /* file doesn't exist yet */ }

    fs.appendFileSync(LOG_PATH, line)
  } catch (fileErr) {
    process.stderr.write(`[logger] File write failed: ${fileErr}\n`)
  }
}

export const log = {
  info:  (msg: string) => write('INFO', msg),
  warn:  (msg: string) => write('WARN', msg),
  error: (msg: string) => write('ERROR', msg),
}
