@echo off
REM Double-click this file in File Explorer to run the Day Book -> Excel conversion.
REM Edit the values below to change the input file, output file, or date range.

cd /d "%~dp0\.."

set INPUT_CSV=daybook2025.csv
set OUTPUT_XLSX=Tally_Day_Book_2025.xlsx
set FROM_DATE=2025-01-01
set TO_DATE=2025-12-31
set COMPANY_NAME=

echo Converting %INPUT_CSV% to %OUTPUT_XLSX% ...
echo.

if "%COMPANY_NAME%"=="" (
    python scripts\tally_daybook_to_excel.py "%INPUT_CSV%" "%OUTPUT_XLSX%" --from-date %FROM_DATE% --to-date %TO_DATE%
) else (
    python scripts\tally_daybook_to_excel.py "%INPUT_CSV%" "%OUTPUT_XLSX%" --from-date %FROM_DATE% --to-date %TO_DATE% --company "%COMPANY_NAME%"
)

echo.
echo Done. Press any key to close this window.
pause >nul
