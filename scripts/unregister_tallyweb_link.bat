@echo off
REM Removes the "tallyweb://" link registered by register_tallyweb_link.bat.
REM After this, tallyweb:// links will no longer do anything.

reg delete "HKCU\Software\Classes\tallyweb" /f

echo.
echo Removed. tallyweb:// links will no longer do anything on this machine.
pause
