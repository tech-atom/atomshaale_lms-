@echo off
echo ==========================================
echo    Jango Compiler - Portable Setup
echo ==========================================
echo.
echo This will download and install all compilers
echo needed for Jango Compiler to work offline.
echo.
echo Languages that will be available:
echo   - Python (already available)
echo   - Java (OpenJDK 17)
echo   - C/C++ (MinGW GCC)
echo   - C#/.NET (SDK 6)
echo   - JavaScript (Node.js 18)
echo   - PHP (8.2)
echo   - Assembly (NASM)
echo.
echo Installation size: ~500MB total
echo Time required: 5-10 minutes
echo.
pause
echo.
echo Starting installation...
echo.

cd /d "%~dp0"
python quick_setup.py

echo.
echo Setup complete! Starting Jango Compiler...
echo.
echo Opening browser at http://127.0.0.1:8000/
echo.

start "" "http://127.0.0.1:8000/"
python manage.py runserver

pause
