import { app, dialog, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)

export type TwoYouPluginType = 'browser' | 'unsupported-obs'

export interface TwoYouPluginManifest {
  id: string
  name: string
  version: string
  type: 'browser' | 'overlay' | 'obs-native'
  entry?: string
  description?: string
  author?: string
}

export interface InstalledPlugin {
  id: string
  name: string
  version: string
  type: TwoYouPluginType
  description: string
  author: string
  enabled: boolean
  dir: string
  /** file:// URL für Browser-Quellen */
  entryUrl: string | null
  warning?: string
}

type PluginState = {
  enabled: Record<string, boolean>
}

function pluginsRoot(): string {
  return path.join(app.getPath('userData'), 'plugins')
}

function statePath(): string {
  return path.join(app.getPath('userData'), 'plugins-state.json')
}

function readState(): PluginState {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as PluginState
    return { enabled: raw.enabled && typeof raw.enabled === 'object' ? raw.enabled : {} }
  } catch {
    return { enabled: {} }
  }
}

function writeState(state: PluginState): void {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true })
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
}

function ensurePluginsDir(): string {
  const root = pluginsRoot()
  fs.mkdirSync(root, { recursive: true })
  ensureSamplePlugin(root)
  return root
}

function ensureSamplePlugin(root: string): void {
  const dir = path.join(root, 'sample-now-playing')
  const manifestPath = path.join(dir, 'plugin.json')
  if (fs.existsSync(manifestPath)) return
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        id: 'sample-now-playing',
        name: 'Sample Overlay',
        version: '1.0.0',
        type: 'browser',
        entry: 'index.html',
        description: 'Beispiel-Plugin (Browser-Overlay). Eigene Plugins als Ordner mit plugin.json ablegen.',
        author: 'maxxxxxxxxam',
      },
      null,
      2,
    ),
    'utf8',
  )
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <style>
    html, body { margin: 0; background: transparent; overflow: hidden; font-family: Segoe UI, sans-serif; }
    .box {
      display: inline-flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-radius: 12px;
      background: rgba(14,17,22,.82); color: #e8eef7;
      border: 1px solid rgba(46,230,214,.35);
      box-shadow: 0 8px 24px rgba(0,0,0,.35);
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #2ee6d6; }
    .label { font-size: 13px; opacity: .7; }
    .title { font-size: 15px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="box">
    <span class="dot"></span>
    <div>
      <div class="label">2you Plugin</div>
      <div class="title">created by maxxxxxxxxam</div>
    </div>
  </div>
</body>
</html>
`,
    'utf8',
  )
}

function hasNativeObsDlls(dir: string): boolean {
  const walk = (d: string): boolean => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return false
    }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        if (walk(p)) return true
      } else if (/\.dll$/i.test(e.name) && !/plugin\.json$/i.test(e.name)) {
        return true
      }
    }
    return false
  }
  return walk(dir)
}

function loadManifest(dir: string): TwoYouPluginManifest | null {
  const file = path.join(dir, 'plugin.json')
  if (!fs.existsSync(file)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<TwoYouPluginManifest>
    if (!raw.id || !raw.name) return null
    return {
      id: String(raw.id),
      name: String(raw.name),
      version: String(raw.version || '0.0.0'),
      type: (raw.type as TwoYouPluginManifest['type']) || 'browser',
      entry: raw.entry ? String(raw.entry) : 'index.html',
      description: raw.description ? String(raw.description) : '',
      author: raw.author ? String(raw.author) : '',
    }
  } catch {
    return null
  }
}

function toInstalled(dir: string, state: PluginState): InstalledPlugin | null {
  const folder = path.basename(dir)
  const manifest = loadManifest(dir)
  const dllOnly = !manifest && hasNativeObsDlls(dir)

  if (dllOnly || manifest?.type === 'obs-native') {
    const id = manifest?.id || `obs-dll-${folder}`
    return {
      id,
      name: manifest?.name || folder,
      version: manifest?.version || '—',
      type: 'unsupported-obs',
      description:
        manifest?.description ||
        'Native OBS-Plugin (.dll). Läuft nur in OBS Studio, nicht in 2you.',
      author: manifest?.author || '',
      enabled: false,
      dir,
      entryUrl: null,
      warning:
        'OBS-.dll-Plugins sind nicht kompatibel. In OBS installieren und OBS-Fenster als Quelle in 2you aufnehmen — oder ein Browser-Plugin (plugin.json + HTML) verwenden.',
    }
  }

  if (!manifest) return null

  const entry = manifest.entry || 'index.html'
  const entryPath = path.join(dir, entry)
  const isBrowser = manifest.type === 'browser' || manifest.type === 'overlay'
  const enabled = state.enabled[manifest.id] !== false

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    type: isBrowser ? 'browser' : 'unsupported-obs',
    description: manifest.description || '',
    author: manifest.author || '',
    enabled: isBrowser ? enabled : false,
    dir,
    entryUrl:
      isBrowser && fs.existsSync(entryPath)
        ? pathToFileURL(entryPath).href
        : null,
    warning: isBrowser
      ? undefined
      : 'Dieser Plugin-Typ wird noch nicht unterstützt.',
  }
}

export function listPlugins(): InstalledPlugin[] {
  const root = ensurePluginsDir()
  const state = readState()
  const out: InstalledPlugin[] = []
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name)
    if (!fs.statSync(dir).isDirectory()) continue
    const plugin = toInstalled(dir, state)
    if (plugin) out.push(plugin)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export function setPluginEnabled(id: string, enabled: boolean): InstalledPlugin[] {
  const state = readState()
  state.enabled[id] = enabled
  writeState(state)
  return listPlugins()
}

export function removePlugin(id: string): InstalledPlugin[] {
  const plugins = listPlugins()
  const hit = plugins.find((p) => p.id === id)
  if (hit) {
    fs.rmSync(hit.dir, { recursive: true, force: true })
    const state = readState()
    delete state.enabled[id]
    writeState(state)
  }
  return listPlugins()
}

export async function openPluginsFolder(): Promise<string> {
  const root = ensurePluginsDir()
  await shell.openPath(root)
  return root
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDirRecursive(from, to)
    else fs.copyFileSync(from, to)
  }
}

export async function installPluginFromZip(): Promise<{
  ok: boolean
  error?: string
  plugins: InstalledPlugin[]
}> {
  const picked = await dialog.showOpenDialog({
    title: 'Plugin-ZIP auswählen',
    properties: ['openFile'],
    filters: [{ name: 'Plugin-Paket', extensions: ['zip'] }],
  })
  if (picked.canceled || !picked.filePaths[0]) {
    return { ok: false, error: 'Abgebrochen', plugins: listPlugins() }
  }

  const zipPath = picked.filePaths[0]
  const root = ensurePluginsDir()
  const tmp = path.join(app.getPath('temp'), `2you-plugin-${Date.now()}`)
  fs.mkdirSync(tmp, { recursive: true })

  try {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true },
    )

    // ZIP kann einen Root-Ordner enthalten oder Dateien lose
    let sourceDir = tmp
    const entries = fs.readdirSync(tmp, { withFileTypes: true })
    if (
      entries.length === 1 &&
      entries[0].isDirectory() &&
      !fs.existsSync(path.join(tmp, 'plugin.json'))
    ) {
      sourceDir = path.join(tmp, entries[0].name)
    }

    const manifest = loadManifest(sourceDir)
    const dlls = hasNativeObsDlls(sourceDir)

    if (!manifest && dlls) {
      return {
        ok: false,
        error:
          'Das ist ein natives OBS-Plugin (.dll). Solche Plugins funktionieren nur in OBS Studio — nicht in 2you. Tipp: OBS mit dem Plugin nutzen und das OBS-Fenster in 2you als Fenster-Quelle aufnehmen. Für 2you: ZIP mit plugin.json + HTML (Browser-Overlay).',
        plugins: listPlugins(),
      }
    }

    if (!manifest) {
      return {
        ok: false,
        error:
          'Kein plugin.json gefunden. 2you-Plugins brauchen eine plugin.json (type: browser, entry: index.html).',
        plugins: listPlugins(),
      }
    }

    const dest = path.join(root, manifest.id.replace(/[^\w.-]+/g, '_'))
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
    copyDirRecursive(sourceDir, dest)

    const state = readState()
    state.enabled[manifest.id] = true
    writeState(state)

    return { ok: true, plugins: listPlugins() }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      plugins: listPlugins(),
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

export async function installPluginFromFolder(): Promise<{
  ok: boolean
  error?: string
  plugins: InstalledPlugin[]
}> {
  const picked = await dialog.showOpenDialog({
    title: 'Plugin-Ordner auswählen (mit plugin.json)',
    properties: ['openDirectory'],
  })
  if (picked.canceled || !picked.filePaths[0]) {
    return { ok: false, error: 'Abgebrochen', plugins: listPlugins() }
  }

  const sourceDir = picked.filePaths[0]
  const manifest = loadManifest(sourceDir)
  const dlls = hasNativeObsDlls(sourceDir)

  if (!manifest && dlls) {
    return {
      ok: false,
      error:
        'Native OBS-.dll-Plugins können nicht in 2you geladen werden. Bitte in OBS Studio installieren.',
      plugins: listPlugins(),
    }
  }
  if (!manifest) {
    return {
      ok: false,
      error: 'Im Ordner fehlt plugin.json.',
      plugins: listPlugins(),
    }
  }

  const root = ensurePluginsDir()
  const dest = path.join(root, manifest.id.replace(/[^\w.-]+/g, '_'))
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
  copyDirRecursive(sourceDir, dest)

  const state = readState()
  state.enabled[manifest.id] = true
  writeState(state)
  return { ok: true, plugins: listPlugins() }
}
