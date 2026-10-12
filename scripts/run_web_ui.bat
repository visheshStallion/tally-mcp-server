@echo off
REM Double-click this file to update, build, and start the Tally Reports web UI,
REM then print a link you can share with someone else on the same network to test it.
REM Edit the values below to change the port, Tally connection, or add a login.

cd /d "%~dp0\.."

set WEB_PORT=4000
set WEB_HOST=0.0.0.0
REM Leave CONFIG_TALLY_URL blank to use the default (http://localhost:9200).
set CONFIG_TALLY_URL=
set TALLY_COMPANY=
REM Leave both blank to run with no login (fine on a trusted private network only).
REM Set both to require a username/password before anyone can view or export data.
set WEB_USERNAME=
set WEB_PASSWORD=

REM Only pass TALLY_URL through when set above - an empty env var would
REM override the server's own default instead of falling back to it.
set "TALLY_URL="
if not "%CONFIG_TALLY_URL%"=="" set "TALLY_URL=%CONFIG_TALLY_URL%"

echo Pulling the latest changes...
git pull
if errorlevel 1 (
  echo.
  echo git pull failed - see the error above. Resolve it, then re-run this script.
  pause
  exit /b 1
)

echo.
echo Installing dependencies...
call npm install
if errorlevel 1 (
  echo.
  echo npm install failed - see the error above.
  pause
  exit /b 1
)

echo.
echo Building...
call npm run build
if errorlevel 1 (
  echo.
  echo Build failed - see the error above.
  pause
  exit /b 1
)

set LOCALIP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R /C:"IPv4 Address"') do (
  if not defined LOCALIP set LOCALIP=%%a
)
set LOCALIP=%LOCALIP: =%

echo.
echo Starting the server in a new window...
start "Tally Reports Server" cmd /k npm run web

echo Waiting for it to come up...
timeout /t 3 /nobreak >nul

start "" "http://localhost:%WEB_PORT%"

echo.
echo ================================================================
echo  Open it yourself at:   http://localhost:%WEB_PORT%
if defined LOCALIP (
  echo  Share this link with someone else on the same network/Wi-Fi:
  echo    http://%LOCALIP%:%WEB_PORT%
) else (
  echo  Could not auto-detect this PC's network IP - run "ipconfig" and
  echo  use the IPv4 Address shown there in place of "localhost" above.
)
if "%WEB_USERNAME%"=="" (
  echo.
  echo  No login is set - anyone who opens that link can view and export
  echo  your Tally data. Edit WEB_USERNAME/WEB_PASSWORD above before
  echo  sharing it outside a network you trust.
) else (
  echo  Login required - username: %WEB_USERNAME%
)
echo.
echo  The server runs in the separate "Tally Reports Server" window -
echo  closing that window stops it. This window can be closed any time.
echo ================================================================
echo.
pause >nul
