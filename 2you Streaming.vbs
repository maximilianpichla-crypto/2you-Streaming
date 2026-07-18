' Doppelklick-Starter ohne hässliches CMD-Fenster im Vordergrund.
' Startet "2you Streaming starten.bat" im gleichen Ordner.

Option Explicit
Dim sh, fso, folder, bat, code

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

folder = fso.GetParentFolderName(WScript.ScriptFullName)
bat = folder & "\2you Streaming starten.bat"

If Not fso.FileExists(bat) Then
  MsgBox "Startdatei nicht gefunden:" & vbCrLf & bat, vbCritical, "2you Streaming"
  WScript.Quit 1
End If

sh.CurrentDirectory = folder
' 1 = normales Fenster (Logs sichtbar), False = nicht warten
code = sh.Run("""" & bat & """", 1, False)
WScript.Quit 0
