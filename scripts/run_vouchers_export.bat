@echo off
REM Double-click this file to run list_vouchers and convert the result to Excel.
REM Edit the values below to change the date range, output file, or company name.

cd /d "%~dp0\.."

set FROM_DATE=2026-01-01
set TO_DATE=2026-12-31
set OUTPUT_JSON=vouchers_output.json
set OUTPUT_XLSX=Tally_Vouchers.xlsx
set COMPANY_NAME=

echo Fetching vouchers from %FROM_DATE% to %TO_DATE% ...
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/call --tool-name list_vouchers --tool-arg fromDate=%FROM_DATE% --tool-arg toDate=%TO_DATE% --format json > "%OUTPUT_JSON%"

echo.
echo Converting to %OUTPUT_XLSX% ...

set EXTRA_ARGS=
if not "%COMPANY_NAME%"=="" set EXTRA_ARGS=%EXTRA_ARGS% --company "%COMPANY_NAME%"

python scripts\tally_vouchers_to_excel.py "%OUTPUT_JSON%" "%OUTPUT_XLSX%"%EXTRA_ARGS%

echo.
echo Done. Press any key to close this window.
pause >nul
