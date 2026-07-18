# 2you Streaming

Desktop-App zum Streamen auf Twitch, YouTube und Custom-RTMP (Windows).

## Für Streamer (empfohlen)

1. Installer von der [Releases-Seite](https://github.com/maximilianpichla-crypto/2you-Streaming/releases/latest) herunterladen  
   (`2you-Streaming-Setup-….exe`)
2. Setup ausführen (Installationsordner frei wählbar)
3. App starten — Desktop-Verknüpfung wird angelegt

Einstellungen bleiben bei Updates erhalten (werden nicht mit deinstalliert).

Quellcode oder den kompletten Projektordner brauchst du **nicht**.

## Für Entwickler

```bash
npm install
npm run fetch-ffmpeg
npm run dev
```

### Installer bauen & veröffentlichen

```bash
npm run electron:build          # nur lokal → Ordner release/
npm run release                 # bauen + GitHub Release mit Setup.exe
```

Danach liegt der Download unter GitHub Releases; `updates/feed.json` zeigt auf die Setup.exe.

### Windows SmartScreen / „Viren“-Warnung

Ohne **Code-Signing-Zertifikat** warnt Windows bei jedem Download („unbekannter Herausgeber“). Das lässt sich nicht wegklicken-programmieren — nur signieren.

1. OV Code-Signing-Zertifikat kaufen (z. B. SSL.com, Sectigo, DigiCert) oder Azure Trusted Signing
2. Als `certs/codesign.pfx` speichern
3. `copy .env.signing.example .env.signing` und Passwort eintragen
4. `npm run release` — electron-builder signiert die Setup.exe automatisch

Nach ein paar vertrauenswürdigen Downloads baut SmartScreen Reputation auf; die Warnung verschwindet dann für Nutzer.

## Technik

- Electron + React + Vite
- FFmpeg → RTMP/FLV
- WASAPI-Helper für Desktop-/Anwendungsaudio
