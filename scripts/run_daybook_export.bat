@echo off
REM Double-click this file in File Explorer to run the Day Book -> Excel conversion.
REM Edit the values below to change the input file, output file, or date range.

cd /d "%~dp0\.."

set INPUT_CSV=daybook_complete.csv
set OUTPUT_XLSX=Tally_Day_Book_Complete.xlsx
REM Leave FROM_DATE / TO_DATE blank for a complete export covering all dates.
set FROM_DATE=
set TO_DATE=
set COMPANY_NAME=

set EXTRA_ARGS=
if not "%FROM_DATE%"=="" set EXTRA_ARGS=%EXTRA_ARGS% --from-date %FROM_DATE%
if not "%TO_DATE%"=="" set EXTRA_ARGS=%EXTRA_ARGS% --to-date %TO_DATE%
if not "%COMPANY_NAME%"=="" set EXTRA_ARGS=%EXTRA_ARGS% --company "%COMPANY_NAME%"

echo Converting %INPUT_CSV% to %OUTPUT_XLSX% ...
echo.

python scripts\tally_daybook_to_excel.py "%INPUT_CSV%" "%OUTPUT_XLSX%"%EXTRA_ARGS%

echo.
echo Done. Press any key to close this window.
pause >nul
