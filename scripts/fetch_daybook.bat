@echo off
REM Double-click this file in File Explorer to fetch the Day Book data from Tally.
REM Edit the values below to change the Tally URL, request file, or output file.

cd /d "%~dp0\.."

set TALLY_URL=http://localhost:9200
set REQUEST_XML=request.xml
set OUTPUT_CSV=100086daybook2025.csv

echo Fetching Day Book data from %TALLY_URL% ...
echo Using request file: %REQUEST_XML%
echo Saving to: %OUTPUT_CSV%
echo.

curl -X POST %TALLY_URL% -H "Content-Type: text/xml" --data-binary "@%REQUEST_XML%" -o "%OUTPUT_CSV%"

echo.
echo Done. Check %OUTPUT_CSV% for the result.
echo If it starts with "^<RESPONSE^>Unknown Request" or is empty, something went wrong -
echo check that Tally is running with the gateway enabled on %TALLY_URL%, and that
echo %REQUEST_XML% exists in this folder.
echo.
echo Press any key to close this window.
pause >nul
