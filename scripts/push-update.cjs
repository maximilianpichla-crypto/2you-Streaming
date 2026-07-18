/**
 * Schreibt eine Nachricht / Version in updates/feed.json.
 *
 * Beispiele:
 *   npm run push-update -- --title "Neues Update" --body "Badges im Chat"
 *   npm run push-update -- --version 1.1.0 --title "v1.1" --body "..." --level update
 *   npm run push-update -- --announce "Wartung" --body "Heute 22 Uhr kurz offline"
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const feedPath = path.join(root, 'updates', 'feed.json')
const pkgPath = path.join(root, 'package.json')

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  return process.argv[i + 1] ?? fallback
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const existing = fs.existsSync(feedPath)
  ? JSON.parse(fs.readFileSync(feedPath, 'utf8'))
  : {
      version: pkg.version,
      publishedAt: new Date().toISOString(),
      minVersion: null,
      downloadUrl: '',
      title: '',
      body: '',
      level: 'info',
      announcements: [],
    }

const title = arg('title') || arg('announce') || existing.title || 'Update'
const body = arg('body') || existing.body || ''
const version = arg('version') || existing.version || pkg.version
const level = arg('level') || (arg('announce') ? 'info' : 'update')
const downloadUrl = arg('download') || existing.downloadUrl || ''
const minVersion = hasFlag('force') ? version : (existing.minVersion ?? null)

const announcements = Array.isArray(existing.announcements)
  ? [...existing.announcements]
  : []

if (arg('announce') || hasFlag('push-announcement')) {
  announcements.unshift({
    id: `a-${Date.now()}`,
    title,
    body,
    level,
    createdAt: new Date().toISOString(),
  })
}

const feed = {
  version,
  publishedAt: new Date().toISOString(),
  minVersion,
  downloadUrl,
  title,
  body,
  level,
  announcements: announcements.slice(0, 20),
}

fs.mkdirSync(path.dirname(feedPath), { recursive: true })
fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2), 'utf8')
console.log('[push-update] Feed geschrieben:', feedPath)
console.log(JSON.stringify(feed, null, 2))

const remoteUrl = process.env.TWOYOU_UPDATE_URL || ''
const deployCmd = process.env.TWOYOU_UPDATE_DEPLOY
if (deployCmd) {
  console.log('[push-update] Deploy…')
  execSync(deployCmd, { stdio: 'inherit', cwd: root, env: process.env })
  console.log('[push-update] Deploy fertig.', remoteUrl || '')
} else if (remoteUrl) {
  console.log(
    '[push-update] Hinweis: TWOYOU_UPDATE_URL ist gesetzt, aber kein TWOYOU_UPDATE_DEPLOY.',
  )
} else {
  console.log(
    '[push-update] Lokal gespeichert. Für Nutzer-Apps: Feed-URL setzen oder updates/feed.json hosten.',
  )
}
