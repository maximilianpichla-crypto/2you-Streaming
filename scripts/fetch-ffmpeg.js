/**
 * Downloads a Windows FFmpeg build into resources/ffmpeg/ffmpeg.exe
 */
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const { execSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'resources', 'ffmpeg')
const ZIP_PATH = path.join(OUT_DIR, 'ffmpeg.zip')
// BtbN shared builds – essentials gpl
const URL =
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip'

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const get = (u) => {
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            get(res.headers.location)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${res.statusCode}`))
            return
          }
          res.pipe(file)
          file.on('finish', () => file.close(() => resolve()))
        })
        .on('error', reject)
    }
    get(url)
  })
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const target = path.join(OUT_DIR, 'ffmpeg.exe')
  if (fs.existsSync(target)) {
    console.log('FFmpeg already present:', target)
    return
  }

  console.log('Downloading FFmpeg…')
  await download(URL, ZIP_PATH)
  console.log('Extracting…')

  // Prefer PowerShell Expand-Archive
  try {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${OUT_DIR}' -Force"`,
      { stdio: 'inherit' },
    )
  } catch (err) {
    console.error('Extract failed', err)
    process.exit(1)
  }

  // Find ffmpeg.exe in extracted tree
  function findExe(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isFile() && e.name.toLowerCase() === 'ffmpeg.exe') return full
      if (e.isDirectory()) {
        const found = findExe(full)
        if (found) return found
      }
    }
    return null
  }

  const found = findExe(OUT_DIR)
  if (!found) {
    console.error('ffmpeg.exe not found after extract')
    process.exit(1)
  }

  if (path.resolve(found) !== path.resolve(target)) {
    fs.copyFileSync(found, target)
  }

  // Also copy sibling DLLs if shared build
  const binDir = path.dirname(found)
  for (const name of fs.readdirSync(binDir)) {
    if (name.toLowerCase().endsWith('.dll')) {
      fs.copyFileSync(path.join(binDir, name), path.join(OUT_DIR, name))
    }
  }

  try {
    fs.unlinkSync(ZIP_PATH)
  } catch {
    // ignore
  }

  console.log('FFmpeg ready at', target)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
