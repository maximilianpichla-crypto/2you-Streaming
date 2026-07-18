/**
 * Baut den Windows-NSIS-Installer und veröffentlicht ihn als GitHub Release.
 *
 * Nutzer laden nur die Setup.exe — kein Quellcode-Zip nötig.
 *
 *   npm run release
 *   npm run release -- --version 1.0.1 --notes "Audio-Fix"
 *   npm run release -- --skip-build
 *   npm run release -- --require-sign   (bricht ab ohne gültige Signatur)
 *   npm run release -- --draft
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { applySigningEnv } = require('./signing-env.cjs')

const root = path.join(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const releaseDir = path.join(root, 'release-out')
const legacyReleaseDir = path.join(root, 'release')
const tempReleaseDir = path.join(process.env.TEMP || process.env.TMP || '', '2you-ebuild')
const feedPath = path.join(root, 'updates', 'feed.json')

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  return process.argv[i + 1] ?? fallback
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function run(cmd, opts = {}) {
  console.log('>', cmd)
  execSync(cmd, { stdio: 'inherit', cwd: root, env: process.env, ...opts })
}

function findInstaller(version) {
  const dirs = [releaseDir, legacyReleaseDir, tempReleaseDir].filter(
    (d) => d && fs.existsSync(d),
  )
  for (const dir of dirs) {
    const preferred = path.join(dir, `2you-Streaming-Setup-${version}.exe`)
    if (fs.existsSync(preferred)) return preferred
  }

  for (const dir of dirs) {
    const matches = fs
      .readdirSync(dir)
      .filter(
        (f) =>
          f.toLowerCase().endsWith('.exe') &&
          !f.toLowerCase().includes('uninstall') &&
          (f.includes('Setup') || f.includes('2you')),
      )
      .map((f) => path.join(dir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    if (matches[0]) return matches[0]
  }
  return null
}

function siblingArtifacts(installerPath) {
  const dir = path.dirname(installerPath)
  const base = path.basename(installerPath)
  const files = [installerPath]
  for (const name of [`${base}.blockmap`, 'latest.yml', 'latest.yaml']) {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) files.push(p)
  }
  return files
}

function checkSignature(file) {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-AuthenticodeSignature -FilePath '${file.replace(/'/g, "''")}').Status"`,
      { encoding: 'utf8', cwd: root },
    )
      .toString()
      .trim()
    return out
  } catch {
    return 'Unknown'
  }
}

const signing = applySigningEnv()
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const version = arg('version') || pkg.version
const notes =
  arg('notes') ||
  `2you Streaming ${version}\n\nInstaller herunterladen, ausführen und fertig — Einstellungen bleiben erhalten.`
const draft = hasFlag('draft')
const skipBuild = hasFlag('skip-build')
const requireSign = hasFlag('require-sign')

if (arg('version') && arg('version') !== pkg.version) {
  pkg.version = version
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log('[release] package.json Version →', version)
}

if (signing.ready) {
  console.log('[release] Code-Signing aktiv:', signing.link)
} else {
  console.warn(
    '[release] KEIN Code-Signing-Zertifikat — Windows zeigt SmartScreen/„unbekannter Herausgeber“.',
  )
  console.warn(
    '[release] Zertifikat als certs/codesign.pfx legen + .env.signing (siehe .env.signing.example).',
  )
  if (requireSign) {
    console.error('[release] Abbruch wegen --require-sign')
    process.exit(1)
  }
}

if (!skipBuild) {
  if (!fs.existsSync(path.join(root, 'resources', 'ffmpeg', 'ffmpeg.exe'))) {
    console.log('[release] FFmpeg fehlt — hole…')
    run('npm run fetch-ffmpeg')
  }
  if (
    !fs.existsSync(
      path.join(root, 'resources', 'wasapi-capture', 'audio_capture.exe'),
    )
  ) {
    console.warn(
      '[release] Warnung: resources/wasapi-capture/audio_capture.exe fehlt — Desktop-/App-Audio im Installer ggf. ohne Helper.',
    )
  }
  run('npm run electron:build')
}

const installer = findInstaller(version)
if (!installer) {
  console.error(
    '[release] Keine Setup.exe in release/ gefunden. Zuerst npm run electron:build.',
  )
  process.exit(1)
}

const sizeMb = (fs.statSync(installer).size / (1024 * 1024)).toFixed(1)
const sigStatus = checkSignature(installer)
console.log(`[release] Installer: ${installer} (${sizeMb} MB)`)
console.log(`[release] Signatur-Status: ${sigStatus}`)
if (sigStatus !== 'Valid') {
  console.warn(
    '[release] Installer ist NICHT vertrauenswürdig signiert — SmartScreen-Warnung bleibt.',
  )
  if (requireSign) process.exit(1)
}

const tag = `v${version}`
const title = arg('title') || `2you Streaming ${version}`
const draftFlag = draft ? ' --draft' : ''
const artifacts = siblingArtifacts(installer)
const artifactArgs = artifacts.map((f) => `"${f}"`).join(' ')

try {
  execSync(`gh release view ${tag}`, {
    cwd: root,
    stdio: 'pipe',
    shell: true,
  })
  console.log(`[release] Release ${tag} existiert — Assets werden aktualisiert…`)
  for (const file of artifacts) {
    run(`gh release upload ${tag} "${file}" --clobber`)
  }
} catch {
  run(
    `gh release create ${tag} ${artifactArgs} --title "${title.replace(/"/g, '\\"')}" --notes "${notes.replace(/"/g, '\\"')}"${draftFlag}`,
  )
}

let downloadUrl = ''
try {
  const api = execSync(`gh release view ${tag} --json assets,url`, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
  })
  const data = JSON.parse(api)
  downloadUrl = `https://github.com/maximilianpichla-crypto/2you-Streaming/releases/download/${tag}/${path.basename(installer)}`
  console.log('[release] Download-URL:', downloadUrl)
  console.log('[release] Release-Seite:', data.url)
} catch (err) {
  console.warn('[release] URL konnte nicht gelesen werden:', err.message)
  downloadUrl = `https://github.com/maximilianpichla-crypto/2you-Streaming/releases/download/${tag}/${path.basename(installer)}`
}

const existing = fs.existsSync(feedPath)
  ? JSON.parse(fs.readFileSync(feedPath, 'utf8'))
  : {}

const feed = {
  ...existing,
  version,
  publishedAt: new Date().toISOString(),
  downloadUrl,
  title: existing.title || `Version ${version}`,
  body:
    'Update wird beim Start automatisch geladen und beim Beenden installiert. Einstellungen bleiben erhalten.',
  level: 'update',
  announcements: existing.announcements || [],
}

fs.mkdirSync(path.dirname(feedPath), { recursive: true })
fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2), 'utf8')
console.log('[release] updates/feed.json → downloadUrl gesetzt')
console.log('')
console.log('Fertig. Nutzer laden nur den Installer:')
console.log(' ', downloadUrl)
