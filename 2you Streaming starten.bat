@echo off
setlocal EnableExtensions
title 2you Streaming
cd /d "%~dp0"

echo.
echo   2you Streaming
echo   ---------------
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [Fehler] Node.js ist nicht installiert oder nicht im PATH.
  echo Bitte von https://nodejs.org herunterladen und installieren.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [Fehler] package.json nicht gefunden.
  echo Liegt diese Datei im Projektordner "2you Streaming"?
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Erste Einrichtung: Abhaengigkeiten werden installiert...
  echo Das kann ein paar Minuten dauern.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [Fehler] npm install ist fehlgeschlagen.
    pause
    exit /b 1
  )
  echo.
)

if not exist "resources\ffmpeg\ffmpeg.exe" (
  echo FFmpeg wird einmalig heruntergeladen...
  call npm run fetch-ffmpeg
  if errorlevel 1 (
    echo.
    echo [Hinweis] FFmpeg konnte nicht geladen werden.
    echo Streaming funktioniert ggf. erst nach "npm run fetch-ffmpeg".
    echo.
  )
)

echo Port 5173 freimachen (falls alter Dev-Server noch laeuft)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr /I "LISTENING ABH"') do (
  echo   Beende Prozess %%a
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo Starte 2you Streaming...
echo Fenster offen lassen. Zum Beenden: Strg+C oder App schliessen.
echo.
call npm run dev

echo.
if errorlevel 1 (
  echo [Fehler] Start fehlgeschlagen.
) else (
  echo 2you Streaming wurde beendet.
)
echo.
pause
endlocal
