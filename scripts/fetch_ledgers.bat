@echo off
REM Double-click this file in File Explorer to fetch ALL ledger accounts (the
REM full chart of accounts) from Tally - not just ones that appear in vouchers.

cd /d "%~dp0\.."

set TALLY_URL=http://localhost:9200
set REQUEST_XML=ledgers_request.xml
set OUTPUT_CSV=all_ledgers.csv

echo Fetching all ledgers from %TALLY_URL% ...
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
