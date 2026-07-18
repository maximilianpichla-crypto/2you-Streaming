; 2you Streaming — eigene Installer-Oberfläche (NSIS / MUI2)
; Wird von electron-builder über nsis.include eingebunden.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER
Var TwoYouDialog
Var TwoYouTitle
Var TwoYouBody
Var TwoYouHint

Function TwoYouFeaturesPage
  nsDialogs::Create 1018
  Pop $TwoYouDialog
  ${If} $TwoYouDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 28u "Was dich erwartet"
  Pop $TwoYouTitle
  CreateFont $0 "Segoe UI Semibold" 14 700
  SendMessage $TwoYouTitle ${WM_SETFONT} $0 0

  ${NSD_CreateLabel} 0 36u 100% 90u "• Szenen & Quellen für deinen Stream$\r$\n• Audio (Mikrofon, Desktop, App-Ton)$\r$\n• Twitch-Chat & Alert-Box$\r$\n• Encoder-Einstellungen (einfach & fortgeschritten)$\r$\n• Automatische Updates im Hintergrund"
  Pop $TwoYouBody
  CreateFont $1 "Segoe UI" 10 400
  SendMessage $TwoYouBody ${WM_SETFONT} $1 0

  ${NSD_CreateLabel} 0 140u 100% 36u "Tipp: Nach der Installation kannst du den Installationsordner jederzeit unter Einstellungen prüfen."
  Pop $TwoYouHint
  CreateFont $2 "Segoe UI" 9 400
  SendMessage $TwoYouHint ${WM_SETFONT} $2 0

  nsDialogs::Show
FunctionEnd
!endif

!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_FINISHPAGE_TITLE_3LINES
  !define MUI_FINISHPAGE_RUN_TEXT "2you Streaming jetzt starten"
  !define MUI_FINISHPAGE_TITLE "Installation abgeschlossen"
  !define MUI_FINISHPAGE_TEXT "2you Streaming ist bereit.$\r$\n$\r$\nDu kannst Szenen, Audio und Stream-Ziele direkt in der App einrichten. Updates werden künftig automatisch geladen."
!macroend

!macro customWelcomePage
  !ifndef BUILD_UNINSTALLER
    !ifdef MUI_WELCOMEPAGE_TITLE
      !undef MUI_WELCOMEPAGE_TITLE
    !endif
    !ifdef MUI_WELCOMEPAGE_TEXT
      !undef MUI_WELCOMEPAGE_TEXT
    !endif
    !define MUI_WELCOMEPAGE_TITLE "Willkommen bei 2you Streaming"
    !define MUI_WELCOMEPAGE_TEXT "Dieser Assistent installiert 2you Streaming auf deinem PC.$\r$\n$\r$\nDie App bringt Streaming, Chat und Alerts in einer Oberfläche zusammen — ohne umständliche Zusatztools.$\r$\n$\r$\nKlicke auf Weiter, um fortzufahren."
    !insertmacro MUI_PAGE_WELCOME
    Page custom TwoYouFeaturesPage
  !endif
!macroend

!macro customUnWelcomePage
  !ifdef MUI_WELCOMEPAGE_TITLE
    !undef MUI_WELCOMEPAGE_TITLE
  !endif
  !ifdef MUI_WELCOMEPAGE_TEXT
    !undef MUI_WELCOMEPAGE_TEXT
  !endif
  !define MUI_WELCOMEPAGE_TITLE "2you Streaming entfernen"
  !define MUI_WELCOMEPAGE_TEXT "Dieser Assistent entfernt 2you Streaming von diesem Computer.$\r$\n$\r$\nDeine Einstellungen bleiben erhalten, sofern du App-Daten nicht manuell löschst.$\r$\n$\r$\nKlicke auf Weiter, um fortzufahren."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
