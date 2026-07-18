# 2you Streaming

Desktop-App zum Streamen auf Twitch, YouTube und Custom-RTMP (Windows).

## Voraussetzungen

- Node.js 20+
- Windows 10/11

## Setup

```bash
npm install
npm run fetch-ffmpeg
npm run dev
```

`npm run dev` startet Vite + Electron.

## Quellen (OBS-ähnlich)

Über **+ Quelle (wie OBS)** kannst du u. a. hinzufügen:

- Bildschirm- / Fenster- / Spielaufnahme
- Videoaufnahmegerät (Webcam)
- Audio-Eingabe / -Ausgabe / Anwendungsaudio
- Browserquelle, Bild, Bilddiashow, Medienquelle
- Text, Farbquelle, eingebettete Szene


## Technik

- Electron + React + Vite
- FFmpeg (`gdigrab` + optional DirectShow-Mikrofon) → RTMP/FLV

## Hinweise

- v1 erfasst den Desktop per FFmpeg `gdigrab` und sendet an RTMP
- Webcam erscheint in der Vorschau; der Live-Encode nutzt in v1 primär den Bildschirm
- Für Twitch den Stream-Key aus dem Creator Dashboard verwenden
