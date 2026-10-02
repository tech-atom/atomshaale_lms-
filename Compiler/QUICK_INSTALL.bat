@echo off
echo ==========================================
echo    Jango Compiler - Quick Install
echo ==========================================
echo.
echo This will install the most commonly used compilers:
echo   - Java (OpenJDK 17) - ~180MB
echo   - Node.js (JavaScript) - ~35MB
echo.
echo Total download: ~215MB
echo Time required: 2-3 minutes
echo.
pause
echo.

cd /d "%~dp0\portable_compilers"
python quick_install.py

echo.
echo Quick install complete!
echo.
echo To install more languages, visit: http://127.0.0.1:8000/setup/
echo.
pause
