/**
 * Lädt Code-Signing-Secrets aus .env.signing oder certs/codesign.pfx.
 * Setzt WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD für electron-builder.
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

function resolveLink(link) {
  if (!link) return ''
  if (link.includes('://') || /^[A-Za-z0-9+/=]{100,}$/.test(link)) return link
  const abs = path.isAbsolute(link) ? link : path.join(root, link)
  return abs
}

function applySigningEnv() {
  loadDotEnv(path.join(root, '.env.signing'))

  const defaultPfx = path.join(root, 'certs', 'codesign.pfx')
  if (!process.env.WIN_CSC_LINK && !process.env.CSC_LINK && fs.existsSync(defaultPfx)) {
    process.env.WIN_CSC_LINK = defaultPfx
  }

  if (process.env.WIN_CSC_LINK) {
    process.env.WIN_CSC_LINK = resolveLink(process.env.WIN_CSC_LINK)
  }
  if (process.env.CSC_LINK) {
    process.env.CSC_LINK = resolveLink(process.env.CSC_LINK)
  }

  const link = process.env.WIN_CSC_LINK || process.env.CSC_LINK || ''
  const hasFile = link && !link.includes('://') && fs.existsSync(link)
  const hasData = Boolean(link && (link.includes('://') || link.length > 100))
  const ready = Boolean((hasFile || hasData) && (process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD))

  return {
    ready,
    link: hasFile ? link : link ? '(base64/url)' : '',
  }
}

module.exports = { applySigningEnv }
