/**
 * Patches vite-plugin-electron so Vite stays alive when Electron exits
 * and taskkill doesn't crash on missing PIDs (common on Windows).
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.join(
  process.cwd(),
  'node_modules',
  'vite-plugin-electron',
  'dist',
)

const files = ['index.js', 'index.mjs']

for (const name of files) {
  const file = path.join(root, name)
  if (!fs.existsSync(file)) continue
  let src = fs.readFileSync(file, 'utf8')
  let changed = false

  if (src.includes('cp.execSync(`taskkill /pid ${pid} /T /F`);')) {
    src = src.replace(
      `if (process.platform === "win32") {
    cp.execSync(\`taskkill /pid \${pid} /T /F\`);
  } else {`,
      `if (process.platform === "win32") {
    try {
      cp.execSync(\`taskkill /pid \${pid} /T /F\`, { stdio: "ignore" });
    } catch {
    }
  } else {`,
    )
    changed = true
  }

  if (src.includes('process.electronApp.once("exit", process.exit);')) {
    src = src.replace(
      'process.electronApp.once("exit", process.exit);',
      `process.electronApp.once("exit", () => {
    process.electronApp = void 0;
  });`,
    )
    changed = true
  }

  if (changed) {
    fs.writeFileSync(file, src)
    console.log(`[patch-vite-electron] ${name} aktualisiert`)
  }
}
