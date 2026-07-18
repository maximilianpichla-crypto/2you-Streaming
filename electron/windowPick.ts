import {
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  screen,
} from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type PickKind = 'window' | 'game'

export interface PickedWindowResult {
  kind: PickKind
  title: string
  capturerId: string
}

let pickOverlay: BrowserWindow | null = null
let picking = false

/** Fenster-Titel unter Screen-Koordinaten (Windows) */
export async function getWindowTitleAtPoint(
  x: number,
  y: number,
): Promise<string | null> {
  if (process.platform !== 'win32') return null

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinPick {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@
$pt = New-Object WinPick+POINT
$pt.X = ${Math.round(x)}
$pt.Y = ${Math.round(y)}
$hwnd = [WinPick]::WindowFromPoint($pt)
if ($hwnd -eq [IntPtr]::Zero) { Write-Output ''; exit 0 }
$root = [WinPick]::GetAncestor($hwnd, 2)
if ($root -eq [IntPtr]::Zero) { $root = $hwnd }
if (-not [WinPick]::IsWindowVisible($root)) { Write-Output ''; exit 0 }
$sb = New-Object System.Text.StringBuilder 1024
[void][WinPick]::GetWindowText($root, $sb, $sb.Capacity)
Write-Output $sb.ToString()
`.trim()

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ],
      { windowsHide: true, timeout: 8000 },
    )
    const title = stdout.toString('utf8').trim()
    return title || null
  } catch {
    return null
  }
}

async function matchCapturerId(title: string): Promise<string> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 0, height: 0 },
  })
  const norm = title.trim().toLowerCase()
  const exact = sources.find((s) => s.name === title)
  if (exact) return exact.id
  const partial = sources.find(
    (s) =>
      s.name.toLowerCase().includes(norm) ||
      norm.includes(s.name.toLowerCase()),
  )
  return partial?.id ?? ''
}

function closeOverlay(): void {
  if (pickOverlay && !pickOverlay.isDestroyed()) {
    pickOverlay.destroy()
  }
  pickOverlay = null
}

export function isPickingWindow(): boolean {
  return picking
}

export function cancelWindowPick(): void {
  picking = false
  closeOverlay()
}

/**
 * Vollbild-Overlay: User klickt → Fenster unter dem Klick wird ermittelt.
 */
export async function startWindowPick(
  kind: PickKind,
  _parent: BrowserWindow | null,
): Promise<PickedWindowResult | null> {
  if (picking) {
    cancelWindowPick()
  }
  if (process.platform !== 'win32') {
    return null
  }

  picking = true

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.bounds

  const label =
    kind === 'game'
      ? 'Klicke auf ein Spiel / Fenster…'
      : 'Klicke auf ein Fenster…'
  const hint = 'Esc zum Abbrechen'

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  html,body{margin:0;height:100%;cursor:crosshair;background:rgba(8,12,18,.28);
  font-family:Segoe UI,sans-serif;user-select:none;}
  .banner{position:fixed;left:50%;top:10%;transform:translateX(-50%);
  background:rgba(17,24,32,.92);color:#eef3f7;padding:14px 22px;border-radius:12px;
  border:1px solid rgba(46,196,182,.45);box-shadow:0 16px 40px rgba(0,0,0,.4);
  text-align:center;pointer-events:none;}
  .banner strong{display:block;font-size:16px;margin-bottom:4px;}
  .banner span{font-size:12px;opacity:.75;}
</style></head><body>
<div class="banner"><strong>${label}</strong><span>${hint}</span></div>
<script>
  const { ipcRenderer } = require('electron');
  document.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ipcRenderer.send('pick:click', { x: e.screenX, y: e.screenY });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ipcRenderer.send('pick:overlay-cancel');
  });
</script></body></html>`

  return new Promise((resolve) => {
    let settled = false
    /** true = Overlay wird absichtlich geschlossen, um darunter zu hit-testen */
    let resolvingClick = false

    const cleanupListeners = () => {
      ipcMain.removeListener('pick:click', onClick)
      ipcMain.removeListener('pick:overlay-cancel', onCancel)
    }

    const finish = (result: PickedWindowResult | null) => {
      if (settled) return
      settled = true
      picking = false
      resolvingClick = false
      cleanupListeners()
      closeOverlay()
      resolve(result)
    }

    const onClick = async (
      _e: Electron.IpcMainEvent,
      point: { x: number; y: number },
    ) => {
      if (settled || resolvingClick) return
      resolvingClick = true

      // Overlay weg, damit WindowFromPoint das echte Ziel sieht —
      // closed-Handler darf hier NICHT mit null finishen.
      closeOverlay()
      await new Promise((r) => setTimeout(r, 120))

      const title = await getWindowTitleAtPoint(point.x, point.y)
      if (!title || /2you streaming/i.test(title)) {
        finish(null)
        return
      }
      const capturerId = await matchCapturerId(title)
      finish({ kind, title, capturerId })
    }

    const onCancel = () => finish(null)

    ipcMain.on('pick:click', onClick)
    ipcMain.on('pick:overlay-cancel', onCancel)

    // Kein parent: sonst deckt das Overlay nicht den ganzen Screen / andere Apps ab
    pickOverlay = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
      },
    })

    pickOverlay.setAlwaysOnTop(true, 'screen-saver')
    pickOverlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    pickOverlay.setMenu(null)

    pickOverlay.on('closed', () => {
      pickOverlay = null
      // Nur Abbruch, wenn nicht gerade ein Klick aufgelöst wird
      if (!settled && !resolvingClick) finish(null)
    })

    void pickOverlay.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    )
    pickOverlay.once('ready-to-show', () => {
      pickOverlay?.show()
      pickOverlay?.focus()
    })
  })
}
