/**
 * Beendet den Prozess, der auf dem angegebenen Port lauscht (Windows/macOS/Linux).
 * Verhindert "Port already in use" beim erneuten Start von Vite.
 */
import { execSync } from 'node:child_process'

const port = Number(process.argv[2] || 5173)
if (!Number.isFinite(port)) process.exit(0)

function pidsOnPort(p) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8' })
      const pids = new Set()
      for (const line of out.split(/\r?\n/)) {
        // EN: LISTENING · DE: ABHÖREN (netstat lokalisiert)
        if (!line.includes(`:${p}`) || !/LISTENING|ABH[OÖ]REN/i.test(line)) continue
        const parts = line.trim().split(/\s+/)
        const pid = Number(parts[parts.length - 1])
        if (pid > 0) pids.add(pid)
      }
      return [...pids]
    }
    const out = execSync(`lsof -tiTCP:${p} -sTCP:LISTEN`, {
      encoding: 'utf8',
    }).trim()
    return out
      ? out
          .split(/\s+/)
          .map(Number)
          .filter((n) => n > 0)
      : []
  } catch {
    return []
  }
}

const pids = pidsOnPort(port)
for (const pid of pids) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
    }
    console.log(`[free-port] Prozess ${pid} auf Port ${port} beendet`)
  } catch {
    /* schon weg */
  }
}
