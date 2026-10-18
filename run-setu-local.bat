@echo off
title Setu local server
REM Double-click to run Setu locally. Leave this window open while testing.
REM Port 8093 is Setu's own (taken: Calendar 8080, Sukkiri 8091, Akatsuki 8092, Chatak 5080,
REM Scriptura 5144, Roadmap 5173, Cost 5174, JLPT 5180/8000).
REM Same-origin trap: this port does NOT share localStorage with the live site or other apps.
REM Signed in to the hub, your trips come from Supabase; signed out, this port starts empty.
cd /d "%~dp0"

set "ROOT=."
set "PORT=8093"
if not exist "%ROOT%\index.html" (
  echo Could not find index.html in this folder.
  echo Put this .bat in the same folder as index.html ^(your Setu folder^).
  echo Current folder: %CD%
  pause & goto :eof
)
if not exist "%ROOT%\Setu.dc.html" (
  echo Warning: Setu.dc.html is missing - Home will open, but Long trips will not.
  echo.
)

REM --- Find a Python: PATH first, then common Anaconda/Miniconda locations ---
REM (double-clicking uses plain cmd, where conda's PATH is usually NOT active,
REM  so we look for python.exe directly.)
set "PY="
for %%P in (
  "python.exe"
  "%USERPROFILE%\anaconda3\python.exe"
  "%USERPROFILE%\miniconda3\python.exe"
  "%USERPROFILE%\AppData\Local\anaconda3\python.exe"
  "%USERPROFILE%\AppData\Local\miniconda3\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
  "C:\ProgramData\anaconda3\python.exe"
  "C:\ProgramData\miniconda3\python.exe"
) do (
  if not defined PY (
    "%%~P" -c "import sys" >nul 2>nul && set "PY=%%~P"
  )
)

if not defined PY (
  echo.
  echo Could not find Python automatically.
  echo Open "Anaconda Prompt", cd to this folder, and run:
  echo     python -m http.server %PORT% --directory "%ROOT%"
  echo.
  pause & goto :eof
)

REM --- Refuse to start if the port is already in use (another Setu window?) ---
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul && (
  echo.
  echo Port %PORT% is already in use - Setu may already be running.
  echo Opening http://localhost:%PORT%/ instead.
  start "" "http://localhost:%PORT%/"
  pause & goto :eof
)

echo.
echo   Setu - day trips, places to eat, long trips - local server
echo   Python:  %PY%
echo   Serving: %ROOT%    Open: http://localhost:%PORT%/
echo   Sign-in needs http://localhost:%PORT%/** in Supabase redirect URLs.
echo   (Close this window to stop.)
echo.

start "" "http://localhost:%PORT%/"
"%PY%" -m http.server %PORT% --directory "%ROOT%"

echo.
echo Server stopped.
pause
