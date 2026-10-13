@echo off
REM One-time setup (double-click once): registers a custom "tallyweb://"
REM link on THIS machine, so that opening a link like "tallyweb://start"
REM (e.g. from a desktop shortcut, Start Menu search, or pasted into a
REM browser address bar) launches run_web_ui.bat from this same folder.
REM
REM This only works on a machine where this script has already been run -
REM it is a personal convenience shortcut, not something you can hand to
REM someone else's computer and have it work there too.
REM
REM Every time the link is actually clicked from inside a browser, the
REM browser will show a one-time confirmation popup ("Open Tally Web UI
REM Launcher?") before running it. This cannot be removed - it is the
REM browser's built-in security check for all custom-protocol links, not
REM specific to this script.
REM
REM This only touches your own Windows user registry (HKCU) - no admin
REM rights needed. Run unregister_tallyweb_link.bat to remove it again.

set SCRIPT=%~dp0run_web_ui.bat

reg add "HKCU\Software\Classes\tallyweb" /ve /d "URL:Tally Web UI Launcher" /f
reg add "HKCU\Software\Classes\tallyweb" /v "URL Protocol" /t REG_SZ /d "" /f
reg add "HKCU\Software\Classes\tallyweb\shell\open\command" /ve /d "\"%ComSpec%\" /c \"%SCRIPT%\"" /f

if errorlevel 1 (
  echo.
  echo Something went wrong registering the link - see the error above.
  pause
  exit /b 1
)

echo.
echo ================================================================
echo  Done. This link now launches:
echo    %SCRIPT%
echo.
echo  Use it as:
echo    tallyweb://start
echo.
echo  Paste that into this browser's address bar, or save it as a
echo  desktop shortcut target, to launch the Tally Reports server.
echo  The browser will ask you to confirm the first time (and may ask
echo  again later) - that confirmation step can't be skipped.
echo.
echo  To remove this later, run unregister_tallyweb_link.bat.
echo ================================================================
echo.
pause
